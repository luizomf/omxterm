import { describe, expect, it } from "vitest";
import {
  adjacentPane,
  directionalPane,
  equalizeLayout,
  isSerializedPaneLayout,
  layoutPanes,
  leaf,
  MIN_PANE_WEIGHT,
  removePane,
  resizeSplit,
  serializeLayout,
  splitPane,
  type PaneLayout,
} from "../../src/renderer/pane-layout";

describe("pane layout tree", () => {
  it("joins same-direction splits as siblings and nests cross-direction splits", () => {
    let layout: PaneLayout<string> = leaf("a");
    layout = splitPane(layout, "a", "b", "row");
    layout = splitPane(layout, "b", "c", "row");
    expect(layoutPanes(layout)).toEqual(["a", "b", "c"]);
    expect(layout).toMatchObject({
      kind: "split",
      direction: "row",
      weights: [0.5, 0.25, 0.25],
    });
    layout = splitPane(layout, "c", "d", "column");
    expect(layoutPanes(layout)).toEqual(["a", "b", "c", "d"]);
    expect(layout.kind === "split" && layout.children[2]).toMatchObject({
      kind: "split",
      direction: "column",
    });
  });

  it("removes panes, redistributes their share and collapses single children", () => {
    let layout: PaneLayout<string> = splitPane(leaf("a"), "a", "b", "row");
    layout = splitPane(layout, "b", "c", "column");
    const withoutC = removePane(layout, "c")!;
    expect(withoutC).toEqual({
      kind: "split",
      direction: "row",
      children: [leaf("a"), leaf("b")],
      weights: [0.5, 0.5],
    });
    expect(removePane(removePane(withoutC, "a")!, "b")).toBeUndefined();
    const three = splitPane(
      splitPane(leaf("a"), "a", "b", "row"),
      "b",
      "c",
      "row",
    );
    const two = removePane(three, "a")!;
    expect(two.kind === "split" && two.weights).toEqual([0.5, 0.5]);
  });

  it("clamps divider moves so no pane disappears", () => {
    const layout = splitPane(leaf("a"), "a", "b", "row");
    const grown = resizeSplit(layout, [], 0, 0.9);
    expect(grown.kind === "split" && grown.weights[1]).toBeCloseTo(
      MIN_PANE_WEIGHT,
    );
    const shrunk = resizeSplit(layout, [], 0, -0.2);
    expect(shrunk.kind === "split" && shrunk.weights).toEqual([0.3, 0.7]);
    expect(resizeSplit(layout, [], 4, 0.1)).toBe(layout);
    expect(resizeSplit(layout, [], 0, Number.NaN)).toBe(layout);
  });

  it("equalizes nested splits", () => {
    const layout = resizeSplit(
      splitPane(splitPane(leaf("a"), "a", "b", "row"), "b", "c", "row"),
      [],
      0,
      0.3,
    );
    expect(equalizeLayout(layout)).toMatchObject({
      weights: [1 / 3, 1 / 3, 1 / 3],
    });
  });

  it("cycles panes in tree order and finds geometric neighbors", () => {
    const layout = splitPane(
      splitPane(leaf("a"), "a", "b", "row"),
      "b",
      "c",
      "column",
    );
    expect(adjacentPane(layout, "a", 1)).toBe("b");
    expect(adjacentPane(layout, "a", -1)).toBe("c");
    expect(adjacentPane(leaf("a"), "a", 1)).toBeUndefined();
    const rectangles = {
      a: { left: 0, top: 0, right: 50, bottom: 100 },
      b: { left: 51, top: 0, right: 100, bottom: 50 },
      c: { left: 51, top: 51, right: 100, bottom: 100 },
    };
    const rectangle = (pane: string) => rectangles[pane as "a" | "b" | "c"];
    const panes = ["a", "b", "c"];
    expect(directionalPane(panes, "a", "right", rectangle)).toBe("b");
    expect(directionalPane(panes, "c", "left", rectangle)).toBe("a");
    expect(directionalPane(panes, "b", "down", rectangle)).toBe("c");
    expect(directionalPane(panes, "c", "up", rectangle)).toBe("b");
    expect(directionalPane(panes, "a", "left", rectangle)).toBeUndefined();
  });

  it("serializes layout shape without pane state and validates restored shapes", () => {
    const layout = splitPane(leaf("a"), "a", "b", "column");
    const serialized = serializeLayout(layout, (pane) =>
      ["a", "b"].indexOf(pane),
    );
    expect(serialized).toEqual({
      direction: "column",
      children: [{ pane: 0 }, { pane: 1 }],
      weights: [0.5, 0.5],
    });
    expect(isSerializedPaneLayout(serialized)).toBe(true);
    expect(isSerializedPaneLayout({ pane: -1 })).toBe(false);
    expect(
      isSerializedPaneLayout({
        direction: "row",
        children: [{ pane: 0 }],
        weights: [1],
      }),
    ).toBe(false);
    expect(isSerializedPaneLayout({ pane: 0, extra: true })).toBe(false);
  });
});
