import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { loadResttyWasm } from "restty/internal";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";
import { resttyFontMutationProbe } from "../fixtures/restty-font-mutation-probe";
import { expect, it } from "vitest";
import {
  instrumentResttyLinkDestination,
  instrumentResttyLinkPreview,
  resttyLinkReadinessProbe,
  type createLinkDestinationObserver,
} from "../fixtures/restty-link-readiness-probe";

// Run the actual injected runtime hooks against real core-produced cells.
// Frame submission is modeled; this establishes no GPU/native pixel evidence.
const source = instrumentResttyLinkDestination(
  readFileSync("node_modules/restty/dist/chunk-c0rcpsc5.js", "utf8"),
);
const start = source.indexOf("  canvas.__resttyLinkDestinationFixture =");
// Keep only the observation initializer/cleanup, not adjacent runtime code.
const initializer = source.slice(start, source.indexOf("\n  });", start) + 7);
const write = source.slice(
  source.indexOf("  function writeToWasm(handle, text) {"),
  source.indexOf("  function flushWasmOutputToPty() {"),
);
const tick = source.slice(
  source.indexOf("function tickWebGL(deps, state) {"),
  source.indexOf(
    "// src/runtime/create-runtime/render-tick-webgpu-cell-pass.ts",
  ),
);

it("observes only a matching submitted current frame and invalidates on subsequent core output", async () => {
  const wasm = await loadResttyWasm();
  const handle = wasm.create(80, 20, 10_000_000);
  const canvas = {} as {
    __resttyLinkDestinationFixture?: ReturnType<
      typeof createLinkDestinationObserver
    >;
  };
  const cleanupFns: Array<() => void> = [];
  let frame: ReturnType<typeof wasm.getRenderState>;
  const runtime = runInNewContext(
    `${initializer}\n${write}\n${tick}\n({ writeToWasm, tickWebGL });`,
    {
      canvas,
      cleanupFns,
      options: { getCanvas: () => canvas, readState: () => ({ wasm }) },
      // The pinned context exposes cols/rows/codepoints directly, not render.
      buildWebGLTickContext: () => frame ?? null,
      populateWebGLSceneData() {},
      populateWebGLOverlays() {},
      renderWebGLGlyphPipeline() {},
    },
  ) as {
    writeToWasm(handle: number, text: string): void;
    tickWebGL(deps: { canvas: typeof canvas }, state: object): void;
  };
  try {
    const observer = canvas.__resttyLinkDestinationFixture!;
    observer.prepare("../image.png");
    runtime.writeToWasm(handle, "~/old.png");
    wasm.renderUpdate(handle); // the producer, never the observer, prepares cells
    frame = wasm.getRenderState(handle);
    runtime.tickWebGL({ canvas }, {});
    expect(observer.snapshot()).toMatchObject({
      cols: 80,
      rows: 20,
      matches: false,
    });

    runtime.writeToWasm(handle, "\u001b[2J\u001b[H../image.png");
    expect(observer.snapshot()).toBeUndefined();
    wasm.renderUpdate(handle);
    frame = wasm.getRenderState(handle);
    const beforeBytes = frame!.codepoints!.byteLength;
    const memoryBytes = wasm.memory.buffer.byteLength;
    const selection = wasm.getSelectionText;
    const update = wasm.renderUpdate;
    wasm.getSelectionText = () => {
      throw new Error("Observer allocated selection text");
    };
    wasm.renderUpdate = () => {
      throw new Error("Observer prepared core state");
    };
    try {
      runtime.tickWebGL({ canvas }, {});
      expect(observer.snapshot()).toMatchObject({
        cols: 80,
        rows: 20,
        matches: true,
      });
      expect(frame!.codepoints!.byteLength).toBe(beforeBytes);
      expect(wasm.memory.buffer.byteLength).toBe(memoryBytes);
      runtime.writeToWasm(handle, "changed");
      expect(observer.snapshot()).toBeUndefined();
    } finally {
      wasm.getSelectionText = selection;
      wasm.renderUpdate = update;
    }
    observer.clear();
    runtime.tickWebGL({ canvas }, {});
    expect(observer.snapshot()?.matches).toBe(false);
  } finally {
    for (const cleanup of cleanupFns) cleanup();
    expect(canvas.__resttyLinkDestinationFixture).toBeUndefined();
    wasm.destroy(handle);
  }
});

it("guards the public preview lifetime seam and removes the fixture getter on disposal", () => {
  const host = readFileSync("src/renderer/terminal-window-host.ts", "utf8");
  const instrumented = instrumentResttyLinkPreview(host);
  expect(instrumented).toContain(
    "page.document.__resttyLinkPreviewFixture = previewActive;",
  );
  expect(instrumented).toContain(
    "delete page.document.__resttyLinkPreviewFixture;",
  );
  expect(() => instrumentResttyLinkPreview("")).toThrow(
    "observation seam drift",
  );
  expect(() => instrumentResttyLinkDestination("")).toThrow(
    "observation seam drift",
  );
});

it("composes both readiness observers with the actual broad-host renderer bundle", async () => {
  const result = await build({
    absWorkingDir: fileURLToPath(new URL("../..", import.meta.url)),
    bundle: true,
    entryPoints: ["src/renderer/index.ts"],
    format: "iife",
    loader: { ".ttf": "binary" },
    platform: "browser",
    logLevel: "silent",
    write: false,
    outfile: ".scratch/readiness-probe/index.js",
    plugins: [resttyLinkReadinessProbe, resttyFontMutationProbe],
  });
  expect(result.outputFiles[0]!.text).toContain(
    "__resttyLinkDestinationFixture",
  );
  expect(result.outputFiles[0]!.text).toContain("__resttyLinkPreviewFixture");
});
