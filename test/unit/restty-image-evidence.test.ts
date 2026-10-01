import { describe, expect, it } from "vitest";
import {
  inspectResttyImageFrame,
  hasResttyImagePlacementEvidence,
} from "../fixtures/restty-image-evidence";

// Independent cell geometry: 20 x 20 bitmap pixels, 40 columns, 20 rows.
// A varied opaque Pi image at (0,0,4,3), green Chafa at (9,4,2,2).
function frame() {
  const width = 800;
  const height = 400;
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let offset = 3; offset < pixels.length; offset += 4)
    pixels[offset] = 255;
  const paint = (x: number, y: number, w: number, h: number, green = false) => {
    for (let dy = 0; dy < h; dy++)
      for (let dx = 0; dx < w; dx++) {
        const offset = ((y + dy) * width + x + dx) * 4;
        pixels.set(
          green
            ? [0, 255, 0, 255]
            : [(dx * 7) % 256, (dy * 11) % 256, (dx * 31 + dy * 17) % 256, 255],
          offset,
        );
      }
  };
  const inspect = () => inspectResttyImageFrame(pixels, width, height, 20, 20);
  return { pixels, paint, inspect };
}

describe("Restty image placement evidence", () => {
  it("counts a duplicate in the upper rows outside BOTH legitimate images", () => {
    const image = frame();
    image.paint(0, 0, 80, 60);
    image.paint(180, 80, 40, 40, true);
    expect(hasResttyImagePlacementEvidence(image.inspect())).toBe(true);
    image.paint(500, 80, 40, 40, true);
    const evidence = image.inspect();
    expect(evidence.greenOutsideChafaPlacement).toBe(1_600);
    expect(evidence.changedOutsidePlacements).toBe(1_600);
  });

  it("rejects duplicate and displaced frames at the same acceptance seam used after host operations", () => {
    const correct = frame();
    correct.paint(0, 0, 80, 60);
    correct.paint(180, 80, 40, 40, true);
    expect(hasResttyImagePlacementEvidence(correct.inspect())).toBe(true);
    correct.paint(500, 80, 40, 40, true);
    expect(hasResttyImagePlacementEvidence(correct.inspect())).toBe(false);

    const displaced = frame();
    displaced.paint(300, 0, 80, 60);
    displaced.paint(500, 80, 40, 40, true);
    expect(hasResttyImagePlacementEvidence(displaced.inspect())).toBe(false);
  });

  it("does not mistake a scrollbar-edge pixel for the cleared frame background", () => {
    const image = frame();
    for (let offset = 0; offset < image.pixels.length; offset += 4)
      image.pixels.set([20, 20, 20, 255], offset);
    image.paint(0, 0, 80, 60);
    image.paint(180, 80, 40, 40, true);
    image.pixels.set([0, 0, 0, 255], image.pixels.length - 4);
    expect(image.inspect().changedOutsidePlacements).toBe(1);
  });

  it.each([1, 1.25, 2, 2.5])(
    "keeps placement and cardinality at DPR %s with unused canvas edges",
    (dpr) => {
      const cell = 20 * dpr;
      const width = 40 * cell + 7;
      const height = 20 * cell + 9;
      const pixels = new Uint8ClampedArray(width * height * 4);
      const paint = (
        column: number,
        row: number,
        columns: number,
        rows: number,
        green: boolean,
      ) => {
        for (let y = 0; y < rows * cell; y++)
          for (let x = 0; x < columns * cell; x++) {
            const offset = ((row * cell + y) * width + column * cell + x) * 4;
            pixels.set(
              green
                ? [0, 255, 0, 255]
                : [(x * 7) % 256, (y * 11) % 256, (x * 31 + y * 17) % 256, 255],
              offset,
            );
          }
      };
      const inspect = () =>
        inspectResttyImageFrame(pixels, width, height, cell, cell);
      paint(0, 0, 4, 3, false);
      paint(9, 4, 2, 2, true);
      const correct = inspect();
      expect(correct.greenOutsideChafaPlacement).toBe(0);
      expect(correct.colorBucketsOutsidePlacements).toBe(0);
      expect(hasResttyImagePlacementEvidence(correct)).toBe(true);
      // A duplicate Pi also contains green; BOTH valid rectangles must be excluded.
      paint(25, 1, 4, 3, false);
      expect(hasResttyImagePlacementEvidence(inspect())).toBe(false);
      pixels.fill(0);
      paint(0, 0, 4, 3, false);
      paint(9, 5, 2, 2, true); // Just one row displaced, not a lost image.
      expect(hasResttyImagePlacementEvidence(inspect())).toBe(false);
    },
  );
});
