import type { SerializedPaneLayout } from "../shared/workspace";

// A Terminal Tab's split layout: an n-ary tree whose leaves are panes. Splits in
// the same direction as their parent join it as siblings, so three side-by-side
// panes are one row with three weights rather than nested halves.
export type SplitDirection = "row" | "column";

export type PaneLayout<Pane> =
  | { readonly kind: "leaf"; readonly pane: Pane }
  | {
      readonly kind: "split";
      readonly direction: SplitDirection;
      readonly children: readonly PaneLayout<Pane>[];
      readonly weights: readonly number[];
    };

export const MIN_PANE_WEIGHT = 0.05;

export function leaf<Pane>(pane: Pane): PaneLayout<Pane> {
  return { kind: "leaf", pane };
}

export function layoutPanes<Pane>(layout: PaneLayout<Pane>): Pane[] {
  return layout.kind === "leaf"
    ? [layout.pane]
    : layout.children.flatMap((child) => layoutPanes(child));
}

// Insert `added` beside `target`, after it ("row" = right, "column" = below).
export function splitPane<Pane>(
  layout: PaneLayout<Pane>,
  target: Pane,
  added: Pane,
  direction: SplitDirection,
): PaneLayout<Pane> {
  if (layout.kind === "leaf")
    return layout.pane === target
      ? {
          kind: "split",
          direction,
          children: [layout, leaf(added)],
          weights: [0.5, 0.5],
        }
      : layout;
  const index = layout.children.findIndex(
    (child) => child.kind === "leaf" && child.pane === target,
  );
  if (index >= 0 && layout.direction === direction) {
    // Split the target's share evenly with the new sibling.
    const share = layout.weights[index]! / 2;
    return {
      ...layout,
      children: [
        ...layout.children.slice(0, index + 1),
        leaf(added),
        ...layout.children.slice(index + 1),
      ],
      weights: [
        ...layout.weights.slice(0, index),
        share,
        share,
        ...layout.weights.slice(index + 1),
      ],
    };
  }
  return {
    ...layout,
    children: layout.children.map((child) =>
      splitPane(child, target, added, direction),
    ),
  };
}

export function replacePane<Pane>(
  layout: PaneLayout<Pane>,
  target: Pane,
  replacement: Pane,
): PaneLayout<Pane> {
  if (layout.kind === "leaf")
    return layout.pane === target ? leaf(replacement) : layout;
  return {
    ...layout,
    children: layout.children.map((child) =>
      replacePane(child, target, replacement),
    ),
  };
}

// Remove a pane; its share goes to its neighbors and single-child splits
// collapse into their remaining child. Removing the last pane yields undefined.
export function removePane<Pane>(
  layout: PaneLayout<Pane>,
  target: Pane,
): PaneLayout<Pane> | undefined {
  if (layout.kind === "leaf")
    return layout.pane === target ? undefined : layout;
  const children: PaneLayout<Pane>[] = [];
  const weights: number[] = [];
  layout.children.forEach((child, index) => {
    const next = removePane(child, target);
    if (next) {
      children.push(next);
      weights.push(layout.weights[index]!);
    }
  });
  if (children.length === 0) return undefined;
  if (children.length === 1) return children[0];
  return { ...layout, children, weights: normalize(weights) };
}

export function equalizeLayout<Pane>(
  layout: PaneLayout<Pane>,
): PaneLayout<Pane> {
  if (layout.kind === "leaf") return layout;
  return {
    ...layout,
    children: layout.children.map((child) => equalizeLayout(child)),
    weights: layout.children.map(() => 1 / layout.children.length),
  };
}

// Move the boundary between child `index` and `index + 1` of the split at
// `path` by `delta` (a fraction of that split's length), keeping both sides
// above MIN_PANE_WEIGHT.
export function resizeSplit<Pane>(
  layout: PaneLayout<Pane>,
  path: readonly number[],
  index: number,
  delta: number,
): PaneLayout<Pane> {
  if (layout.kind === "leaf") return layout;
  if (path.length > 0) {
    const [head, ...rest] = path;
    return {
      ...layout,
      children: layout.children.map((child, position) =>
        position === head ? resizeSplit(child, rest, index, delta) : child,
      ),
    };
  }
  const first = layout.weights[index];
  const second = layout.weights[index + 1];
  if (first === undefined || second === undefined || !Number.isFinite(delta))
    return layout;
  const pair = first + second;
  const nextFirst = Math.min(
    pair - MIN_PANE_WEIGHT,
    Math.max(MIN_PANE_WEIGHT, first + delta),
  );
  const weights = [...layout.weights];
  weights[index] = nextFirst;
  weights[index + 1] = pair - nextFirst;
  return { ...layout, weights };
}

export function adjacentPane<Pane>(
  layout: PaneLayout<Pane>,
  from: Pane,
  offset: 1 | -1,
): Pane | undefined {
  const panes = layoutPanes(layout);
  const index = panes.indexOf(from);
  if (index < 0 || panes.length < 2) return undefined;
  return panes[(index + offset + panes.length) % panes.length];
}

export type PaneDirection = "left" | "right" | "up" | "down";

export interface PaneRectangle {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}

// Geometric neighbor: the closest pane whose rectangle lies in `direction` and
// overlaps the source on the perpendicular axis.
export function directionalPane<Pane>(
  panes: readonly Pane[],
  from: Pane,
  direction: PaneDirection,
  rectangle: (pane: Pane) => PaneRectangle,
): Pane | undefined {
  const source = rectangle(from);
  let best: { pane: Pane; distance: number } | undefined;
  for (const pane of panes) {
    if (pane === from) continue;
    const candidate = rectangle(pane);
    const distance = directionalDistance(source, candidate, direction);
    if (distance === undefined) continue;
    if (!best || distance < best.distance) best = { pane, distance };
  }
  return best?.pane;
}

function directionalDistance(
  source: PaneRectangle,
  candidate: PaneRectangle,
  direction: PaneDirection,
): number | undefined {
  const horizontal = direction === "left" || direction === "right";
  const overlaps = horizontal
    ? candidate.top < source.bottom && candidate.bottom > source.top
    : candidate.left < source.right && candidate.right > source.left;
  if (!overlaps) return undefined;
  const distance =
    direction === "left"
      ? source.left - candidate.right
      : direction === "right"
        ? candidate.left - source.right
        : direction === "up"
          ? source.top - candidate.bottom
          : candidate.top - source.bottom;
  return distance >= -1 ? distance : undefined;
}

function normalize(weights: readonly number[]): number[] {
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return total > 0
    ? weights.map((weight) => weight / total)
    : weights.map(() => 1 / weights.length);
}

export {
  isSerializedPaneLayout,
  MAX_SERIALIZED_PANES,
  type SerializedPaneLayout,
} from "../shared/workspace";

export function serializeLayout<Pane>(
  layout: PaneLayout<Pane>,
  indexOf: (pane: Pane) => number,
): SerializedPaneLayout {
  return layout.kind === "leaf"
    ? { pane: indexOf(layout.pane) }
    : {
        direction: layout.direction,
        children: layout.children.map((child) =>
          serializeLayout(child, indexOf),
        ),
        weights: [...layout.weights],
      };
}

// Rebuilds a layout from its shape; leaves take the caller's panes by index.
export function deserializeLayout<Pane>(
  shape: SerializedPaneLayout,
  paneAt: (index: number) => Pane,
): PaneLayout<Pane> {
  if ("pane" in shape) return leaf(paneAt(shape.pane));
  const total = shape.weights.reduce((sum, weight) => sum + weight, 0);
  return {
    kind: "split",
    direction: shape.direction,
    children: shape.children.map((child) => deserializeLayout(child, paneAt)),
    weights: shape.weights.map((weight) => weight / total),
  };
}
