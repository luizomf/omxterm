import type { TerminalFontZoom } from "../shared/terminal-contract";

// Wheel distance for one zoom step; a mouse notch is about 100, touchpads
// send smaller deltas that add up.
const STEP_DELTA = 100;

// Ctrl+wheel (Cmd+wheel on macOS) zooms the terminal font like Ctrl+Plus and
// Ctrl+Minus. Captured before the terminal, which would scroll instead.
export function installWheelZoom(
  container: HTMLElement,
  zoom: (command: TerminalFontZoom) => void,
): () => void {
  let accumulated = 0;
  const onWheel = (event: WheelEvent) => {
    if (!(event.ctrlKey || event.metaKey) || event.deltaY === 0) return;
    event.preventDefault();
    event.stopPropagation();
    accumulated +=
      event.deltaMode === WheelEvent.DOM_DELTA_LINE
        ? event.deltaY * 33
        : event.deltaY;
    while (Math.abs(accumulated) >= STEP_DELTA) {
      zoom(accumulated < 0 ? "in" : "out");
      accumulated -= Math.sign(accumulated) * STEP_DELTA;
    }
  };
  container.addEventListener("wheel", onWheel, {
    capture: true,
    passive: false,
  });
  return () =>
    container.removeEventListener("wheel", onWheel, { capture: true });
}
