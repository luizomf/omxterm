export const MAX_TERMINAL_PAYLOAD_BYTES = 64 * 1024;
export const MAX_TERMINAL_COLUMNS = 1_000;
export const MAX_TERMINAL_ROWS = 1_000;

export interface TerminalSize {
  readonly cols: number;
  readonly rows: number;
}

export interface TerminalExit {
  readonly exitCode: number;
  readonly signal: number;
}

// The main process allocates ids as `s` plus a positive counter scoped to one
// Terminal Window; the renderer only echoes ids it received from `start`.
export type TerminalSessionId = string;

export interface TerminalSessionInput {
  readonly sessionId: TerminalSessionId;
  readonly data: string;
}

export interface TerminalSessionResize {
  readonly sessionId: TerminalSessionId;
  readonly cols: number;
  readonly rows: number;
}

export interface TerminalSessionReference {
  readonly sessionId: TerminalSessionId;
}

export interface TerminalSessionOutput {
  readonly sessionId: TerminalSessionId;
  readonly data: string;
}

export interface TerminalSessionExit {
  readonly sessionId: TerminalSessionId;
  readonly exitCode: number;
  readonly signal: number;
}

export type TerminalFontZoom = "in" | "out" | "reset";
export type TerminalClipboardAction = "copy" | "paste" | "select-all";

const encoder = new TextEncoder();

export function isBoundedTerminalPayload(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    encoder.encode(value).byteLength <= MAX_TERMINAL_PAYLOAD_BYTES
  );
}

export function isTerminalTitleRequest(value: unknown): value is string {
  return typeof value === "string";
}

export function isTerminalSessionId(
  value: unknown,
): value is TerminalSessionId {
  return typeof value === "string" && /^s[1-9][0-9]{0,8}$/.test(value);
}

export function isTerminalSessionInput(
  value: unknown,
): value is TerminalSessionInput {
  if (!isStrictRecord(value, ["sessionId", "data"])) return false;
  return (
    isTerminalSessionId(value.sessionId) && isBoundedTerminalPayload(value.data)
  );
}

export function isTerminalSessionResize(
  value: unknown,
): value is TerminalSessionResize {
  if (!isStrictRecord(value, ["sessionId", "cols", "rows"])) return false;
  return (
    isTerminalSessionId(value.sessionId) &&
    isTerminalSize({ cols: value.cols, rows: value.rows })
  );
}

export function isTerminalSessionReference(
  value: unknown,
): value is TerminalSessionReference {
  if (!isStrictRecord(value, ["sessionId"])) return false;
  return isTerminalSessionId(value.sessionId);
}

export function isTerminalSessionOutput(
  value: unknown,
): value is TerminalSessionOutput {
  return isTerminalSessionInput(value);
}

export function isTerminalSessionExit(
  value: unknown,
): value is TerminalSessionExit {
  if (!isStrictRecord(value, ["sessionId", "exitCode", "signal"])) return false;
  return (
    isTerminalSessionId(value.sessionId) &&
    isTerminalExit({ exitCode: value.exitCode, signal: value.signal })
  );
}

export function splitTerminalPayload(value: string): string[] {
  if (value.length === 0) return [];

  const chunks: string[] = [];
  let chunk = "";
  let chunkBytes = 0;

  for (const character of value) {
    const characterBytes = encoder.encode(character).byteLength;
    if (chunkBytes + characterBytes > MAX_TERMINAL_PAYLOAD_BYTES) {
      chunks.push(chunk);
      chunk = "";
      chunkBytes = 0;
    }
    chunk += character;
    chunkBytes += characterBytes;
  }

  if (chunk.length > 0) chunks.push(chunk);
  return chunks;
}

export function isTerminalSize(value: unknown): value is TerminalSize {
  if (!isStrictRecord(value, ["cols", "rows"])) return false;
  return (
    Number.isInteger(value.cols) &&
    Number.isInteger(value.rows) &&
    (value.cols as number) >= 1 &&
    (value.cols as number) <= MAX_TERMINAL_COLUMNS &&
    (value.rows as number) >= 1 &&
    (value.rows as number) <= MAX_TERMINAL_ROWS
  );
}

export function isTerminalExit(value: unknown): value is TerminalExit {
  if (!isStrictRecord(value, ["exitCode", "signal"])) return false;
  return Number.isInteger(value.exitCode) && Number.isInteger(value.signal);
}

export function isTerminalFontZoom(value: unknown): value is TerminalFontZoom {
  return value === "in" || value === "out" || value === "reset";
}

export function isTerminalClipboardAction(
  value: unknown,
): value is TerminalClipboardAction {
  return value === "copy" || value === "paste" || value === "select-all";
}

export function isClipboardText(value: unknown): value is string {
  return typeof value === "string";
}

export function isNonemptyClipboardText(value: unknown): value is string {
  return isClipboardText(value) && value.length > 0;
}

export function requiresProtectedPaste(text: string): boolean {
  return /[\r\n\u2028\u2029]|\p{Cc}/u.test(text);
}

function isStrictRecord(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const actualKeys = Object.keys(value);
  return (
    actualKeys.length === keys.length &&
    keys.every((key) => actualKeys.includes(key))
  );
}
