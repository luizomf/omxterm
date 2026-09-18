import dejaVuSansMonoBoldBytes from "../../assets/fonts/DejaVuSansMono-Bold.ttf";
import dejaVuSansMonoBytes from "../../assets/fonts/DejaVuSansMono.ttf";
import firaCodeBoldBytes from "../../assets/fonts/FiraCodeNerdFontMono-Bold.ttf";
import firaCodeRegularBytes from "../../assets/fonts/FiraCodeNerdFontMono-Regular.ttf";
import jetBrainsNerdFontBytes from "../../assets/fonts/JetBrainsMonoNerdFontMono-Regular.ttf";
import type { TerminalFontData } from "../shared/terminal-font-data";

export const DEFAULT_TERMINAL_FONT_FAMILY = "FiraCode Nerd Font Mono";

export interface TerminalFontInput {
  readonly data: Uint8Array | ArrayBuffer;
  readonly name: string;
  readonly weight?: number;
  readonly style?: "normal";
}

/**
 * Keeps the complete Terminal Font Stack policy in one place. Restty selects
 * bold faces by their labels and falls through this order for missing glyphs.
 */
export function terminalFontInputs(
  fontData: TerminalFontData,
  expectedFamily = fontData.configured?.family,
): TerminalFontInput[] {
  if (fontData.configured?.family !== expectedFamily)
    throw new Error(
      "Configured Terminal Font data did not match the requested family",
    );
  const fonts: TerminalFontInput[] = [
    ...(fontData.configured
      ? [
          {
            data: nativeFontSnapshot(fontData.configured.data),
            name: fontSourceFamily(fontData.configured),
            weight: 400,
            style: "normal" as const,
          },
        ]
      : []),
    {
      data: firaCodeRegularBytes,
      name: DEFAULT_TERMINAL_FONT_FAMILY,
      weight: 400,
      style: "normal" as const,
    },
    {
      data: firaCodeBoldBytes,
      name: `${DEFAULT_TERMINAL_FONT_FAMILY} Bold`,
      weight: 700,
      style: "normal" as const,
    },
    {
      data: dejaVuSansMonoBytes,
      name: "DejaVu Sans Mono",
      weight: 400,
      style: "normal" as const,
    },
    {
      data: dejaVuSansMonoBoldBytes,
      name: "DejaVu Sans Mono Bold",
      weight: 700,
      style: "normal" as const,
    },
    { data: jetBrainsNerdFontBytes, name: "JetBrainsMono Nerd Font Mono" },
    ...fontData.fallbacks.map((font) => ({
      data: nativeFontSnapshot(font.data),
      name: fontSourceFamily(font),
    })),
  ];
  // Restty tries all bold-labelled faces before regular faces. Until configured
  // bold faces have a validated native route, preserve the configured family
  // for both styles instead of silently replacing its bold text with Fira.
  return fontData.configured
    ? fonts.filter((font) => font.weight !== 700)
    : fonts;
}

function nativeFontSnapshot(data: Uint8Array): ArrayBuffer {
  // Restty copies views but borrows ArrayBuffers. Own an exact-range snapshot
  // before publication so a generation can share one parser input without
  // borrowing IPC/caller bytes or retaining a second full native font.
  return new Uint8Array(data).buffer;
}

function fontSourceFamily(font: {
  readonly family: string;
  readonly sourceFamily?: string;
}): string {
  return font.sourceFamily ?? font.family;
}
