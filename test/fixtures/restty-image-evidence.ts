export interface ResttyImagePixelEvidence {
  readonly bitmapSize: readonly [number, number];
  readonly cellSize: readonly [number, number];
  readonly changedInPiPlacement: number;
  readonly changedOutsidePlacements: number;
  readonly colorBucketsInPiPlacement: number;
  readonly colorBucketsOutsidePlacements: number;
  readonly colorBucketsInBitmap: number;
  readonly greenInChafaPlacement: number;
  readonly greenInBitmap: number;
  readonly greenOutsideChafaPlacement: number;
}

// Self-contained: the native screenshot decoder executes this same inspector.
export function inspectResttyImageFrame(
  all: Uint8ClampedArray,
  width: number,
  height: number,
  cellWidth: number,
  cellHeight: number,
): ResttyImagePixelEvidence {
  const region = (
    column: number,
    row: number,
    columns: number,
    rowCount: number,
  ) => ({
    x: Math.floor(column * cellWidth),
    y: Math.floor(row * cellHeight),
    width: Math.ceil(columns * cellWidth),
    height: Math.ceil(rowCount * cellHeight),
  });
  const pi = region(0, 0, 4, 3);
  const chafa = region(9, 4, 2, 2);
  const inside = (x: number, y: number, rectangle: ReturnType<typeof region>) =>
    x >= rectangle.x &&
    y >= rectangle.y &&
    x < rectangle.x + rectangle.width &&
    y < rectangle.y + rectangle.height;
  // The emitter clears the frame; cell (12,0) is blank, away from either
  // image, the completion text below them, and the right-edge scrollbar.
  const backgroundOffset = Math.floor(12 * cellWidth) * 4;
  const background = [
    all[backgroundOffset]!,
    all[backgroundOffset + 1]!,
    all[backgroundOffset + 2]!,
  ];
  let changedInPiPlacement = 0;
  let changedOutsidePlacements = 0;
  let greenInChafaPlacement = 0;
  let greenInBitmap = 0;
  let greenOutsideChafaPlacement = 0;
  const piBuckets = new Set<number>();
  const outsideBuckets = new Set<number>();
  const allBuckets = new Set<number>();
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const offset = (y * width + x) * 4;
      const r = all[offset]!;
      const g = all[offset + 1]!;
      const b = all[offset + 2]!;
      const a = all[offset + 3]!;
      const inPi = inside(x, y, pi);
      const inChafa = inside(x, y, chafa);
      const outside = !inPi && !inChafa;
      const changed =
        a > 0 &&
        (Math.abs(r - background[0]!) > 4 ||
          Math.abs(g - background[1]!) > 4 ||
          Math.abs(b - background[2]!) > 4);
      const green = a > 200 && g > 200 && r < 150 && b < 120;
      if (changed && inPi) changedInPiPlacement++;
      if (changed && outside) changedOutsidePlacements++;
      if (green && inChafa) greenInChafaPlacement++;
      if (green) greenInBitmap++;
      if (green && outside) greenOutsideChafaPlacement++;
      if (a > 200) {
        const bucket = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
        allBuckets.add(bucket);
        if (inPi) piBuckets.add(bucket);
        if (outside) outsideBuckets.add(bucket);
      }
    }
  return {
    bitmapSize: [width, height],
    cellSize: [cellWidth, cellHeight],
    changedInPiPlacement,
    changedOutsidePlacements,
    colorBucketsInPiPlacement: piBuckets.size,
    colorBucketsOutsidePlacements: outsideBuckets.size,
    colorBucketsInBitmap: allBuckets.size,
    greenInChafaPlacement,
    greenInBitmap,
    greenOutsideChafaPlacement,
  };
}

export function hasResttyImagePlacementEvidence(
  evidence: ResttyImagePixelEvidence,
): boolean {
  const [cellWidth, cellHeight] = evidence.cellSize;
  const cellArea = cellWidth * cellHeight;
  // Pi must fill most of its 12 cells with varied image ink; the solid Chafa
  // must fill at least 3 of its 4 cells. Counts scale with actual device pixels.
  // Outside BOTH placements, allow only one raster-pixel perimeter of green
  // edge noise and a small palette (text/background antialiasing, not a Pi copy).
  // The expected rectangles themselves are never expanded.
  return (
    evidence.changedInPiPlacement > 1_000 &&
    evidence.changedInPiPlacement >= 6 * cellArea &&
    evidence.colorBucketsInPiPlacement > 1_000 &&
    evidence.greenInChafaPlacement >= 3 * cellArea &&
    evidence.greenOutsideChafaPlacement < 4 * (cellWidth + cellHeight) &&
    evidence.colorBucketsOutsidePlacements < 200
  );
}
