import dejaVuSansMonoBoldBytes from "../../assets/fonts/DejaVuSansMono-Bold.ttf";
import dejaVuSansMonoBytes from "../../assets/fonts/DejaVuSansMono.ttf";
import firaCodeBoldBytes from "../../assets/fonts/FiraCodeNerdFontMono-Bold.ttf";
import firaCodeRegularBytes from "../../assets/fonts/FiraCodeNerdFontMono-Regular.ttf";
import jetBrainsNerdFontBytes from "../../assets/fonts/JetBrainsMonoNerdFontMono-Regular.ttf";
import type {
  TerminalFontData,
  TerminalFontFaceData,
} from "../shared/terminal-font-data";

export const DEFAULT_TERMINAL_FONT_FAMILY = "FiraCode Nerd Font Mono";

export interface TerminalFontInput {
  readonly data: Uint8Array | ArrayBuffer;
  readonly name: string;
  readonly weight?: number;
  readonly style?: "normal" | "italic";
  readonly faceIndex?: number;
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
  const snapshots = new Map<Uint8Array, ArrayBuffer>();
  const snapshot = (data: Uint8Array) => {
    let buffer = snapshots.get(data);
    if (!buffer) {
      buffer = nativeFontSnapshot(data);
      snapshots.set(data, buffer);
    }
    return buffer;
  };
  const configured: TerminalFontInput[] = [];
  const add = (
    face: TerminalFontFaceData | undefined,
    weight: number,
    style: "normal" | "italic",
    suffix: string,
  ) => {
    if (!face) return;
    if (face.family !== expectedFamily)
      throw new Error("Configured Terminal Font style family mismatch");
    configured.push({
      data: snapshot(face.data),
      name: `${fontSourceFamily(face)}${suffix}`,
      weight,
      style,
      ...(face.faceIndex === undefined ? {} : { faceIndex: face.faceIndex }),
    });
  };
  add(fontData.configured, 400, "normal", "");
  add(fontData.configuredStyles?.bold, 700, "normal", " Bold");
  add(fontData.configuredStyles?.italic, 400, "italic", " Italic");
  add(fontData.configuredStyles?.boldItalic, 700, "italic", " Bold Italic");
  const fonts: TerminalFontInput[] = [
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
      data: snapshot(font.data),
      name: fontSourceFamily(font),
    })),
  ];
  // Restty searches styles across the entire stack. Keep bundled bold out of
  // the configured-family path, including when that family's bold is absent.
  return [
    ...configured,
    ...(fontData.configured
      ? fonts.filter((font) => font.weight !== 700)
      : fonts),
  ];
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
