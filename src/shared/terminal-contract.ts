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
  | { readonly action: "close-session"; readonly sessionId: TerminalSessionId }
  | { readonly action: "split"; readonly direction: TerminalSplitDirection }
  | { readonly action: "close-pane" }
  | { readonly action: "prepare-close-pane" }
  | { readonly action: "focus-pane"; readonly target: TerminalPaneTarget }
  | { readonly action: "toggle-maximize-pane" }
  | { readonly action: "equalize-panes" }
  | { readonly action: "find" }
  | { readonly action: "toggle-broadcast" };

// "right" places the new pane beside the focused one, "down" below it.
export type TerminalSplitDirection = "right" | "down";
export type TerminalPaneTarget =
  "next" | "previous" | "left" | "right" | "up" | "down";
export const TERMINAL_PANE_TARGETS: readonly TerminalPaneTarget[] = [
  "next",
  "previous",
  "left",
  "right",
  "up",
  "down",
];

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

// Split Terminal Tabs own several sessions. The focused pane's session drives
// the window title; Close Tab considers every session in the selected tab.
export const MAX_PANES_PER_TAB = 16;

export interface TerminalTabSelection {
  readonly sessionId: TerminalSessionId;
  readonly tabSessionIds?: readonly TerminalSessionId[];
}

export function isTerminalTabSelection(
  value: unknown,
): value is TerminalTabSelection {
  if (isTerminalSessionReference(value)) return true;
  if (!isStrictRecord(value, ["sessionId", "tabSessionIds"])) return false;
  const { sessionId, tabSessionIds } = value;
  return (
    isTerminalSessionId(sessionId) &&
    Array.isArray(tabSessionIds) &&
    tabSessionIds.length >= 1 &&
    tabSessionIds.length <= MAX_PANES_PER_TAB &&
    tabSessionIds.every(isTerminalSessionId) &&
    new Set(tabSessionIds).size === tabSessionIds.length &&
    tabSessionIds.includes(sessionId)
  );
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

// Tab commands that carry nothing but their action.
const BARE_TAB_ACTIONS: ReadonlySet<unknown> = new Set([
  "new",
  "close",
  "prepare-close",
  "next",
  "previous",
  "close-pane",
  "prepare-close-pane",
  "toggle-maximize-pane",
  "equalize-panes",
  "find",
  "toggle-broadcast",
]);

export function isTerminalTabCommand(
  value: unknown,
): value is TerminalTabCommand {
  if (isStrictRecord(value, ["action"]))
    return BARE_TAB_ACTIONS.has(value.action);
  if (isStrictRecord(value, ["action", "direction"]))
    return (
      value.action === "split" &&
      (value.direction === "right" || value.direction === "down")
    );
  if (isStrictRecord(value, ["action", "target"]))
    return (
      value.action === "focus-pane" &&
      TERMINAL_PANE_TARGETS.includes(value.target as TerminalPaneTarget)
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

// A split Terminal Pane's context menu also offers Close Pane. Single panes
// and other text fields send no request.
export interface TerminalContextMenuRequest {
  readonly closePane: true;
}

export function isTerminalContextMenuRequest(
  value: unknown,
): value is TerminalContextMenuRequest {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === 1 &&
    (value as { closePane?: unknown }).closePane === true
  );
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
