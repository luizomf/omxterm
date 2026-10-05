import { copyFile, mkdtemp, readFile, rm } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { beforeAll, expect, it } from "vitest";
import { prepareResttyRuntime } from "../../scripts/prepare-restty-runtime.mjs";

const dist = path.dirname(createRequire(import.meta.url).resolve("restty"));
let source: string;
beforeAll(async () => {
  // Never prepare the shared installation: native fixtures may be using it.
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-blink-"));
  const options = {
    runtimePath: path.join(root, "runtime.js"),
    corePath: path.join(root, "core.js"),
    eventTypesPath: path.join(root, "events.d.ts"),
  };
  try {
    await Promise.all([
      copyFile(path.join(dist, "chunk-c0rcpsc5.js"), options.runtimePath),
      copyFile(path.join(dist, "chunk-6dxqza9q.js"), options.corePath),
      copyFile(
        path.join(dist, "runtime/core/runtime-events.d.ts"),
        options.eventTypesPath,
      ),
    ]);
    await prepareResttyRuntime(options);
    source = await readFile(options.runtimePath, "utf8");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

function harness(start = 599) {
  let now = start;
  let nextFrame: (() => void) | undefined;
  const paints: number[] = [];
  const environment = {
    performance: { now: () => now },
    document: { visibilityState: "visible" },
    requestAnimationFrame: (callback: () => void) => {
      nextFrame = callback;
      return 1;
    },
    render: { CURSOR_BLINK_MS: 600, initialPreferredRenderer: "webgl2" },
  };
  // Execute the actual production factory and controller initialization, not
  // a copied scheduler. Exact markers fail closed on a changed dependency.
  const loopSource = source.match(
    /function createRuntimeControllerRenderLoop\(options\) \{[\s\S]*?(?=\n\/\/ src\/runtime\/create-runtime\/runtime-controller.ts)/u,
  )?.[0];
  const initialState = source.match(
    /function createRuntimeController\(options\) \{[\s\S]*?const internalState = (\{[\s\S]*?\n  \});/u,
  )?.[1];
  expect(loopSource).toBeDefined();
  expect(initialState).toBeDefined();
  const internalState = runInNewContext(`(${initialState})`, environment) as {
    paused: boolean;
    backend: string;
    nextBlinkTime: number;
  };
  internalState.backend = "webgl2";
  const state = { gl: {} };
  const shared = {
    wasmReady: true,
    wasmHandle: 1,
    wasm: { tickKittyAnimations: () => false, renderUpdate: () => {} },
    needsRender: false,
    lastRenderTime: 0,
    activeState: state,
  };
  const controls = { visible: true, synchronized: false, cacheClears: 0 };
  const options = {
    internalState,
    CURSOR_BLINK_MS: 600,
    RESIZE_ACTIVE_MS: 100,
    BACKGROUND_RENDER_FPS: 2,
    resizeState: { lastAt: -10000 },
    isSurfaceVisible: () => controls.visible,
    clearKittyRenderCaches: () => {
      controls.cacheClears += 1;
    },
    isSynchronizedOutput: () => controls.synchronized,
    readState: () => shared,
    writeState: (patch: Partial<typeof shared>) => Object.assign(shared, patch),
    tickWebGL: () => paints.push(now),
  };
  const factory = runInNewContext(`(${loopSource})`, environment) as (
    input: typeof options,
  ) => { loop: (state: { gl: object }) => void; refresh: () => void };
  const runtime = factory(options);
  runtime.loop(state);
  return {
    paints,
    internalState,
    shared,
    controls,
    environment,
    runtime,
    frame(time: number) {
      now = time;
      const callback = nextFrame;
      nextFrame = undefined;
      expect(callback).toBeTypeOf("function");
      callback?.();
    },
  };
}

it("schedules the first invalidation at the renderer phase boundary", () => {
  const h = harness(599);
  h.frame(600);
  h.frame(1199);
  h.frame(1200);
  expect(h.paints).toEqual([600, 1200]);
});

it("renders every available absolute blink phase after an offset and late RAF", () => {
  const h = harness();
  // Reproduce an already-running controller whose old deadline is offset.
  h.internalState.nextBlinkTime = 1199;
  for (const time of [
    1199, 1200, 1300, 1400, 1500, 1600, 1700, 1798, 1801, 1900, 2000, 2100,
    2200, 2300, 2401,
  ])
    h.frame(time);
  // Real emitters use absolute 600ms phases: hidden, visible, hidden, visible.
  expect(h.paints).toEqual([1199, 1200, 1801, 2401]);
});

it("does not drift after a missed phase or draw repeatedly within one phase", () => {
  const h = harness(0);
  for (const time of [599, 600, 601, 1199, 1799, 1800, 1801, 2399, 2400])
    h.frame(time);
  expect(h.paints).toEqual([600, 1799, 1800, 2400]);
});

it("suppresses hidden Surface draws and resumes on the current phase", () => {
  const h = harness();
  h.controls.visible = false;
  h.frame(600);
  h.frame(1799);
  expect(h.paints).toEqual([]);
  expect(h.controls.cacheClears).toBe(2);
  h.controls.visible = true;
  h.frame(1801);
  h.frame(2399);
  h.frame(2400);
  expect(h.paints).toEqual([1801, 2400]);
});

it("keeps pause authoritative even for forced refresh", () => {
  const h = harness();
  h.internalState.paused = true;
  h.frame(600);
  h.runtime.refresh();
  h.frame(1799);
  expect(h.paints).toEqual([]);
  h.internalState.paused = false;
  h.frame(1801);
  h.frame(2400);
  expect(h.paints).toEqual([1801, 2400]);
});

it("retains blink invalidation during synchronized output without presenting", () => {
  const h = harness();
  h.controls.synchronized = true;
  h.frame(600);
  h.runtime.refresh();
  h.frame(1201);
  expect(h.paints).toEqual([]);
  expect(h.shared.needsRender).toBe(true);
  h.controls.synchronized = false;
  h.frame(1300);
  h.frame(1799);
  h.frame(1800);
  expect(h.paints).toEqual([1300, 1800]);
});

it("retains the background document budget and the visible refresh bypass", () => {
  const h = harness();
  h.environment.document.visibilityState = "hidden";
  h.shared.lastRenderTime = 599;
  h.frame(600);
  h.frame(1098);
  expect(h.paints).toEqual([]);
  h.frame(1099);
  h.frame(1200);
  expect(h.paints).toEqual([1099]);
  expect(h.shared.needsRender).toBe(true);
  h.runtime.refresh();
  expect(h.paints).toEqual([1099, 1200]);
});

it("does not present until the core is ready", () => {
  const h = harness();
  h.shared.wasmReady = false;
  h.frame(600);
  h.frame(1200);
  expect(h.paints).toEqual([]);
  h.shared.wasmReady = true;
  h.frame(1300);
  h.frame(1800);
  expect(h.paints).toEqual([1300, 1800]);
});
