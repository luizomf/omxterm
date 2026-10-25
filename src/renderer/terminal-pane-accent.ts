import type { TerminalTheme } from "../shared/terminal-theme";

export function terminalPaneAccent(theme: TerminalTheme): string {
  const { background, cyan, foreground } = theme.colors;
  const backgroundLuminance = luminance(background);
  const contrast = (color: string) => {
    const value = luminance(color);
    return (
      (Math.max(value, backgroundLuminance) + 0.05) /
      (Math.min(value, backgroundLuminance) + 0.05)
    );
  };
  const cyanContrast = contrast(cyan);
  // This checks the configured opaque background, not desktop compositing.
  return cyanContrast < 3 && contrast(foreground) > cyanContrast
    ? foreground
    : cyan;
}

function luminance(hex: string): number {
  // Terminal Theme validation guarantees six-digit sRGB colors.
  const channels = [1, 3, 5].map((offset) => {
    const channel = Number.parseInt(hex.slice(offset, offset + 2), 16) / 255;
    return channel <= 0.04045
      ? channel / 12.92
      : ((channel + 0.055) / 1.055) ** 2.4;
  });
  return channels[0]! * 0.2126 + channels[1]! * 0.7152 + channels[2]! * 0.0722;
}
