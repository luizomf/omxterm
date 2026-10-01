export interface PixelRegion {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export function hasTextRenderingEvidence(
  blank: Uint8Array,
  text: Uint8Array,
  width: number,
  height: number,
  regions: readonly PixelRegion[],
): boolean {
  if (
    width <= 0 ||
    height <= 0 ||
    blank.length !== width * height * 4 ||
    text.length !== blank.length ||
    regions.length < 3
  )
    return false;

  // Separate expected words must each gain ink over a blank baseline. A
  // single bar, block or underline cursor cannot satisfy all three regions.
  // Counts/spread tolerate native glyph rasterization; no exact bitmap match.
  return regions.every((region) => {
    const { x, y, width: columns, height: rows } = region;
    if (
      ![x, y, columns, rows].every(Number.isInteger) ||
      x < 0 ||
      y < 0 ||
      columns <= 0 ||
      rows <= 0 ||
      x + columns > width ||
      y + rows > height
    )
      return false;
    let newInk = 0;
    const inkColumns = new Set<number>();
    for (let row = y; row < y + rows; row++) {
      for (let col = x; col < x + columns; col++) {
        const offset = (row * width + col) * 4;
        if (
          Math.max(blank[offset]!, blank[offset + 1]!, blank[offset + 2]!) > 100
        )
          return false;
        const foreground =
          Math.max(text[offset]!, text[offset + 1]!, text[offset + 2]!) > 100;
        const difference =
          Math.abs(text[offset]! - blank[offset]!) +
          Math.abs(text[offset + 1]! - blank[offset + 1]!) +
          Math.abs(text[offset + 2]! - blank[offset + 2]!);
        if (foreground && difference > 24) {
          newInk++;
          inkColumns.add(col);
        }
      }
    }
    return newInk > 20 && inkColumns.size > 3;
  });
}
