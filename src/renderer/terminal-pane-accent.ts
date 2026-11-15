import type { TerminalTheme } from "../shared/terminal-theme";

export function terminalPaneAccent(theme: TerminalTheme): string {
  return readableTone(theme, theme.colors.cyan);
}

// The agent mark's tone (ADR 0052): the theme's red, or its foreground when
// the red is too close to the background, like the pane accent's cyan.
export function terminalAgentTone(theme: TerminalTheme): string {
  return readableTone(theme, theme.colors.red);
}

function readableTone(theme: TerminalTheme, color: string): string {
  const { background, foreground } = theme.colors;
  const backgroundLuminance = luminance(background);
  const contrast = (color: string) => {
    const value = luminance(color);
    return (
      (Math.max(value, backgroundLuminance) + 0.05) /
      (Math.min(value, backgroundLuminance) + 0.05)
    );
  };
  const colorContrast = contrast(color);
  // This checks the configured opaque background, not desktop compositing.
  return colorContrast < 3 && contrast(foreground) > colorContrast
    ? foreground
    : color;
}

// A field's outline (--ui-input-border): the quietest mix of the foreground
// into the background that still reads 3:1 against that background, the
// floor for a control's boundary. High-contrast themes get a soft grey;
// low-contrast ones a firmer line, up to the foreground itself.
export function fieldBorderTone(background: string, foreground: string) {
  const channel = (hex: string, offset: number) =>
    Number.parseInt(hex.slice(offset, offset + 2), 16);
  const base = luminance(background);
  let tone = foreground;
  for (let share = 100; share >= 20; share -= 2) {
    const mixed = `#${[1, 3, 5]
      .map((offset) =>
        Math.round(
          channel(background, offset) +
            ((channel(foreground, offset) - channel(background, offset)) *
              share) /
              100,
        )
          .toString(16)
          .padStart(2, "0"),
      )
      .join("")}`;
    const value = luminance(mixed);
    if ((Math.max(value, base) + 0.05) / (Math.min(value, base) + 0.05) < 3)
      break;
    tone = mixed;
  }
  return tone;
}

export function luminance(hex: string): number {
  // Terminal Theme validation guarantees six-digit sRGB colors.
  const channels = [1, 3, 5].map((offset) => {
    const channel = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}
