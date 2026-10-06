import { readFileSync } from "node:fs";
import { visibleLinkAtOffset } from "../../src/terminal-surface/visible-links";
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
const clusterReader = source.slice(
  source.indexOf("function readClusterText("),
  source.indexOf("function classifyCluster("),
);
const selectionNormalization =
  source.slice(
    source.indexOf("function normalizeSelectionCell2("),
    source.indexOf("function positionToCell2("),
  ) +
  source.slice(
    source.indexOf("  const normalizeSelectionCell = (cell) =>"),
    source.indexOf("  const getCurrentRenderState = () =>"),
  );
const clamp = source.slice(
  source.indexOf("function clamp2("),
  source.indexOf("// src/fonts/manager/entries.ts"),
);
const lookup = source.slice(
  source.indexOf("  const getVisibleLinkAtClientPoint ="),
  source.indexOf(
    "  const clearSelection =",
    source.indexOf("  const getVisibleLinkAtClientPoint ="),
  ),
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
      readClusterText: runInNewContext(
        `${source.slice(source.indexOf("function readClusterText("), source.indexOf("function classifyCluster("))}\nreadClusterText`,
      ) as unknown,
      services: {
        resolveVisibleLink: ({
          text,
          offset,
          clippedStart,
          clippedEnd,
        }: {
          text: string;
          offset: number;
          clippedStart: boolean;
          clippedEnd: boolean;
        }) => visibleLinkAtOffset(text, offset, clippedStart, clippedEnd),
      },
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

it.each([
  [24, true],
  [26, false],
  [80, true],
] as const)(
  "observes readiness only for runtime-recognizable wide/combining-prefix WEB frames at %i columns",
  async (cols, recognizable) => {
    const wasm = await loadResttyWasm();
    const handle = wasm.create(cols, 20, 10_000_000);
    const canvas = {} as {
      __resttyLinkDestinationFixture?: ReturnType<
        typeof createLinkDestinationObserver
      >;
    };
    const cleanupFns: Array<() => void> = [];
    let frame: ReturnType<typeof wasm.getRenderState>;
    const resolve = ({
      text,
      offset,
      clippedStart,
      clippedEnd,
    }: {
      text: string;
      offset: number;
      clippedStart: boolean;
      clippedEnd: boolean;
    }) => visibleLinkAtOffset(text, offset, clippedStart, clippedEnd);
    const runtime = runInNewContext(
      `${clamp}\n${selectionNormalization}\n${clusterReader}\n${initializer}\n${write}\n${tick}\n${lookup}\n({ writeToWasm, tickWebGL, getVisibleLinkAtClientPoint });`,
      {
        canvas,
        cleanupFns,
        services: { resolveVisibleLink: resolve },
        resolveVisibleLink: resolve,
        options: { getCanvas: () => canvas, readState: () => ({ wasm }) },
        buildWebGLTickContext: () => frame ?? null,
        populateWebGLSceneData() {},
        populateWebGLOverlays() {},
        renderWebGLGlyphPipeline() {},
        getCurrentRenderState: () => frame,
        getWasm: () => wasm,
        getWasmHandle: () => handle,
        getWasmExports: () => wasm.exports,
        // Only client-to-cell coordinates and frame submission are modeled.
        // Normalization, viewport exports, recognition and core queries are real.
        positionToCell: ({
          clientX,
          clientY,
        }: {
          clientX: number;
          clientY: number;
        }) => ({ col: clientX, row: clientY }),
        getLastRenderState: () => frame,
        getGridState: () => ({ cols, rows: 20 }),
      },
    ) as {
      writeToWasm(handle: number, text: string): void;
      tickWebGL(deps: { canvas: typeof canvas }, state: object): void;
      getVisibleLinkAtClientPoint(
        col: number,
        row: number,
      ): { url: string } | null;
    };
    try {
      const observer = canvas.__resttyLinkDestinationFixture!;
      const url = `https://example.test/漢${"a".repeat(cols)}`;
      observer.prepareWeb(url, "漢e\u0301 ", [
        [0, 4],
        [1, 2],
      ]);
      runtime.writeToWasm(
        handle,
        `\u001b[2J\u001b[H漢e\u0301 https://old.test/漢${"a".repeat(cols)}`,
      );
      wasm.renderUpdate(handle);
      frame = wasm.getRenderState(handle);
      runtime.tickWebGL({ canvas }, {});
      expect(observer.snapshot()?.matches).toBe(false);
      // Exact caller initial / alternate / final output sequence.
      runtime.writeToWasm(
        handle,
        `\u001b[2J\u001b[H\u001b[?25l\u001b[?1000h\u001b[?1006h漢e\u0301 ${url}`,
      );
      runtime.writeToWasm(handle, "\u001b[?1049halternate\u001b[?1049l");
      runtime.writeToWasm(
        handle,
        `\u001b[2J\u001b[H漢e\u0301 \u001b]8;;https://hidden.test/different\u0007${url}\u001b]8;;\u0007`,
      );
      expect(observer.snapshot()).toBeUndefined();
      // Reacquire retained-render views after writes can allocate, without
      // preparing the core; mismatch must not be a detached-view artifact.
      frame = wasm.getRenderState(handle);
      expect(frame!.codepoints!.byteLength).toBeGreaterThan(0);
      expect(runtime.getVisibleLinkAtClientPoint(4, 0)).toBeNull();
      const produceFrame = () => {
        wasm.renderUpdate(handle); // legitimate producer, never the observer
        frame = wasm.getRenderState(handle);
        expect(frame!.codepoints!.byteLength).toBeGreaterThan(0);
      };
      const lookupFresh = (col: number, row: number) => {
        // A real lookup allocates selection text. Never reuse its borrowed
        // views for the next lookup or passive-observer comparison.
        produceFrame();
        return runtime.getVisibleLinkAtClientPoint(col, row);
      };
      produceFrame();
      expect(wasm.exports.restty_scrollbar_offset!(handle)).toBe(0);
      expect(wasm.exports.restty_scrollbar_len!(handle)).toBe(20);
      if (cols === 24) expect(frame!.wide?.[26]).toBe(2);
      if (!recognizable) expect(frame!.wide?.[25]).toBe(3);
      const recognized = [
        lookupFresh(4, 0)?.url ?? null,
        lookupFresh(2, 1)?.url ?? null,
      ];
      expect(recognized).toEqual(recognizable ? [url, url] : [null, null]);
      produceFrame();
      const codepointBytes = frame!.codepoints!.byteLength;
      const wideBytes = frame!.wide!.byteLength;
      const memoryBytes = wasm.memory.buffer.byteLength;
      const selection = wasm.getSelectionText;
      const update = wasm.renderUpdate;
      wasm.getSelectionText = () => {
        throw new Error("Observer allocated selection text");
      };
      wasm.renderUpdate = () => {
        throw new Error("Observer forced core preparation");
      };
      try {
        runtime.tickWebGL({ canvas }, {});
        expect(observer.snapshot()).toEqual({
          cols,
          rows: 20,
          matches: recognizable,
        });
        expect(frame!.codepoints!.byteLength).toBe(codepointBytes);
        expect(frame!.wide!.byteLength).toBe(wideBytes);
        if (cols === 24) expect(frame!.wide?.[26]).toBe(2);
        expect(wasm.memory.buffer.byteLength).toBe(memoryBytes);
      } finally {
        wasm.getSelectionText = selection;
        wasm.renderUpdate = update;
      }
      // The same readiness result persists on another fresh, stable frame;
      // this is a fixed observation check, not an activation retry.
      produceFrame();
      runtime.tickWebGL({ canvas }, {});
      expect(observer.snapshot()).toEqual({
        cols,
        rows: 20,
        matches: recognizable,
      });
      runtime.writeToWasm(
        handle,
        "\u001b[2J\u001b[Hhttps://one.test/a,\r\nhttps://two.test/b",
      );
      wasm.renderUpdate(handle);
      frame = wasm.getRenderState(handle);
      runtime.tickWebGL({ canvas }, {});
      expect(observer.snapshot()?.matches).toBe(false);
      expect(lookupFresh(3, 0)?.url).toBe("https://one.test/a");
      expect(lookupFresh(3, 1)?.url).toBe("https://two.test/b");
      produceFrame();
      observer.clear();
      runtime.tickWebGL({ canvas }, {});
      expect(observer.snapshot()?.matches).toBe(false);
    } finally {
      for (const cleanup of cleanupFns) cleanup();
      wasm.destroy(handle);
    }
  },
);

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
