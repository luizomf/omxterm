import { expect, it } from "vitest";
import { hasTextRenderingEvidence } from "../fixtures/text-rendering-evidence";

const width = 900;
const height = 600;
const regions = [
  { x: 20, y: 24, width: 70, height: 24 },
  { x: 100, y: 24, width: 60, height: 24 },
  { x: 170, y: 24, width: 30, height: 24 },
];
const frame = () => new Uint8Array(width * height * 4);
function paint(
  bitmap: Uint8Array,
  x: number,
  y: number,
  columns: number,
  rows: number,
): void {
  for (let row = y; row < y + rows; row++)
    for (let col = x; col < x + columns; col++)
      bitmap.fill(255, (row * width + col) * 4, (row * width + col) * 4 + 4);
}

it("rejects blank and cursor-only frames, even inside the expected text", () => {
  const blank = frame();
  expect(hasTextRenderingEvidence(blank, blank, width, height, regions)).toBe(
    false,
  );
  for (const region of regions) {
    for (const [columns, rows] of [
      [1, 24],
      [10, 24],
      [10, 3],
    ] as const) {
      const cursor = frame();
      paint(cursor, region.x, region.y, columns, rows);
      expect(
        hasTextRenderingEvidence(blank, cursor, width, height, regions),
      ).toBe(false);
    }
  }
});

it("requires new distributed ink in the expected words, not elsewhere or already present", () => {
  const blank = frame();
  const text = frame();
  for (const region of regions) paint(text, region.x + 4, region.y + 4, 6, 8);
  expect(hasTextRenderingEvidence(blank, text, width, height, regions)).toBe(
    true,
  );
  expect(hasTextRenderingEvidence(text, text, width, height, regions)).toBe(
    false,
  );
  const elsewhere = frame();
  paint(elsewhere, 400, 200, 200, 24);
  expect(
    hasTextRenderingEvidence(blank, elsewhere, width, height, regions),
  ).toBe(false);
});
