import type { GhosttyTheme } from "restty";
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
