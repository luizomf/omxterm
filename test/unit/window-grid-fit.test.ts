import { expect, it } from "vitest";
import { windowGridFits } from "../fixtures/window-grid-fit";

it("requires a full visible grid without an extra clipped row or column", () => {
  const backing = { width: 800, height: 480 };
  const cell = { width: 10, height: 20 };
  expect(windowGridFits(backing, cell, { cols: 80, rows: 24 })).toBe(true);
  expect(windowGridFits(backing, cell, { cols: 80, rows: 25 })).toBe(false);
  expect(windowGridFits(backing, cell, { cols: 81, rows: 24 })).toBe(false);
  expect(windowGridFits(backing, cell, { cols: 79, rows: 24 })).toBe(false);
});
it("floors actual backing pixels and rejects invalid cell geometry", () => {
  expect(
    windowGridFits(
      { width: 809, height: 499 },
      { width: 10, height: 20 },
      { cols: 80, rows: 24 },
    ),
  ).toBe(true);
  expect(
    windowGridFits(
      { width: 800, height: 480 },
      { width: 0, height: 20 },
      { cols: 80, rows: 24 },
    ),
  ).toBe(false);
});
