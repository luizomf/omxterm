// A Terminal Tab's split layout: an n-ary tree whose leaves are panes. Splits in
// the same direction as their parent join it as siblings, so three side-by-side
// panes are one row with three weights rather than nested halves. Adapted from
// ruscher/omxterm PR #622 at b3c3a4ad6c1f2224bded65873ba0b09a07ec5d38 (MIT).
export type SplitAxis = "row" | "column";

export type PaneLayout<Pane> =
  | { readonly kind: "leaf"; readonly pane: Pane }
  | {
      readonly kind: "split";
      readonly direction: SplitAxis;
      readonly children: readonly PaneLayout<Pane>[];
      readonly weights: readonly number[];
    };

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
  direction: SplitAxis,
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

// Equal shares for the split that directly holds `target`.
export function equalizeParent<Pane>(
  layout: PaneLayout<Pane>,
  target: Pane,
): PaneLayout<Pane> {
  if (layout.kind === "leaf") return layout;
  if (
    layout.children.some(
      (child) => child.kind === "leaf" && child.pane === target,
    )
  )
    return {
      ...layout,
      weights: layout.children.map(() => 1 / layout.children.length),
    };
  return {
    ...layout,
    children: layout.children.map((child) => equalizeParent(child, target)),
  };
}

// Move the boundary between child `index` and `index + 1` of the split at
// `path` by `delta` (a fraction of that split's length). `minimum(child)` is
// the smallest fraction each side may keep.
export function resizeSplit<Pane>(
  layout: PaneLayout<Pane>,
  path: readonly number[],
  index: number,
  delta: number,
  minimum: (child: PaneLayout<Pane>) => number,
): PaneLayout<Pane> {
  if (layout.kind === "leaf") return layout;
  if (path.length > 0) {
    const [head, ...rest] = path;
    return {
      ...layout,
      children: layout.children.map((child, position) =>
        position === head
          ? resizeSplit(child, rest, index, delta, minimum)
          : child,
      ),
    };
  }
  const first = layout.weights[index];
  const second = layout.weights[index + 1];
  if (first === undefined || second === undefined || !Number.isFinite(delta))
    return layout;
  const pair = first + second;
  const lower = minimum(layout.children[index]!);
  const upper = pair - minimum(layout.children[index + 1]!);
  // A later shrink/zoom can make the reference minima impossible. Retain the
  // existing proportions rather than silently forcing equal halves.
  if (lower > upper) return layout;
  const nextFirst = Math.min(upper, Math.max(lower, first + delta));
  const weights = [...layout.weights];
  weights[index] = nextFirst;
  weights[index + 1] = pair - nextFirst;
  return { ...layout, weights };
}

// The smallest extent preserving every descendant's current weight. An
// ancestor resize cannot redistribute space inside a retained child split.
export function minimumExtent<Pane>(
  layout: PaneLayout<Pane>,
  axis: SplitAxis,
  pane: number | ((pane: Pane) => number),
  divider = 0,
): number {
  if (layout.kind === "leaf")
    return typeof pane === "number" ? pane : pane(layout.pane);
  const extents = layout.children.map((child) =>
    minimumExtent(child, axis, pane, divider),
  );
  return layout.direction === axis
    ? Math.max(
        ...extents.map((extent, index) => extent / layout.weights[index]!),
      ) +
        divider * (extents.length - 1)
    : Math.max(...extents);
}

// Removal stays in the nearest containing split, without navigation wraparound.
export function removalNeighbor<Pane>(
  layout: PaneLayout<Pane>,
  target: Pane,
): Pane | undefined {
  if (layout.kind === "leaf") return undefined;
  const index = layout.children.findIndex(
    (child) => child.kind === "leaf" && child.pane === target,
  );
  if (index >= 0) {
    const sibling = layout.children[index - 1] ?? layout.children[index + 1];
    if (!sibling) return undefined;
    const panes = layoutPanes(sibling);
    return index > 0 ? panes.at(-1) : panes[0];
  }
  for (const child of layout.children) {
    const neighbor = removalNeighbor(child, target);
    if (neighbor !== undefined) return neighbor;
  }
  return undefined;
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
    const distance = directionalDistance(source, rectangle(pane), direction);
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
