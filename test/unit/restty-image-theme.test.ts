import { expect, it } from "vitest";
import {
  DEFAULT_TERMINAL_THEME,
  isTerminalTheme,
} from "../../src/shared/terminal-theme";
import {
  hasResttyThemePalette,
  HOST_IMAGE_THEME_B,
  inspectResttyThemePixels,
} from "../fixtures/restty-image-theme";

it("rejects changed host background when retained ANSI swatch still has the old runtime palette", () => {
  const pixels = new Uint8ClampedArray(200 * 140 * 4);
  for (let offset = 0; offset < pixels.length; offset += 4)
    pixels.set([0, 0, 0, 255], offset);
  // Independently specified old palette-B SGR41 interior, outside both images.
  for (let y = 90; y < 100; y++)
    for (let x = 150; x < 170; x++)
      pixels.set([192, 71, 131, 255], (y * 200 + x) * 4);
  const observed = inspectResttyThemePixels(pixels, 200, 140, 10, 10);
  expect(observed).toEqual({
    background: [0, 0, 0, 255],
    retainedAnsiRed: [192, 71, 131, 255],
  });
  expect(hasResttyThemePalette(observed, DEFAULT_TERMINAL_THEME)).toBe(false);
});

it("uses complete distinct palettes and requires retained opaque ANSI-red and background samples", () => {
  expect(isTerminalTheme(HOST_IMAGE_THEME_B)).toBe(true);
  expect(HOST_IMAGE_THEME_B.colors.background).not.toBe(
    DEFAULT_TERMINAL_THEME.colors.background,
  );
  expect(HOST_IMAGE_THEME_B.colors.red).not.toBe(
    DEFAULT_TERMINAL_THEME.colors.red,
  );
  expect(
    hasResttyThemePalette(
      { background: [25, 34, 53, 255], retainedAnsiRed: [192, 71, 131, 255] },
      HOST_IMAGE_THEME_B,
    ),
  ).toBe(true);
  expect(
    hasResttyThemePalette(
      { background: [0, 0, 0, 255], retainedAnsiRed: [255, 128, 170, 255] },
      DEFAULT_TERMINAL_THEME,
    ),
  ).toBe(true);
});
