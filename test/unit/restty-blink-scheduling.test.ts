import { copyFile, cp, mkdtemp, readFile, rm } from "node:fs/promises";
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
    declarationRoot: path.join(root, "declarations"),
  };
  try {
    await Promise.all([
      cp(
        path.join(dist, "input"),
        path.join(options.declarationRoot, "input"),
        {
          recursive: true,
        },
      ),
      cp(path.join(dist, "wasm"), path.join(options.declarationRoot, "wasm"), {
        recursive: true,
      }),
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

function extract(pattern: RegExp) {
  const match = source.match(pattern);
  expect(match).not.toBeNull();
  return match?.[1] ?? match?.[0] ?? "";
}

function harness(start = 599) {
  let now = start;
  let nextFrame: (() => void) | undefined;
  let nextTimerId = 0;
  const timers = new Map<number, { callback: () => void; due: number }>();
  const paints: number[] = [];
  const frames: number[] = [];
  const environment = {
    performance: { now: () => now },
    document: { visibilityState: "visible" },
    requestAnimationFrame: (callback: () => void) => {
      expect(nextFrame).toBeUndefined();
      nextFrame = callback;
      return 1;
    },
    cancelAnimationFrame: () => {
      nextFrame = undefined;
    },
    setTimeout: (callback: () => void, delay: number) => {
      nextTimerId += 1;
      timers.set(nextTimerId, { callback, due: now + delay });
      return nextTimerId;
    },
    clearTimeout: (id: number) => {
      timers.delete(id);
    },
    render: { CURSOR_BLINK_MS: 600, initialPreferredRenderer: "webgl2" },
  };
  // Execute the actual production factory and controller initialization, not
  // a copied scheduler. Exact markers fail closed on a changed dependency.
  const loopSource = extract(
    /function createRuntimeControllerRenderLoop\(options\) \{[\s\S]*?(?=\n\/\/ src\/runtime\/create-runtime\/runtime-controller.ts)/u,
  );
  const initialState = extract(
    /function createRuntimeController\(options\) \{[\s\S]*?const internalState = (\{[\s\S]*?\n  \});/u,
  );
  const internalState = runInNewContext(`(${initialState})`, environment) as {
    paused: boolean;
    backend: string;
    nextBlinkTime: number;
    rafId: number;
    idleTimer: number;
  };
  internalState.backend = "webgl2";
  const state = { gl: {} };
  const shared = {
    wasmReady: true,
    wasmHandle: 1,
    wasm: {
      tickKittyAnimations: () => controls.animating,
      renderUpdate: () => {},
    },
    needsRender: false,
    lastRenderTime: 0,
    activeState: state as { gl: object } | null,
  };
  const controls = {
    visible: true,
    synchronized: false,
    animating: false,
    cacheClears: 0,
  };
  const resizeState = { lastAt: -10000 };
  const options = {
    internalState,
    CURSOR_BLINK_MS: 600,
    RESIZE_ACTIVE_MS: 100,
    BACKGROUND_RENDER_FPS: 2,
    resizeState,
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
  ) => {
    loop: (state: { gl: object }) => void;
    wake: () => void;
    refresh: () => void;
  };
  const runtime = factory(options);
  const runFrame = () => {
    const callback = nextFrame;
    nextFrame = undefined;
    frames.push(now);
    callback?.();
  };
  // Fire timers that are due by `time` at their own deadlines.
  const fireTimers = (time: number) => {
    for (;;) {
      const due = [...timers].sort((a, b) => a[1].due - b[1].due)[0];
      if (!due || due[1].due > time) return;
      timers.delete(due[0]);
      now = Math.max(now, due[1].due);
      due[1].callback();
    }
  };
  runtime.loop(state);
  return {
    paints,
    frames,
    timers,
    internalState,
    shared,
    controls,
    resizeState,
    environment,
    runtime,
    options,
    get framePending() {
      return nextFrame !== undefined;
    },
    // One display opportunity: due timers first, then any requested frame.
    frame(time: number) {
      fireTimers(time);
      now = time;
      if (nextFrame) runFrame();
    },
    // A 60 Hz display between two instants.
    vsync(from: number, to: number) {
      for (let time = from; time <= to; time += 1000 / 60) this.frame(time);
    },
    invalidate(time: number) {
      now = time;
      shared.needsRender = true;
      runtime.wake();
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
  // Tab selection refits, which invalidates and wakes the sleeping loop.
  h.runtime.wake();
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
  // Unpausing reports nothing; the idle poll resumes the current phase.
  h.vsync(1801, 2420);
  expect(h.paints[0]).toBeLessThanOrEqual(1801 + 250 + 1000 / 60);
  expect(h.paints.at(-1)).toBeGreaterThanOrEqual(2400);
  expect(h.paints).toHaveLength(2);
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

it("leaves vsync once quiet and wakes only for blink phases and the idle poll", () => {
  const h = harness(0);
  h.vsync(0, 6010);
  // The legacy loop requested a frame on every 60 Hz opportunity (~360).
  expect(h.frames.length).toBeLessThan(60);
  // Blink phases still present on the first frame at or after each boundary.
  expect(h.paints).toHaveLength(10);
  for (const [index, paint] of h.paints.entries())
    expect(paint).toBeGreaterThanOrEqual((index + 1) * 600);
  // Sleeping intervals never exceed the poll bound or skip a blink phase.
  for (const [index, frame] of h.frames.slice(1).entries())
    expect(frame - h.frames[index]!).toBeLessThanOrEqual(250 + 1000 / 60);
});

it("wakes a sleeping loop on the next frame after any invalidation", () => {
  const h = harness(0);
  h.vsync(0, 1100);
  expect(h.framePending).toBe(false);
  expect(h.timers.size).toBe(1);
  h.invalidate(1101);
  // The poll timer is retired and the very next display frame presents.
  expect(h.timers.size).toBe(0);
  expect(h.framePending).toBe(true);
  h.frame(1110);
  expect(h.paints.at(-1)).toBe(1110);
  // A wake while already on vsync does not request a second frame.
  h.invalidate(1111);
  h.invalidate(1112);
  h.frame(1127);
  expect(h.paints.at(-1)).toBe(1127);
});

it("stays on vsync while output keeps arriving and for a grace period after", () => {
  const h = harness(0);
  h.invalidate(1000);
  for (let time = 1000; time <= 2100; time += 1000 / 60) {
    h.frame(time);
    if (time < 1500) h.invalidate(time);
  }
  const vsyncFrames = h.frames.filter((frame) => frame >= 1000 && frame < 1990);
  // Every 60 Hz opportunity is used until 500 ms after the last invalidation.
  expect(vsyncFrames.length).toBeGreaterThanOrEqual(59);
  expect(h.framePending).toBe(false);
  expect(h.timers.size).toBe(1);
});

it("keeps vsync during resize settling, animation and deferred presentation", () => {
  const settle = harness(0);
  settle.vsync(0, 1000);
  settle.resizeState.lastAt = 1000;
  settle.invalidate(1000);
  settle.vsync(1000, 1050);
  settle.frame(1060);
  expect(settle.paints.filter((paint) => paint >= 1000).length).toBe(5);

  const animation = harness(0);
  animation.controls.animating = true;
  animation.invalidate(0);
  animation.vsync(0, 2000);
  expect(animation.frames.length).toBeGreaterThan(110);
  animation.controls.animating = false;
  animation.vsync(2000, 4000);
  expect(animation.framePending).toBe(false);

  const synchronized = harness(0);
  synchronized.controls.synchronized = true;
  synchronized.invalidate(0);
  synchronized.vsync(0, 2000);
  expect(synchronized.paints).toEqual([]);
  expect(synchronized.frames.length).toBeGreaterThan(110);
  synchronized.controls.synchronized = false;
  synchronized.frame(2010);
  expect(synchronized.paints).toEqual([2010]);
});

it("polls a hidden Surface instead of using vsync and presents soon after reveal", () => {
  const h = harness(0);
  h.controls.visible = false;
  h.invalidate(0);
  h.vsync(0, 2000);
  expect(h.paints).toEqual([]);
  expect(h.frames.length).toBeLessThan(20);
  // A reveal that reports nothing still presents within the poll bound.
  h.controls.visible = true;
  h.vsync(2001, 2400);
  expect(h.paints).toHaveLength(1);
  expect(h.paints[0]).toBeLessThanOrEqual(2001 + 250 + 1000 / 60);
});

it("does not restart after lifecycle teardown cancels a sleeping loop", () => {
  const h = harness(0);
  const lifecycleSource = extract(
    /function createRuntimeControllerLifecycle\(options\) \{[\s\S]*?(?=\n\/\/ src\/runtime\/create-runtime\/runtime-controller.public-api)/u,
  );
  const noop = () => {};
  const lifecycle = (
    runInNewContext(`(${lifecycleSource})`, h.environment) as (
      input: object,
    ) => { init: () => Promise<void>; destroy: () => void }
  )({
    runtimeEvents: { emit: noop },
    lifecycleThemeSizeRuntime: { cancelScheduledSizeUpdate: noop },
    ptyInputRuntime: { cancelSyncOutputReset: noop, disconnectPty: noop },
    ptyTransport: {},
    cleanupFns: [],
    cleanupCanvasFns: [],
    readState: h.options.readState,
    writeState: h.options.writeState,
    updateSize: noop,
    // Initialization stops at its first await; the old loop must be gone.
    ensureFont: () => new Promise(noop),
    clearWebGPUShaderStages: noop,
    destroyWebGPUStageTargets: noop,
    clearWebGLShaderStages: noop,
    destroyWebGLStageTargets: noop,
    internalState: h.internalState,
  });
  h.vsync(0, 1100);
  expect(h.timers.size).toBe(1);
  void lifecycle.init();
  expect(h.timers.size).toBe(0);
  h.invalidate(1200);
  expect(h.framePending).toBe(false);

  h.runtime.loop({ gl: {} });
  h.vsync(1200, 2400);
  expect(h.timers.size).toBe(1);
  lifecycle.destroy();
  expect(h.timers.size).toBe(0);
  h.invalidate(2500);
  h.vsync(2500, 4000);
  expect(h.framePending).toBe(false);
  expect(h.timers.size).toBe(0);
});
