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
  readonly startupFailed?: true;
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
  readonly end: number;
}

export interface TerminalSessionOutputAck {
  readonly sessionId: TerminalSessionId;
  readonly end: number;
}

export interface TerminalSessionExit extends TerminalExit {
  readonly sessionId: TerminalSessionId;
}

// A session-scoped Terminal Title: renderer-to-main it carries the raw OSC
// 0/2 request for main-side sanitization (ADR 0010); main-to-renderer it
// carries the sanitized display value for the owning tab's label.
export interface TerminalSessionTitle {
  readonly sessionId: TerminalSessionId;
  readonly title: string;
}

// Tab selection keybinds are literal positions 1 through 9 (ADR 0016).
export const MAX_TAB_SELECT_POSITION = 9;

// Main-to-renderer instructions for the Terminal Tabs owned by one window.
// "close" immediately closes the selected tab when no confirmation is needed.
// Main serializes each window's confirmation: "prepare-close" retains the
// renderer-owned tab (even before it has a session id), and "resolve-close"
// consumes that target, never the later selection. "close-session" removes
// a failed session's tab after its native failure dialog was acknowledged.
export type TerminalTabCommand =
  | { readonly action: "new" }
  | { readonly action: "close" }
  | { readonly action: "prepare-close" }
  | { readonly action: "resolve-close"; readonly confirmed: boolean }
  | { readonly action: "next" }
  | { readonly action: "previous" }
  | { readonly action: "select"; readonly position: number }
  | { readonly action: "close-session"; readonly sessionId: TerminalSessionId };

export type TerminalFontZoom = "in" | "out" | "reset";
export type TerminalClipboardAction = "copy" | "paste" | "select-all";

// Explicit, user-requested export. "selection" saves the selected text;
// "content" saves the active tab's retained scrollback and screen. The kind is
// chosen when the context menu opens, so its label and the saved text agree.
export type TerminalExportKind = "selection" | "content";
export interface TerminalContextMenuRequest {
  readonly hasSelection: boolean;
}
export interface TerminalExportRequest {
  readonly kind: TerminalExportKind;
  readonly text: string;
}
// Above what the 10,000,000-byte core can retain for one screen; it bounds the
// IPC boundary rather than limiting ordinary exports. Measured in UTF-8 bytes.
export const MAX_TERMINAL_EXPORT_BYTES = 16 * 1024 * 1024;

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

export function isTerminalSessionClose(
  value: unknown,
): value is TerminalSessionReference & {
  readonly reason?: "rendering-failure";
} {
  if (isTerminalSessionReference(value)) return true;
  return (
    isStrictRecord(value, ["sessionId", "reason"]) &&
    isTerminalSessionId(value.sessionId) &&
    value.reason === "rendering-failure"
  );
}

export function isTerminalSessionOutput(
  value: unknown,
): value is TerminalSessionOutput {
  if (!isStrictRecord(value, ["sessionId", "data", "end"])) return false;
  return (
    isTerminalSessionId(value.sessionId) &&
    isBoundedTerminalPayload(value.data) &&
    isOutputProgress(value.end)
  );
}

export function isTerminalSessionOutputAck(
  value: unknown,
): value is TerminalSessionOutputAck {
  if (!isStrictRecord(value, ["sessionId", "end"])) return false;
  return isTerminalSessionId(value.sessionId) && isOutputProgress(value.end);
}

function isOutputProgress(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

export function isTerminalSessionExit(
  value: unknown,
): value is TerminalSessionExit {
  if (
    !isStrictRecord(value, ["sessionId", "exitCode", "signal"]) &&
    !(
      isStrictRecord(value, [
        "sessionId",
        "exitCode",
        "signal",
        "startupFailed",
      ]) && value.startupFailed === true
    )
  )
    return false;
  return (
    isTerminalSessionId(value.sessionId) &&
    Number.isInteger(value.exitCode) &&
    Number.isInteger(value.signal)
  );
}

export function isTerminalSessionTitle(
  value: unknown,
): value is TerminalSessionTitle {
  if (!isStrictRecord(value, ["sessionId", "title"])) return false;
  return (
    isTerminalSessionId(value.sessionId) && typeof value.title === "string"
  );
}

export function isTerminalTabCommand(
  value: unknown,
): value is TerminalTabCommand {
  if (isStrictRecord(value, ["action"]))
    return (
      value.action === "new" ||
      value.action === "close" ||
      value.action === "prepare-close" ||
      value.action === "next" ||
      value.action === "previous"
    );
  if (isStrictRecord(value, ["action", "confirmed"]))
    return (
      value.action === "resolve-close" && typeof value.confirmed === "boolean"
    );
  if (isStrictRecord(value, ["action", "position"]))
    return (
      value.action === "select" &&
      Number.isInteger(value.position) &&
      (value.position as number) >= 1 &&
      (value.position as number) <= MAX_TAB_SELECT_POSITION
    );
  if (isStrictRecord(value, ["action", "sessionId"]))
    return (
      value.action === "close-session" && isTerminalSessionId(value.sessionId)
    );
  return false;
}

export function splitTerminalPayload(
  value: string,
  maxBytes = MAX_TERMINAL_PAYLOAD_BYTES,
): string[] {
  if (!Number.isInteger(maxBytes) || maxBytes < 4)
    throw new TypeError("Terminal Payload chunk size must be at least 4 bytes");
  if (value.length === 0) return [];
  if (value.length * 3 <= maxBytes) return [value];

  const chunks: string[] = [];
  let chunk = "";
  let chunkBytes = 0;

  for (const character of value) {
    const characterBytes = encoder.encode(character).byteLength;
    if (chunkBytes + characterBytes > maxBytes) {
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
  if (
    !isStrictRecord(value, ["exitCode", "signal"]) &&
    !(
      isStrictRecord(value, ["exitCode", "signal", "startupFailed"]) &&
      value.startupFailed === true
    )
  )
    return false;
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

export function isTerminalExportKind(
  value: unknown,
): value is TerminalExportKind {
  return value === "selection" || value === "content";
}

export function isTerminalContextMenuRequest(
  value: unknown,
): value is TerminalContextMenuRequest {
  return (
    isStrictRecord(value, ["hasSelection"]) &&
    typeof value.hasSelection === "boolean"
  );
}

export function isTerminalExportRequest(
  value: unknown,
): value is TerminalExportRequest {
  return (
    isStrictRecord(value, ["kind", "text"]) &&
    isTerminalExportKind(value.kind) &&
    typeof value.text === "string" &&
    utf8ByteLength(value.text) <= MAX_TERMINAL_EXPORT_BYTES
  );
}

// UTF-8 length without encoding a copy; a lone surrogate counts as U+FFFD.
export function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const unit = value.charCodeAt(index);
    if (unit < 0x80) bytes += 1;
    else if (unit < 0x800) bytes += 2;
    else if (
      unit >= 0xd800 &&
      unit <= 0xdbff &&
      (value.charCodeAt(index + 1) & 0xfc00) === 0xdc00
    ) {
      bytes += 4;
      index += 1;
    } else bytes += 3;
  }
  return bytes;
}
