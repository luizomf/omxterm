import { readFileSync } from "node:fs";
import { runInThisContext } from "node:vm";
import { createInputHandler, loadResttyWasm } from "restty/internal";

const CELL_WIDTH = 10;
const CELL_HEIGHT = 20;

const source = readFileSync(
  "node_modules/restty/dist/chunk-c0rcpsc5.js",
  "utf8",
);
const slice = (start: string, end: string) => {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  if (from < 0 || to < 0) throw new Error(`Restty seam drifted: ${start}`);
  return source.slice(from, to);
};

interface Cell {
  readonly row: number;
  readonly col: number;
}
interface SelectionState {
  active: boolean;
  dragging: boolean;
  anchor: Cell | null;
  focus: Cell | null;
}
interface Interaction {
  readonly selectionState: SelectionState;
  bindCanvasEvents(options: object): void;
}

// The pinned interaction runtime (pointer bindings, click counting, word and
// line selection) runs against the real Ghostty core in a DOM canvas. Only
// canvas geometry, rendering and the PTY port are controlled.
const createRuntimeInteraction = (
  runInThisContext(
    [
      "(() => {",
      slice("function clamp2(", "// src/fonts/manager/entries.ts"),
      slice("// src/selection/core.ts", "// src/selection/text.ts"),
      slice(
        "// src/runtime/create-runtime/interaction-runtime/desktop-word-selection.ts",
        "// src/runtime/create-runtime/kitty-overlay-utils.ts",
      ),
      "return createRuntimeInteraction;",
      "})",
    ].join("\n"),
  ) as () => (options: object) => Interaction
)();

export interface PointerOptions {
  readonly shiftKey?: boolean;
  readonly metaKey?: boolean;
  // Offset in CSS pixels from the cell's center.
  readonly dx?: number;
}

export async function mountSelectionRuntime(cols: number, rows: number) {
  const wasm = await loadResttyWasm();
  const handle = wasm.create(cols, rows, 10_000_000);
  let frame: ReturnType<typeof wasm.getRenderState>;
  const refresh = () => {
    wasm.renderUpdate(handle);
    frame = wasm.getRenderState(handle);
  };
  refresh();
  // Click counting reads performance.now(); a controlled clock keeps it exact.
  const realNow = performance.now.bind(performance);
  let elapsed = 0;
  performance.now = () => realNow() + elapsed;
  const canvas = document.createElement("canvas");
  document.body.append(canvas);
  const reports: string[] = [];
  const cleanupCanvasFns: Array<() => void> = [];
  const interaction = createRuntimeInteraction({
    attachCanvasEvents: true,
    touchSelectionMode: "off",
    cleanupCanvasFns,
    getCanvas: () => canvas,
    getCurrentDpr: () => 1,
    getGridState: () => ({
      cellW: CELL_WIDTH,
      cellH: CELL_HEIGHT,
      cols,
      rows,
    }),
    getLastRenderState: () => frame,
    getWasmReady: () => true,
    getWasm: () => wasm,
    getWasmHandle: () => handle,
    getWasmExports: () => wasm.exports,
    updateLinkHover() {},
    setVisibleLinkHover() {},
    markNeedsRender() {},
    markSearchDirty() {},
  });
  const cellAt = (event: { clientX: number; clientY: number }) => ({
    col: Math.floor(event.clientX / CELL_WIDTH),
    row: Math.floor(event.clientY / CELL_HEIGHT),
  });
  const inputHandler = createInputHandler({
    sendReply: (data) => reports.push(data),
    positionToCell: cellAt,
    getWindowMetrics: () => ({
      widthPx: cols * CELL_WIDTH,
      heightPx: rows * CELL_HEIGHT,
      cellWidthPx: CELL_WIDTH,
      cellHeightPx: CELL_HEIGHT,
      cols,
      rows,
    }),
  });
  interaction.bindCanvasEvents({
    inputHandler,
    sendKeyInput: (data: string) => reports.push(data),
    openLink() {},
  });

  const pointer = (
    type: "pointerdown" | "pointermove" | "pointerup",
    col: number,
    row: number,
    { shiftKey = false, metaKey = false, dx = 0 }: PointerOptions = {},
  ) =>
    canvas.dispatchEvent(
      new PointerEvent(type, {
        bubbles: true,
        cancelable: true,
        pointerId: 1,
        pointerType: "mouse",
        isPrimary: true,
        button: 0,
        buttons: type === "pointerup" ? 0 : 1,
        clientX: col * CELL_WIDTH + CELL_WIDTH / 2 + dx,
        clientY: row * CELL_HEIGHT + CELL_HEIGHT / 2,
        shiftKey,
        metaKey,
      }),
    );
  const click = (col: number, row: number, options?: PointerOptions) => {
    pointer("pointerdown", col, row, options);
    pointer("pointerup", col, row, options);
  };
  const drag = (from: Cell, to: Cell, options?: PointerOptions) => {
    pointer("pointerdown", from.col, from.row, options);
    pointer("pointermove", to.col, to.row, options);
    pointer("pointerup", to.col, to.row, options);
  };

  return {
    reports,
    pointer,
    click,
    // Lets the double-click interval lapse, so the next click starts over.
    pause() {
      elapsed += 1_000;
    },
    drag,
    write(text: string) {
      inputHandler.filterOutput(text);
      wasm.write(handle, text);
      refresh();
    },
    scrollViewport(lines: number) {
      wasm.scrollViewport(handle, lines);
      refresh();
    },
    // The copy path's query: the core reads the inclusive anchor/focus range.
    selectedText() {
      const { active, anchor, focus } = interaction.selectionState;
      if (!active || !anchor || !focus) return "";
      return wasm.getSelectionText(
        handle,
        anchor.row,
        anchor.col,
        focus.row,
        focus.col,
      );
    },
    isDragging: () => interaction.selectionState.dragging,
    dispose() {
      for (const cleanup of cleanupCanvasFns) cleanup();
      canvas.remove();
      performance.now = realNow;
      wasm.destroy(handle);
    },
  };
}
