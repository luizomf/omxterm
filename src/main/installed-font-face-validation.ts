import { Font, getFontFamily, getFontSubfamily } from "text-shaper";
import type { InstalledFontFace } from "./installed-font-family";
import type { TerminalFontStyle } from "../shared/terminal-font-data";

export class UnavailableFontStyle extends Error {}

export async function validateInstalledFontFace(
  face: InstalledFontFace,
  bytes: Uint8Array,
): Promise<{ sourceFamily: string; faceIndex: number }> {
  const buffer = bytes.buffer.slice(
    bytes.byteOffset,
    bytes.byteOffset + bytes.byteLength,
  ) as ArrayBuffer;
  const collection = Font.collection(buffer);
  if (collection) {
    const candidates = collection
      .names()
      .filter(
        (candidate) =>
          hasFamilyName(collection.get(candidate.index).name, face.family) ||
          (face.postScriptName !== undefined &&
            candidate.postScriptName === face.postScriptName),
      );
    const matches = (candidate: (typeof candidates)[number]) =>
      matchesRequestedStyle(collection.get(candidate.index), face.style);
    const selected =
      candidates.find(
        (candidate) =>
          candidate.postScriptName === face.postScriptName &&
          matches(candidate),
      ) ?? candidates.find(matches);
    if (!selected) {
      if (
        face.style &&
        candidates.some((candidate) => collection.get(candidate.index).fvar)
      )
        throw new UnavailableFontStyle(
          "Non-default variable font style is unavailable",
        );
      throw new Error(
        `the selected font collection has no exact ${face.style ?? "regular"} family face`,
      );
    }
    forceResttyFontTables(collection.get(selected.index));
    return {
      sourceFamily: selected.family ?? face.family,
      faceIndex: selected.index,
    };
  }
  const font = await Font.loadAsync(buffer);
  const parsedFamily = font.name ? getFontFamily(font.name) : null;
  const parsedSubfamily = font.name ? getFontSubfamily(font.name) : null;
  const identityMatches =
    font.name &&
    (hasFamilyName(font.name, face.family) ||
      hasPostScriptName(font.name, face.postScriptName));
  // A native named variable instance is not a separate outline face. The pinned
  // loader uses default axes; synthesize the missing style rather than rejecting
  // a valid regular family or mislabelling its default outlines as bold/italic.
  if (
    identityMatches &&
    face.style &&
    font.fvar &&
    !matchesRequestedStyle(font, face.style)
  )
    throw new UnavailableFontStyle(
      "Non-default variable font style is unavailable",
    );
  if (
    !identityMatches ||
    !matchesRequestedStyle(font, face.style) ||
    (!face.style &&
      !/^(regular|normal|book|roman)$/iu.test(parsedSubfamily ?? "") &&
      !hasPostScriptName(font.name!, face.postScriptName))
  ) {
    throw new Error(
      `the selected font has no exact ${face.style ?? "regular"} family face`,
    );
  }
  forceResttyFontTables(font);
  return { sourceFamily: parsedFamily ?? face.family, faceIndex: 0 };
}

function forceResttyFontTables(font: Font): void {
  // Force tables used by Restty before committing configuration or source bytes.
  void font.head;
  void font.maxp;
  void font.hhea;
  void font.hmtx;
  void font.cmap;
  if (
    !Number.isFinite(font.unitsPerEm) ||
    font.unitsPerEm <= 0 ||
    !Number.isFinite(font.ascender) ||
    !Number.isFinite(font.descender)
  )
    throw new Error("the selected font has invalid shaping metrics");
}

function hasFamilyName(name: Font["name"], family: string): boolean {
  // Native APIs may expose the legacy or typographic family, including a
  // localized record. Require an exact recorded family, never a fuzzy alias.
  return (
    name?.records.some(
      (record) =>
        (record.nameId === 1 || record.nameId === 16) &&
        record.value === family,
    ) ?? false
  );
}

function hasPostScriptName(
  name: NonNullable<Font["name"]>,
  postScriptName: string | undefined,
): boolean {
  return (
    !!postScriptName &&
    name.records.some(
      (record) => record.nameId === 6 && record.value === postScriptName,
    )
  );
}

function matchesRequestedStyle(
  font: Font,
  style: TerminalFontStyle | undefined,
): boolean {
  const selection = font.os2?.fsSelection ?? 0;
  const bold =
    (selection & 32) !== 0 || (font.os2?.usWeightClass ?? 400) >= 650;
  const italic =
    (selection & (1 | 512)) !== 0 || (font.head.macStyle & 2) !== 0;
  return (
    bold === (style === "bold" || style === "boldItalic") &&
    italic === (style === "italic" || style === "boldItalic")
  );
}
