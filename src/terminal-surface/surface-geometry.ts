import type { PtyTransport } from "restty";
import type { TerminalSurfaceGeometry } from "./terminal-surface";

type ResizeMeta = Parameters<PtyTransport["resize"]>[2];

// Keep physical runtime metrics private; hosts receive only CSS geometry.
export function createSurfaceGeometry(
  container: HTMLElement,
  isVisible: () => boolean,
  refit: () => void,
) {
  let cells: { readonly width: number; readonly height: number } | undefined;
  return {
    record(meta: ResizeMeta) {
      if (
        meta?.cellW !== undefined &&
        meta.cellH !== undefined &&
        meta.cellW > 0 &&
        meta.cellH > 0
      )
        cells = { width: meta.cellW, height: meta.cellH };
    },
    measure(): TerminalSurfaceGeometry | undefined {
      if (!isVisible()) return undefined;
      refit();
      const canvas = container.querySelector("canvas");
      if (!canvas || !cells) return undefined;
      const outer = container.getBoundingClientRect();
      const content = canvas.getBoundingClientRect();
      if (
        content.width <= 0 ||
        content.height <= 0 ||
        canvas.width <= 0 ||
        canvas.height <= 0
      )
        return undefined;
      return {
        cellWidth: (cells.width * content.width) / canvas.width,
        cellHeight: (cells.height * content.height) / canvas.height,
        insetWidth: Math.max(0, outer.width - content.width),
        insetHeight: Math.max(0, outer.height - content.height),
      };
    },
  };
}
