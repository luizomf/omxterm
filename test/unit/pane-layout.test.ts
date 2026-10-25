import { describe, expect, it } from "vitest";
import {
  adjacentPane,
  directionalPane,
  equalizeParent,
  layoutPanes,
  leaf,
  minimumExtent,
  removalNeighbor,
  removePane,
  resizeSplit,
  splitPane,
  type PaneLayout,
} from "../../src/renderer/pane-layout";

const weightsOf = (layout: PaneLayout<string> | undefined) =>
  layout?.kind === "split" ? layout.weights : undefined;
const expectWeights = (
  layout: PaneLayout<string>,
  expected: readonly number[],
) => {
  const weights = weightsOf(layout) ?? [];
  expect(weights).toHaveLength(expected.length);
  expected.forEach((weight, index) =>
    expect(weights[index]).toBeCloseTo(weight),
  );
};

describe("pane layout", () => {
  it("joins same-direction splits as siblings and nests the other direction", () => {
    let layout = splitPane(leaf("a"), "a", "b", "row");
    layout = splitPane(layout, "b", "c", "row");
    expect(layoutPanes(layout)).toEqual(["a", "b", "c"]);
    expect(weightsOf(layout)).toEqual([0.5, 0.25, 0.25]);
    layout = splitPane(layout, "a", "d", "column");
    expect(layoutPanes(layout)).toEqual(["a", "d", "b", "c"]);
    expect(layout.kind === "split" && layout.children[0]).toMatchObject({
      kind: "split",
      direction: "column",
      weights: [0.5, 0.5],
    });
  });

  it("gives a removed pane's share to its siblings and collapses single splits", () => {
    let layout = splitPane(leaf("a"), "a", "b", "row");
    layout = splitPane(layout, "b", "c", "column");
    const withoutC = removePane(layout, "c")!;
    expect(withoutC).toMatchObject({ kind: "split", direction: "row" });
    expect(layoutPanes(withoutC)).toEqual(["a", "b"]);
    expect(removePane(leaf("a"), "a")).toBeUndefined();
    const three = splitPane(
      splitPane(leaf("a"), "a", "b", "row"),
      "b",
      "c",
      "row",
    );
    expect(weightsOf(removePane(three, "a"))).toEqual([0.5, 0.5]);
  });

  it("equalizes only the split that holds the target", () => {
    let layout = splitPane(leaf("a"), "a", "b", "row");
    layout = splitPane(layout, "b", "c", "row");
    layout = splitPane(layout, "a", "d", "column");
    layout = resizeSplit(layout, [0], 0, 0.3, () => 0);
    const equal = equalizeParent(layout, "b");
    expect(weightsOf(equal)).toEqual([1 / 3, 1 / 3, 1 / 3]);
    expect(equal.kind === "split" && weightsOf(equal.children[0])).toEqual(
      weightsOf(layout.kind === "split" ? layout.children[0] : undefined),
    );
  });

  it("keeps each side of a moved divider above its minimum share", () => {
    const layout = splitPane(leaf("a"), "a", "b", "row");
    expectWeights(
      resizeSplit(layout, [], 0, 0.6, () => 0.2),
      [0.8, 0.2],
    );
    expectWeights(
      resizeSplit(layout, [], 0, -0.6, () => 0.2),
      [0.2, 0.8],
    );
    // Impossible minimums never push past the middle or reorder panes.
    expectWeights(
      resizeSplit(layout, [], 0, 0.4, () => 0.7),
      [0.5, 0.5],
    );
    expect(resizeSplit(layout, [], 0, Number.NaN, () => 0)).toBe(layout);
  });

  it("honors feasible asymmetric minima rather than capping either subtree at half", () => {
    const layout = splitPane(leaf("a"), "a", "b", "row");
    expectWeights(
      resizeSplit(layout, [], 0, -0.4, (child) =>
        child.kind === "leaf" && child.pane === "a" ? 0.6 : 0.2,
      ),
      [0.6, 0.4],
    );
    const asymmetric = resizeSplit(layout, [], 0, 0.2, () => 0);
    expectWeights(
      resizeSplit(asymmetric, [], 0, -0.4, () => 0.7),
      [0.7, 0.3],
    );
  });

  it("measures minimum extents along each axis", () => {
    let layout = splitPane(leaf("a"), "a", "b", "row");
    layout = splitPane(layout, "b", "c", "column");
    expect(minimumExtent(layout, "row", 10)).toBe(20);
    expect(minimumExtent(layout, "column", 5)).toBe(10);
  });

  it("finds sequential and geometric neighbors", () => {
    let layout = splitPane(leaf("a"), "a", "b", "row");
    layout = splitPane(layout, "b", "c", "column");
    expect(adjacentPane(layout, "c", 1)).toBe("a");
    expect(adjacentPane(layout, "a", -1)).toBe("c");
    expect(adjacentPane(leaf("a"), "a", 1)).toBeUndefined();
    expect(removalNeighbor(layout, "a")).toBe("b");
    expect(removalNeighbor(layout, "b")).toBe("c");
    expect(removalNeighbor(layout, "c")).toBe("b");
    const rectangles: Record<string, [number, number, number, number]> = {
      a: [0, 0, 100, 100],
      b: [104, 0, 200, 48],
      c: [104, 52, 200, 100],
    };
    const rectangle = (pane: string) => {
      const [left, top, right, bottom] = rectangles[pane]!;
      return { left, top, right, bottom };
    };
    const panes = ["a", "b", "c"];
    expect(directionalPane(panes, "a", "right", rectangle)).toBe("b");
    expect(directionalPane(panes, "c", "up", rectangle)).toBe("b");
    expect(directionalPane(panes, "c", "left", rectangle)).toBe("a");
    expect(directionalPane(panes, "a", "up", rectangle)).toBeUndefined();
  });
});
