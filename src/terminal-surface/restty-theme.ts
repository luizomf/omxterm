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

// The search bar follows the Terminal Theme instead of Restty's fixed dark
// palette, so light themes keep a legible bar.
export function toResttySearchUiStyle(
  theme: TerminalTheme,
): ResttyManagedPaneSearchUiStyleOptions {
  const { background, foreground } = theme.colors;
  const tint = (percent: number) =>
    `color-mix(in srgb, ${foreground} ${percent}%, ${background})`;
  return {
    panelBackground: background,
    panelBorderColor: tint(25),
    panelTextColor: foreground,
    inputBackground: tint(8),
    inputTextColor: foreground,
    inputPlaceholderColor: tint(55),
    buttonTextColor: foreground,
    buttonHoverBackground: tint(14),
    statusTextColor: tint(60),
    statusActiveTextColor: foreground,
    statusCompleteTextColor: tint(60),
  };
}
