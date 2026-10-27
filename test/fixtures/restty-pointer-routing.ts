import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { createInputHandler } from "restty/internal";

const dist = path.dirname(createRequire(import.meta.url).resolve("restty"));
const source = readFileSync(path.join(dist, "chunk-c0rcpsc5.js"), "utf8");
const start = source.indexOf("function createPointerAuxHandlers(options) {");
const end = source.indexOf(
  "// src/runtime/create-runtime/interaction-runtime/",
  source.indexOf("function bindPointerEvents(options) {", start),
);
if (start < 0 || end <= start)
  throw new Error("Restty pointer routing seam drifted");

// Execute the pinned down/up/aux bindings, not a forwarding listener or an
// always-successful mouse spy. Only geometry, selection/render boundaries and
// the final transport are controlled; no browser layout, core or native input.
const bind = runInNewContext(`${source.slice(start, end)}\nbindPointerEvents`, {
  performance,
  setInterval,
  clearInterval,
  setTimeout,
}) as (options: Record<string, unknown>) => void;

export function bindResttyMouse(
  canvas: HTMLCanvasElement,
  sendReply: (data: string) => void,
) {
  const cell = { row: 2, col: 4 };
  const input = createInputHandler({
    sendReply,
    getCursorPosition: () => cell,
    positionToCell: () => cell,
    getWindowMetrics: () => ({
      widthPx: 800,
      heightPx: 480,
      cellWidthPx: 10,
      cellHeightPx: 20,
      cols: 80,
      rows: 24,
    }),
    getWheelCellMetrics: () => ({
      cellWidth: 10,
      cellHeight: 20,
      cols: 80,
      rows: 24,
    }),
  });
  const cleanupCanvasFns: Array<() => void> = [];
  const noop = () => undefined;
  bind({
    canvas,
    bindOptions: {
      inputHandler: input,
      sendKeyInput: sendReply,
      openLink: noop,
    },
    touchSelectionMode: "off",
    selectionState: { active: false, dragging: false },
    touchSelectionState: {
      pendingPointerId: null,
      activePointerId: null,
      panPointerId: null,
    },
    desktopSelectionState: { pendingPointerId: null, pendingCell: null },
    linkState: { hoverUri: null },
    cleanupCanvasFns,
    isTouchPointer: () => false,
    clearPendingTouchSelection: noop,
    clearPendingDesktopSelection: noop,
    tryActivatePendingTouchSelection: noop,
    beginSelectionDrag: noop,
    normalizeSelectionCell: (value: unknown) => value,
    positionToCell: () => cell,
    scrollViewportByLines: noop,
    clearSelection: noop,
    updateCanvasCursor: noop,
    markNeedsRender: noop,
    updateLinkHover: noop,
    getGridState: () => ({ cellH: 20 }),
    getWasmReady: () => false,
    getWasmHandle: () => null,
  });
  return {
    input,
    dispose: () => cleanupCanvasFns.forEach((cleanup) => cleanup()),
  };
}
