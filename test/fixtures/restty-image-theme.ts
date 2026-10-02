import {
  DEFAULT_TERMINAL_THEME,
  type TerminalTheme,
} from "../../src/shared/terminal-theme";

export const HOST_IMAGE_THEME_B: TerminalTheme = {
  ...DEFAULT_TERMINAL_THEME,
  name: "host-image-palette-B",
  colors: {
    ...DEFAULT_TERMINAL_THEME.colors,
    background: "#192235",
    red: "#c04783",
  },
};

export interface ResttyImageThemePixels {
  readonly background: readonly number[];
  readonly retainedAnsiRed: readonly number[];
}

// Self-contained: called on real native screenshot pixels in the renderer.
export function inspectResttyThemePixels(
  all: Uint8ClampedArray,
  width: number,
  height: number,
  cellWidth: number,
  cellHeight: number,
): ResttyImageThemePixels {
  if (width < 18 * cellWidth || height < 12 * cellHeight)
    throw new Error(
      "Retained palette swatch is outside the observed image grid",
    );
  const sample = (column: number, row: number) => {
    const offset =
      (Math.floor((row + 0.5) * cellHeight) * width +
        Math.floor((column + 0.5) * cellWidth)) *
      4;
    return Array.from(all.slice(offset, offset + 4));
  };
  return { background: sample(12, 0), retainedAnsiRed: sample(15, 9) };
}

export function hasResttyThemePalette(
  pixels: ResttyImageThemePixels,
  theme: TerminalTheme,
): boolean {
  const rgb = (hex: string) =>
    [1, 3, 5].map((offset) =>
      Number.parseInt(hex.slice(offset, offset + 2), 16),
    );
  const matches = (observed: readonly number[], color: string) =>
    observed.length === 4 &&
    observed[3] === 255 &&
    observed.slice(0, 3).every((value, index) => value === rgb(color)[index]);
  return (
    matches(pixels.background, theme.colors.background) &&
    matches(pixels.retainedAnsiRed, theme.colors.red)
  );
}
