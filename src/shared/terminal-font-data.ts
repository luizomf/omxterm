export const MAX_TERMINAL_FONT_BYTES = 268_435_456;
export const MAX_TERMINAL_FONT_FACES = 4;
export const MAX_TERMINAL_FONT_DATA_BYTES = 536_870_912;

export type TerminalFontStyle = "bold" | "italic" | "boldItalic";

export interface TerminalFontFaceData {
  readonly family: string;
  readonly sourceFamily?: string;
  readonly faceIndex?: number;
  readonly data: Uint8Array;
}

export interface TerminalFontData {
  readonly configured?: TerminalFontFaceData;
  readonly configuredStyles?: Partial<
    Record<TerminalFontStyle, TerminalFontFaceData>
  >;
  readonly fallbacks: readonly TerminalFontFaceData[];
}

export function isTerminalFontData(value: unknown): value is TerminalFontData {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  if (
    !keys.every(
      (key) =>
        key === "configured" ||
        key === "configuredStyles" ||
        key === "fallbacks",
    )
  )
    return false;
  if (
    !Array.isArray(value.fallbacks) ||
    value.fallbacks.length > MAX_TERMINAL_FONT_FACES
  )
    return false;
  if (
    !(value.configured === undefined || isFontFace(value.configured)) ||
    !value.fallbacks.every(isFontFace)
  )
    return false;
  const configured = value.configured;
  const styles = value.configuredStyles;
  if (
    styles !== undefined &&
    (!isRecord(styles) ||
      !value.configured ||
      !Object.entries(styles).every(
        ([style, face]) =>
          ["bold", "italic", "boldItalic"].includes(style) &&
          isFontFace(face) &&
          face.family === configured?.family,
      ))
  )
    return false;
  const faces = [
    ...(value.configured === undefined ? [] : [value.configured]),
    ...Object.values((styles ?? {}) as Record<string, TerminalFontFaceData>),
    ...value.fallbacks,
  ];
  return (
    [...new Set(faces.map((face) => face.data))].reduce(
      (total, data) => total + data.byteLength,
      0,
    ) <= MAX_TERMINAL_FONT_DATA_BYTES
  );
}

export function isTerminalFontFamily(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 256 &&
    !/[\u0000-\u001f\u007f]/u.test(value)
  );
}

function isFontFace(value: unknown): value is TerminalFontFaceData {
  return (
    isRecord(value) &&
    Object.keys(value).every((key) =>
      ["family", "sourceFamily", "faceIndex", "data"].includes(key),
    ) &&
    (value.faceIndex === undefined ||
      (typeof value.faceIndex === "number" &&
        Number.isInteger(value.faceIndex) &&
        value.faceIndex >= 0 &&
        value.faceIndex <= 65535)) &&
    isTerminalFontFamily(value.family) &&
    (value.sourceFamily === undefined ||
      isTerminalFontFamily(value.sourceFamily)) &&
    value.data instanceof Uint8Array &&
    value.data.byteLength > 0 &&
    value.data.byteLength <= MAX_TERMINAL_FONT_BYTES
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
