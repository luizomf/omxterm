import type {
  GhosttyTheme,
  ResttyManagedPaneSearchUiStyleOptions,
} from "restty";
import type { TerminalTheme } from "../shared/terminal-theme";

function color(hex: string) {
  const value = Number.parseInt(hex.slice(1), 16);
  return { r: value >> 16, g: (value >> 8) & 0xff, b: value & 0xff };
}

export function toGhosttyTheme(theme: TerminalTheme): GhosttyTheme {
  const colors = theme.colors;
  const palette = new Array<ReturnType<typeof color> | undefined>(256);
  const ansi = [
    colors.black,
    colors.red,
    colors.green,
    colors.yellow,
    colors.blue,
    colors.magenta,
    colors.cyan,
    colors.white,
    colors.brightBlack,
    colors.brightRed,
    colors.brightGreen,
    colors.brightYellow,
    colors.brightBlue,
    colors.brightMagenta,
    colors.brightCyan,
    colors.brightWhite,
  ];
  ansi.forEach((value, index) => (palette[index] = color(value)));
  return {
    name: theme.name,
    colors: {
      background: color(colors.background),
      foreground: color(colors.foreground),
      cursor: color(colors.cursor),
      selectionBackground: color(colors.selectionBackground),
      selectionForeground: color(colors.selectionForeground),
      palette,
    },
    raw: {},
  };
}

// Mixes two validated #rrggbb colors in sRGB, like CSS color-mix(), so the
// result stays a plain hex color with a checkable contrast.
export function mixThemeColors(
  foreground: string,
  background: string,
  percent: number,
): string {
  const [fg, bg] = [color(foreground), color(background)];
  const channel = (from: number, to: number) =>
    Math.round(to + ((from - to) * percent) / 100)
      .toString(16)
      .padStart(2, "0");
  return `#${channel(fg.r, bg.r)}${channel(fg.g, bg.g)}${channel(fg.b, bg.b)}`;
}

// The search bar follows the Terminal Theme instead of Restty's fixed dark
// palette, so light themes keep a legible bar.
export function toResttySearchUiStyle(
  theme: TerminalTheme,
): ResttyManagedPaneSearchUiStyleOptions {
  const { background, foreground } = theme.colors;
  const tint = (percent: number) =>
    mixThemeColors(foreground, background, percent);
  return {
    panelBackground: background,
    panelBorderColor: tint(25),
    panelTextColor: foreground,
    inputBackground: tint(8),
    inputTextColor: foreground,
    inputPlaceholderColor: tint(65),
    buttonTextColor: foreground,
    buttonHoverBackground: tint(14),
    statusTextColor: tint(70),
    statusActiveTextColor: foreground,
    statusCompleteTextColor: tint(70),
  };
}

// The match counter sits on the same surface as the query field.
export function toResttySearchStatusStyle(theme: TerminalTheme): {
  readonly background: string;
  readonly borderColor: string;
} {
  const { background, foreground } = theme.colors;
  return {
    background: mixThemeColors(foreground, background, 8),
    borderColor: mixThemeColors(foreground, background, 25),
  };
}
