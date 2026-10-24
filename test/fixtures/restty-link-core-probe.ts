import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { createInputHandler, loadResttyWasm } from "restty/internal";
import { visibleLinkAtOffset } from "../../src/terminal-surface/visible-links";
import {
  instrumentResttyLinkDestination,
  type createLinkDestinationObserver,
} from "./restty-link-readiness-probe";

// Headless execution of the actual injected hooks and runtime recognition.
// Only the coordinate conversion, shaping and submission ports are controlled.
export async function realFrameFixture(cols = 80, rows = 6) {
  const source = instrumentResttyLinkDestination(
    readFileSync("node_modules/restty/dist/chunk-c0rcpsc5.js", "utf8"),
  );
  const slice = (start: string, end: string) =>
    source.slice(
      source.indexOf(start),
      source.indexOf(end, source.indexOf(start)),
    );
  const clusterReader = slice(
    "function readClusterText(",
    "function classifyCluster(",
  );
  const initializerStart = source.indexOf(
    "  canvas.__resttyLinkDestinationFixture =",
  );
  const initializer = source.slice(
    initializerStart,
    source.indexOf(
      "\n  });",
      source.indexOf("  cleanupFns.push(", initializerStart),
    ) + 7,
  );
  const wasm = await loadResttyWasm();
  const handle = wasm.create(cols, rows, 10_000_000);
  const canvas = {} as {
    __resttyLinkDestinationFixture?: ReturnType<
      typeof createLinkDestinationObserver
    >;
  };
  const cleanupFns: Array<() => void> = [];
  const inputHandler = createInputHandler();
  let frame: ReturnType<typeof wasm.getRenderState>;
  let pipeline = () => {};
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
    [
      slice("function clamp2(", "// src/fonts/manager/entries.ts"),
      slice("function normalizeSelectionCell2(", "function positionToCell2("),
      slice(
        "  const normalizeSelectionCell = (cell) =>",
        "  const getCurrentRenderState = () =>",
      ),
      clusterReader,
      initializer,
      slice(
        "  function writeToWasm(handle, text) {",
        "  function flushWasmOutputToPty() {",
      ),
      slice(
        "function tickWebGL(deps, state) {",
        "// src/runtime/create-runtime/render-tick-webgpu-cell-pass.ts",
      ),
      slice(
        "  const getVisibleLinkAtClientPoint =",
        "  const clearSelection =",
      ),
      slice(
        "function createScrollbarRuntime(",
        "// src/runtime/create-runtime/interaction-runtime/index.ts",
      ),
      "({writeToWasm, tickWebGL, getVisibleLinkAtClientPoint, scroll: createScrollbarRuntime(scrollOptions)})",
    ].join("\n"),
    {
      canvas,
      cleanupFns,
      inputHandler,
      wasmHandle: handle,
      wasmExports: wasm.exports,
      readClusterText: runInNewContext(
        `${clusterReader}\nreadClusterText`,
      ) as unknown,
      services: { resolveVisibleLink: resolve },
      resolveVisibleLink: resolve,
      options: { getCanvas: () => canvas, readState: () => ({ wasm }) },
      buildWebGLTickContext: () => frame ?? null,
      populateWebGLSceneData() {},
      populateWebGLOverlays() {},
      renderWebGLGlyphPipeline: () => pipeline(),
      getCurrentRenderState: () => frame,
      getLastRenderState: () => frame,
      getWasm: () => wasm,
      getWasmHandle: () => handle,
      getWasmExports: () => wasm.exports,
      getGridState: () => ({
        cols: frame?.cols ?? cols,
        rows: frame?.rows ?? rows,
      }),
      positionToCell: ({
        clientX,
        clientY,
      }: {
        clientX: number;
        clientY: number;
      }) => ({ col: clientX, row: clientY }),
      performance,
      scrollOptions: {
        scrollbarState: {},
        selectionState: {},
        linkState: {},
        getCanvas: () => canvas,
        getGridState: () => ({ cellH: 20, rows: frame?.rows ?? rows }),
        getWasmReady: () => true,
        getWasm: () => wasm,
        getWasmHandle: () => handle,
        getWasmExports: () => wasm.exports,
        updateLinkHover() {},
        markNeedsRender() {},
      },
    },
  ) as {
    writeToWasm(handle: number, text: string): void;
    tickWebGL(deps: { canvas: typeof canvas }, state: object): void;
    getVisibleLinkAtClientPoint(
      col: number,
      row: number,
    ): {
      url: string;
      start: number;
      end: number;
      cells: number[];
      id: string;
    } | null;
    scroll: { scrollViewportByLines(lines: number): void };
  };
  return {
    wasm,
    handle,
    observer: canvas.__resttyLinkDestinationFixture!,
    runtime,
    write(text: string) {
      inputHandler.filterOutput(text);
      runtime.writeToWasm(handle, text);
    },
    produce() {
      wasm.renderUpdate(handle);
      frame = wasm.getRenderState(handle);
    },
    submit() {
      runtime.tickWebGL({ canvas }, {});
    },
    frame: () => frame!,
    pipeline(callback: () => void) {
      pipeline = callback;
    },
    dispose() {
      for (const cleanup of cleanupFns) cleanup();
      wasm.destroy(handle);
    },
  };
}
