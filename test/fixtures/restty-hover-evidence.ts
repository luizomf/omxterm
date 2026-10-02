export interface HoverGeometry {
  readonly canvas: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  };
  readonly backing: { readonly width: number; readonly height: number };
  readonly viewport: { readonly width: number; readonly height: number };
  readonly dpr: number;
  readonly cols: number;
  readonly rows: number;
  readonly cellWidth: number;
  readonly cellHeight: number;
}

export interface HoverDraw {
  readonly revision: number;
  readonly cells: number;
  readonly setAt: number;
  readonly drawRevision: number;
  readonly drawCells: number;
  readonly drawAt: number;
  readonly draws: number;
}

export type HoverFailureCategory =
  | "preparation"
  | "geometry-changed"
  | "stimulus-invalidated"
  | "cue-not-drawn"
  | "pixel-mismatch";
export class HoverEvidenceError extends Error {
  constructor(readonly category: HoverFailureCategory) {
    super(`Restty hover ${category}`);
  }
}

export function validateHoverGeometry(geometry: HoverGeometry): void {
  const { canvas, backing, viewport, dpr, cols, rows, cellWidth, cellHeight } =
    geometry;
  if (
    ![canvas.x, canvas.y, canvas.width, canvas.height, dpr].every(
      Number.isFinite,
    ) ||
    dpr <= 0 ||
    canvas.x < 0 ||
    canvas.y < 0 ||
    canvas.width <= 0 ||
    canvas.height <= 0 ||
    ![
      backing.width,
      backing.height,
      viewport.width,
      viewport.height,
      cols,
      rows,
      cellWidth,
      cellHeight,
    ].every((value) => Number.isSafeInteger(value) && value > 0) ||
    backing.width !== Math.floor(canvas.width * dpr) ||
    backing.height !== Math.floor(canvas.height * dpr) ||
    cols !== Math.floor(backing.width / cellWidth) ||
    rows !== Math.floor(backing.height / cellHeight) ||
    canvas.x + canvas.width > viewport.width ||
    canvas.y + canvas.height > viewport.height
  )
    throw new HoverEvidenceError("preparation");
}

export function sameHoverGeometry(
  first: HoverGeometry,
  second: HoverGeometry,
): boolean {
  return JSON.stringify(first) === JSON.stringify(second);
}

export function requireHoverDraw(
  draw: HoverDraw,
  revision: number,
  cells: number,
): void {
  if (
    !Number.isSafeInteger(revision) ||
    revision <= 0 ||
    draw.revision !== revision ||
    draw.cells !== cells
  )
    throw new HoverEvidenceError("stimulus-invalidated");
  if (
    !Number.isSafeInteger(draw.drawRevision) ||
    !Number.isSafeInteger(draw.drawCells) ||
    !Number.isSafeInteger(draw.draws) ||
    !Number.isFinite(draw.setAt) ||
    draw.setAt < 0 ||
    draw.drawRevision !== revision ||
    draw.drawCells !== cells ||
    !Number.isFinite(draw.drawAt) ||
    draw.drawAt < draw.setAt ||
    draw.draws <= 0
  )
    throw new HoverEvidenceError("cue-not-drawn");
}

export function hoverCellPoint(
  geometry: HoverGeometry,
  row: number,
  col: number,
): { x: number; y: number } {
  validateHoverGeometry(geometry);
  if (
    !Number.isInteger(row) ||
    !Number.isInteger(col) ||
    row < 0 ||
    row >= geometry.rows ||
    col < 0 ||
    col >= geometry.cols
  )
    throw new HoverEvidenceError("preparation");
  // Restty's pointer lookup uses device cell metrics / DPR, not leftover edges.
  const x = Math.floor(
    geometry.canvas.x + ((col + 0.5) * geometry.cellWidth) / geometry.dpr,
  );
  const y = Math.floor(
    geometry.canvas.y + ((row + 0.5) * geometry.cellHeight) / geometry.dpr,
  );
  if (
    Math.floor(
      ((x - geometry.canvas.x) * geometry.dpr) / geometry.cellWidth,
    ) !== col ||
    Math.floor(
      ((y - geometry.canvas.y) * geometry.dpr) / geometry.cellHeight,
    ) !== row
  )
    throw new HoverEvidenceError("preparation");
  return { x, y };
}

export interface HoverPixels {
  readonly total: number;
  readonly complement: number;
  readonly unusedEdges: number;
  readonly expectedCells: number;
  readonly missingCells: number;
  readonly destinationMin: number;
  readonly destinationMax: number;
  readonly mismatches: readonly {
    readonly row: number;
    readonly col: number;
    readonly count: number;
    readonly expected: boolean;
  }[];
}

// Full native viewport capture: do not round a fractional canvas crop or assume
// its backing size equals capturePage's bitmap size. Cell rectangles retain their
// exact CSS projection. Partial native pixels touching a rectangle belong to its
// raster coverage; presence requires interior ink, so neighbouring edge ink alone
// cannot satisfy a missing cell. No rectangle or pixel budget is enlarged.
function samePixel(
  first: Uint8Array,
  second: Uint8Array,
  offset: number,
): boolean {
  return (
    first[offset] === second[offset] &&
    first[offset + 1] === second[offset + 1] &&
    first[offset + 2] === second[offset + 2] &&
    first[offset + 3] === second[offset + 3]
  );
}

interface PixelRectangle {
  readonly left: number;
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
}
function projectedRectangle(
  geometry: HoverGeometry,
  col: number,
  row: number,
  columns: number,
  rows: number,
): PixelRectangle {
  const sx = (geometry.canvas.width * geometry.dpr) / geometry.backing.width;
  const sy = (geometry.canvas.height * geometry.dpr) / geometry.backing.height;
  return {
    left: geometry.canvas.x * geometry.dpr + col * geometry.cellWidth * sx,
    top: geometry.canvas.y * geometry.dpr + row * geometry.cellHeight * sy,
    right:
      geometry.canvas.x * geometry.dpr +
      (col + columns) * geometry.cellWidth * sx,
    bottom:
      geometry.canvas.y * geometry.dpr +
      (row + rows) * geometry.cellHeight * sy,
  };
}
function pixelRectangle(
  rect: PixelRectangle,
  interior: boolean,
): PixelRectangle {
  return {
    left: interior ? Math.ceil(rect.left) : Math.floor(rect.left),
    top: interior ? Math.ceil(rect.top) : Math.floor(rect.top),
    right: interior ? Math.floor(rect.right) : Math.ceil(rect.right),
    bottom: interior ? Math.floor(rect.bottom) : Math.ceil(rect.bottom),
  };
}
function countRectangle(
  first: Uint8Array,
  second: Uint8Array,
  width: number,
  rect: PixelRectangle,
): number {
  let count = 0;
  for (let y = rect.top; y < rect.bottom; y++)
    for (let x = rect.left; x < rect.right; x++)
      if (!samePixel(first, second, (y * width + x) * 4)) count++;
  return count;
}

export function inspectHoverPixels(
  first: Uint8Array,
  second: Uint8Array,
  width: number,
  height: number,
  geometry: HoverGeometry,
  span: { readonly prefix: number; readonly destinations: number },
): HoverPixels {
  const { prefix, destinations } = span;
  validateHoverGeometry(geometry);
  if (
    width !== Math.round(geometry.viewport.width * geometry.dpr) ||
    height !== Math.round(geometry.viewport.height * geometry.dpr) ||
    first.length !== width * height * 4 ||
    second.length !== first.length ||
    !Number.isSafeInteger(prefix) ||
    !Number.isSafeInteger(destinations) ||
    prefix < 0 ||
    destinations < 0 ||
    prefix + destinations > geometry.cols * geometry.rows
  )
    throw new HoverEvidenceError("preparation");
  const allowed = new Uint8Array(width * height);
  const counts = Array.from(
    { length: geometry.cols * geometry.rows },
    (_, index) => {
      const cell = projectedRectangle(
        geometry,
        index % geometry.cols,
        Math.floor(index / geometry.cols),
        1,
        1,
      );
      if (index >= prefix && index < prefix + destinations) {
        const rect = pixelRectangle(cell, false);
        for (let y = rect.top; y < Math.min(height, rect.bottom); y++)
          allowed.fill(
            1,
            y * width + rect.left,
            y * width + Math.min(width, rect.right),
          );
      }
      return countRectangle(first, second, width, pixelRectangle(cell, true));
    },
  );
  const canvas = pixelRectangle(
    {
      left: geometry.canvas.x * geometry.dpr,
      top: geometry.canvas.y * geometry.dpr,
      right: (geometry.canvas.x + geometry.canvas.width) * geometry.dpr,
      bottom: (geometry.canvas.y + geometry.canvas.height) * geometry.dpr,
    },
    false,
  );
  const grid = pixelRectangle(
    projectedRectangle(geometry, 0, 0, geometry.cols, geometry.rows),
    false,
  );
  let total = 0,
    complement = 0,
    unusedEdges = 0;
  for (let y = canvas.top; y < Math.min(height, canvas.bottom); y++)
    for (let x = canvas.left; x < Math.min(width, canvas.right); x++) {
      const pixel = y * width + x;
      if (samePixel(first, second, pixel * 4)) continue;
      total++;
      if (!allowed[pixel]) complement++;
      if (x >= grid.right || y >= grid.bottom) unusedEdges++;
    }
  const mismatches = counts.flatMap((count, index) => {
    const expected = index >= prefix && index < prefix + destinations;
    return expected !== count > 0
      ? [
          {
            row: Math.floor(index / geometry.cols),
            col: index % geometry.cols,
            count,
            expected,
          },
        ]
      : [];
  });
  const destinationCounts = counts.slice(prefix, prefix + destinations);
  return {
    total,
    complement,
    unusedEdges,
    expectedCells: destinations,
    missingCells: destinationCounts.filter((count) => count === 0).length,
    destinationMin: destinationCounts.length
      ? Math.min(...destinationCounts)
      : 0,
    destinationMax: destinationCounts.length
      ? Math.max(...destinationCounts)
      : 0,
    mismatches: mismatches.slice(0, 16),
  };
}

export function requireHoverPixels(pixels: HoverPixels): void {
  if (
    pixels.missingCells ||
    pixels.complement ||
    pixels.unusedEdges ||
    pixels.mismatches.length
  )
    throw new HoverEvidenceError("pixel-mismatch");
}
