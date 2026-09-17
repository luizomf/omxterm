export const MAX_TERMINAL_FONT_BYTES = 268_435_456;
export const MAX_TERMINAL_FONT_FACES = 4;
export const MAX_TERMINAL_FONT_DATA_BYTES = 536_870_912;

export interface TerminalFontFaceData {
  readonly family: string;
  readonly sourceFamily?: string;
  readonly data: Uint8Array;
}

export interface TerminalFontData {
  readonly configured?: TerminalFontFaceData;
  readonly fallbacks: readonly TerminalFontFaceData[];
}

export function isTerminalFontData(value: unknown): value is TerminalFontData {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  if (!keys.every((key) => key === "configured" || key === "fallbacks"))
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
  const faces = [
    ...(value.configured === undefined ? [] : [value.configured]),
    ...value.fallbacks,
  ];
  return (
    faces.reduce((total, face) => total + face.data.byteLength, 0) <=
    MAX_TERMINAL_FONT_DATA_BYTES
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
      ["family", "sourceFamily", "data"].includes(key),
    ) &&
    (Object.keys(value).length === 2 || Object.keys(value).length === 3) &&
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
