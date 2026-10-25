import { expect, it } from "vitest";
import {
  fitsPaneLayout,
  minimumLayoutExtent,
} from "../../src/renderer/pane-geometry";
import {
  leaf,
  resizeSplit,
  splitPane,
  type PaneLayout,
} from "../../src/renderer/pane-layout";

it("stops the ancestor divider at 804px for the retained 1:3 inner split from the review probe", () => {
  const geometry = {
    cellWidth: 10,
    cellHeight: 20,
    insetWidth: 0,
    insetHeight: 0,
  };
  let layout = splitPane(leaf("A"), "A", "B", "row");
  layout = splitPane(layout, "A", "C", "column");
  layout = splitPane(layout, "C", "D", "row");
  layout = resizeSplit(layout, [0, 1], 0, -0.25, () => 0);
  expect(fitsPaneLayout(layout, 2000, 800, () => geometry)).toBe(true);
  const resized = resizeSplit(
    layout,
    [],
    0,
    -1,
    (child) => minimumLayoutExtent(child, "row", () => geometry) / 1996,
  );
  expect(resized.kind).toBe("split");
  if (resized.kind !== "split") throw new Error("Expected retained split");
  const leftWidth = resized.weights[0]! * 1996;
  expect(leftWidth).toBeCloseTo(804);
  expect((leftWidth - 4) * 0.25).toBeGreaterThanOrEqual(200);
  expect(fitsPaneLayout(resized, 2000, 800, () => geometry)).toBe(true);
  expect(resized.children).toEqual(
    layout.kind === "split" ? layout.children : [],
  );
});

it.each([
  ["row", 2208],
  ["column", 1108],
] as const)(
  "preserves skewed n-ary %s weights and each usable grid while moving an ancestor",
  (axis, required) => {
    const inner: PaneLayout<string> = {
      kind: "split",
      direction: axis,
      children: [leaf("C"), leaf("D"), leaf("E")],
      weights: [0.1, 0.2, 0.7],
    };
    const layout: PaneLayout<string> = {
      kind: "split",
      direction: axis,
      weights: [0.5, 0.5],
      children: [
        {
          kind: "split",
          direction: axis === "row" ? "column" : "row",
          children: [leaf("A"), inner],
          weights: [0.5, 0.5],
        },
        leaf("B"),
      ],
    };
    const measure = (pane: string) => ({
      cellWidth: pane === "D" ? 15 : 10,
      cellHeight: pane === "D" ? 30 : 20,
      insetWidth: pane === "C" ? 20 : 0,
      insetHeight: pane === "C" ? 10 : 0,
    });
    // An exactly representable 8192px child budget keeps strict fit assertions
    // independent of sub-pixel subtraction roundoff at the opposite clamp.
    const width = axis === "row" ? 8196 : 800;
    const height = axis === "row" ? 800 : 8196;
    expect(fitsPaneLayout(layout, width, height, measure)).toBe(true);
    const minimum = (child: PaneLayout<string>) =>
      minimumLayoutExtent(child, axis, measure) / 8192;
    const resized = resizeSplit(layout, [], 0, -1, minimum);
    if (resized.kind !== "split") throw new Error("Expected retained split");
    // C's 10% share determines the stop, not an optimally rebalanced sum.
    expect(resized.weights[0]! * 8192).toBeCloseTo(required);
    expect(fitsPaneLayout(resized, width, height, measure)).toBe(true);
    expect(resized.children).toBe(layout.children);
    const expanded = resizeSplit(layout, [], 0, 1, minimum);
    expect(fitsPaneLayout(expanded, width, height, measure)).toBe(true);
    const impossible = resizeSplit(
      resized,
      [],
      0,
      -1,
      (child) => minimumLayoutExtent(child, axis, measure) / 996,
    );
    expect(impossible).toBe(resized);
  },
);
