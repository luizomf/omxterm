import { MIN_PANE_COLUMNS, MIN_PANE_ROWS } from "../shared/terminal-panes";
import type { TerminalSurfaceGeometry } from "../terminal-surface/terminal-surface";
import { minimumExtent, type PaneLayout, type SplitAxis } from "./pane-layout";

// Shared with the view's CSS variable: weights divide the space *between*
// dividers, not the split's complete outer box.
export const PANE_DIVIDER_SIZE = 4;
type Measure<Pane> = (pane: Pane) => TerminalSurfaceGeometry | undefined;

export function minimumLayoutExtent<Pane>(
  layout: PaneLayout<Pane>,
  axis: SplitAxis,
  measure: Measure<Pane>,
): number {
  return minimumExtent(
    layout,
    axis,
    (pane) => {
      const geometry = measure(pane);
      if (!geometry) return Number.POSITIVE_INFINITY;
      return axis === "row"
        ? geometry.cellWidth * MIN_PANE_COLUMNS + geometry.insetWidth
        : geometry.cellHeight * MIN_PANE_ROWS + geometry.insetHeight;
    },
    PANE_DIVIDER_SIZE,
  );
}

// Test the actual prospective weights, including n-ary siblings losing space to
// an extra divider. No Adapter or DOM tree is created to answer this question.
export function fitsPaneLayout<Pane>(
  layout: PaneLayout<Pane>,
  width: number,
  height: number,
  measure: Measure<Pane>,
): boolean {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0
  )
    return false;
  if (layout.kind === "leaf")
    return (
      width >= minimumLayoutExtent(layout, "row", measure) &&
      height >= minimumLayoutExtent(layout, "column", measure)
    );
  const horizontal = layout.direction === "row";
  const length =
    (horizontal ? width : height) -
    PANE_DIVIDER_SIZE * (layout.children.length - 1);
  return layout.children.every((child, index) =>
    fitsPaneLayout(
      child,
      horizontal ? length * layout.weights[index]! : width,
      horizontal ? height : length * layout.weights[index]!,
      measure,
    ),
  );
}
