import { describe, expect, it } from "vitest";
import {
  hoverCellPoint,
  inspectHoverPixels,
  requireHoverDraw,
  requireHoverPixels,
  sameHoverGeometry,
  validateHoverGeometry,
  type HoverDraw,
  type HoverGeometry,
} from "../fixtures/restty-hover-evidence";

const geometry: HoverGeometry = {
  canvas: { x: 2, y: 3, width: 25.4, height: 25.4 },
  backing: { width: 25, height: 25 },
  viewport: { width: 40, height: 32 },
  dpr: 1,
  cols: 3,
  rows: 3,
  cellWidth: 8,
  cellHeight: 8,
};
const draw: HoverDraw = {
  revision: 3,
  cells: 4,
  setAt: 10,
  cellRevision: 3,
  cellSetAt: 10,
  drawRevision: 3,
  drawCellRevision: 3,
  drawCells: 4,
  drawAt: 11,
  draws: 2,
};
const buffers = (g = geometry) => ({
  width: Math.round(g.viewport.width * g.dpr),
  height: Math.round(g.viewport.height * g.dpr),
  first: new Uint8Array(
    Math.round(g.viewport.width * g.dpr) *
      Math.round(g.viewport.height * g.dpr) *
      4,
  ),
  second: new Uint8Array(
    Math.round(g.viewport.width * g.dpr) *
      Math.round(g.viewport.height * g.dpr) *
      4,
  ),
});
const paint = (bitmap: Uint8Array, width: number, x: number, y: number) => {
  bitmap[(y * width + x) * 4] = 255;
};

describe("exact native hover evidence", () => {
  it("uses cell metrics rather than distributing unused canvas edges", () => {
    validateHoverGeometry(geometry);
    expect(hoverCellPoint(geometry, 0, 2)).toEqual({ x: 22, y: 7 });
    expect(sameHoverGeometry(geometry, { ...geometry, cellWidth: 9 })).toBe(
      false,
    );
  });
  it.each([1, 1.5, 2])(
    "maps fractional CSS extents and native DPR %s without widening cells",
    (dpr) => {
      const g: HoverGeometry = {
        ...geometry,
        dpr,
        backing: {
          width: Math.floor(geometry.canvas.width * dpr),
          height: Math.floor(geometry.canvas.height * dpr),
        },
        cols: Math.floor((geometry.canvas.width * dpr) / 8),
        rows: Math.floor((geometry.canvas.height * dpr) / 8),
      };
      const b = buffers(g);
      // Interior points independently chosen from the exact backing cell pitch.
      for (const [col, row] of [
        [1, 0],
        [2, 0],
        [0, 1],
      ] as const)
        paint(
          b.second,
          b.width,
          Math.floor(
            g.canvas.x * dpr +
              ((col + 0.5) * 8 * g.canvas.width * dpr) / g.backing.width,
          ),
          Math.floor(
            g.canvas.y * dpr +
              ((row + 0.5) * 8 * g.canvas.height * dpr) / g.backing.height,
          ),
        );
      const destinations = g.cols; // first row col1..last, then next row col0
      // Complete intervening cells when DPR introduces a larger grid.
      for (let col = 3; col < g.cols; col++)
        paint(
          b.second,
          b.width,
          Math.floor(
            g.canvas.x * dpr +
              ((col + 0.5) * 8 * g.canvas.width * dpr) / g.backing.width,
          ),
          Math.floor(
            g.canvas.y * dpr + (4 * g.canvas.height * dpr) / g.backing.height,
          ),
        );
      const pixels = inspectHoverPixels(
        b.first,
        b.second,
        b.width,
        b.height,
        g,
        { prefix: 1, destinations },
      );
      expect(pixels).toMatchObject({
        total: destinations,
        complement: 0,
        unusedEdges: 0,
        missingCells: 0,
      });
      requireHoverPixels(pixels);
    },
  );
  it("checks wide continuation, soft-wrap and the whole remaining grid", () => {
    const b = buffers();
    for (const [x, y] of [
      [14, 7],
      [22, 7],
      [6, 15],
      [14, 15],
    ] as const)
      paint(b.second, b.width, x, y);
    const pixels = inspectHoverPixels(
      b.first,
      b.second,
      b.width,
      b.height,
      geometry,
      { prefix: 1, destinations: 4 },
    );
    expect(pixels).toMatchObject({
      total: 4,
      expectedCells: 4,
      missingCells: 0,
      complement: 0,
    });
    requireHoverPixels(pixels);
    paint(b.second, b.width, 22, 23); // unrelated row beyond the old checked rows
    expect(() =>
      requireHoverPixels(
        inspectHoverPixels(b.first, b.second, b.width, b.height, geometry, {
          prefix: 1,
          destinations: 4,
        }),
      ),
    ).toThrow("pixel-mismatch");
  });
  it.each([
    [6, 7],
    [27, 7],
    [6, 28],
  ])("rejects prefix or unused-edge ink at %s:%s", (x, y) => {
    const b = buffers();
    paint(b.second, b.width, x, y);
    const pixels = inspectHoverPixels(
      b.first,
      b.second,
      b.width,
      b.height,
      geometry,
      { prefix: 0, destinations: 0 },
    );
    expect(pixels.complement).toBe(1);
    expect(pixels.unusedEdges).toBe(Number(x === 27 || y === 28));
    expect(() => requireHoverPixels(pixels)).toThrow("pixel-mismatch");
  });
  it("quantizes exact projected coverage but cannot count edge spill as a complete cell", () => {
    const b = buffers();
    // Cell1 projects to [10.128,18.256). Native pixel18 straddles its edge.
    paint(b.second, b.width, 14, 7);
    paint(b.second, b.width, 18, 7);
    const inspect = () =>
      inspectHoverPixels(b.first, b.second, b.width, b.height, geometry, {
        prefix: 1,
        destinations: 1,
      });
    expect(inspect()).toMatchObject({
      total: 2,
      complement: 0,
      missingCells: 0,
    });
    requireHoverPixels(inspect());
    paint(b.second, b.width, 19, 7); // wholly beyond that exact projection
    expect(inspect().complement).toBe(1);
    expect(() => requireHoverPixels(inspect())).toThrow("pixel-mismatch");
    b.second.fill(0);
    paint(b.second, b.width, 18, 7);
    expect(inspect()).toMatchObject({ complement: 0, missingCells: 1 });
    expect(() => requireHoverPixels(inspect())).toThrow("pixel-mismatch");
  });
  it("rejects missing destinations and retained released cue pixels", () => {
    const b = buffers();
    expect(
      inspectHoverPixels(b.first, b.second, b.width, b.height, geometry, {
        prefix: 1,
        destinations: 4,
      }),
    ).toMatchObject({
      missingCells: 4,
      mismatches: [
        { row: 0, col: 1, count: 0, expected: true },
        { row: 0, col: 2, count: 0, expected: true },
        { row: 1, col: 0, count: 0, expected: true },
        { row: 1, col: 1, count: 0, expected: true },
      ],
    });
    paint(b.second, b.width, 14, 7);
    expect(() =>
      requireHoverPixels(
        inspectHoverPixels(b.first, b.second, b.width, b.height, geometry, {
          prefix: 1,
          destinations: 0,
        }),
      ),
    ).toThrow("pixel-mismatch");
  });
  it.each([
    { ...geometry, backing: { width: 26, height: 25 } },
    { ...geometry, cols: 4 },
    { ...geometry, dpr: NaN },
    { ...geometry, cellHeight: 0 },
    { ...geometry, canvas: { ...geometry.canvas, x: -0.5 } },
    { ...geometry, canvas: { ...geometry.canvas, width: 40 } },
  ])("rejects incoherent or incomplete geometry", (g) =>
    expect(() => validateHoverGeometry(g)).toThrow("preparation"),
  );
  it("rejects cropped/scaled/truncated bitmaps rather than guessing a mapping", () => {
    const b = buffers();
    expect(() =>
      inspectHoverPixels(b.first, b.second, 25, 25, geometry, {
        prefix: 0,
        destinations: 0,
      }),
    ).toThrow("preparation");
    expect(() =>
      inspectHoverPixels(
        b.first,
        b.second.subarray(4),
        b.width,
        b.height,
        geometry,
        { prefix: 0, destinations: 0 },
      ),
    ).toThrow("preparation");
  });
});

describe("current-stimulus draw evidence", () => {
  it("accepts an observed current draw, including a no-link stimulus", () => {
    requireHoverDraw(draw, 3, 4);
    requireHoverDraw({ ...draw, cells: 0, drawCells: 0 }, 3, 0);
  });
  it("does not equate elapsed 100ms, an older draw or missing metadata with readiness", () => {
    for (const change of [
      { drawRevision: 2 },
      { drawCellRevision: 2 },
      { drawCellRevision: NaN },
      { cellSetAt: NaN },
      { cellSetAt: -1 },
      { cellSetAt: 12 },
      { drawRevision: 4 },
      { drawCells: 3 },
      { drawAt: 9 },
      { drawAt: NaN },
      { setAt: NaN },
      { draws: 0 },
      { draws: NaN },
    ])
      expect(() => requireHoverDraw({ ...draw, ...change }, 3, 4)).toThrow(
        "cue-not-drawn",
      );
    expect(() =>
      requireHoverDraw(
        { ...draw, drawAt: undefined } as unknown as HoverDraw,
        3,
        4,
      ),
    ).toThrow("cue-not-drawn");
  });
  it("distinguishes invalidation even if a later clear has already drawn", () => {
    expect(() =>
      requireHoverDraw(
        { ...draw, revision: 4, cells: 0, drawRevision: 4, drawCells: 0 },
        3,
        4,
      ),
    ).toThrow("stimulus-invalidated");
  });
});
