import {
  isTerminalSessionId,
  type TerminalSessionId,
} from "./terminal-contract";

// A Terminal Tab holds one or more Terminal Panes, each with its own Terminal
// Surface and Live Terminal Session (ADR 0016).
export const MAX_PANES_PER_TAB = 16;

// The approved reference minimum for admitting a split and limiting a divider,
// measured with the current cell geometry (#650).
export const MIN_PANE_COLUMNS = 20;
export const MIN_PANE_ROWS = 5;

export type TerminalSplitDirection = "right" | "down";
export type TerminalPaneFocusTarget =
  "next" | "previous" | "left" | "right" | "up" | "down";

// Main-to-renderer pane instructions for the selected tab. "close-pane" closes
// the focused pane when no confirmation is needed; "prepare-close-pane" retains
// the focused pane before an asynchronous confirmation and
// "resolve-close-pane" consumes that pane, never a later focus.
export type TerminalPaneCommand =
  | { readonly action: "split"; readonly direction: TerminalSplitDirection }
  | { readonly action: "focus-pane"; readonly target: TerminalPaneFocusTarget }
  | { readonly action: "equalize-panes" }
  | { readonly action: "close-pane" }
  | { readonly action: "prepare-close-pane" }
  | { readonly action: "resolve-close-pane"; readonly confirmed: boolean };

// The renderer reports the focused pane's session and every live session of
// the selected tab, so Close Tab can count Busy Sessions across its panes.
export interface TerminalTabSelection {
  // null means the focused pane is pending or retained after native exit.
  readonly sessionId: TerminalSessionId | null;
  readonly tabSessionIds?: readonly TerminalSessionId[];
}

// Starting a pane's session may name the session whose last local OSC 7
// directory it inherits. Main resolves that intent; the renderer never sends a
// path (ADR 0006).
export interface TerminalSessionStart {
  readonly surfaceId?: string;
  readonly workingDirectoryOf?: TerminalSessionId;
}

export const MAX_WORKING_DIRECTORY_REPORT_LENGTH = 4_096;

const FOCUS_TARGETS = new Set<string>([
  "next",
  "previous",
  "left",
  "right",
  "up",
  "down",
]);

export function isTerminalPaneCommand(
  value: unknown,
): value is TerminalPaneCommand {
  if (hasExactKeys(value, ["action"]))
    return (
      value.action === "equalize-panes" ||
      value.action === "close-pane" ||
      value.action === "prepare-close-pane"
    );
  if (hasExactKeys(value, ["action", "direction"]))
    return (
      value.action === "split" &&
      (value.direction === "right" || value.direction === "down")
    );
  if (hasExactKeys(value, ["action", "target"]))
    return (
      value.action === "focus-pane" &&
      typeof value.target === "string" &&
      FOCUS_TARGETS.has(value.target)
    );
  if (hasExactKeys(value, ["action", "confirmed"]))
    return (
      value.action === "resolve-close-pane" &&
      typeof value.confirmed === "boolean"
    );
  return false;
}

export function isTerminalTabSelection(
  value: unknown,
): value is TerminalTabSelection {
  if (hasExactKeys(value, ["sessionId"]))
    return isTerminalSessionId(value.sessionId);
  return (
    hasExactKeys(value, ["sessionId", "tabSessionIds"]) &&
    (value.sessionId === null || isTerminalSessionId(value.sessionId)) &&
    Array.isArray(value.tabSessionIds) &&
    value.tabSessionIds.length <= MAX_PANES_PER_TAB &&
    value.tabSessionIds.every(isTerminalSessionId) &&
    (value.sessionId === null || value.tabSessionIds.includes(value.sessionId))
  );
}

export function isTerminalSessionStart(
  value: unknown,
  isSurfaceIdentity: (value: unknown) => boolean,
): value is TerminalSessionStart {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const keys = Object.keys(value);
  const record = value as Record<string, unknown>;
  return (
    keys.length > 0 &&
    keys.every((key) => key === "surfaceId" || key === "workingDirectoryOf") &&
    (record.surfaceId === undefined || isSurfaceIdentity(record.surfaceId)) &&
    (record.workingDirectoryOf === undefined ||
      isTerminalSessionId(record.workingDirectoryOf))
  );
}

// OSC 7 "file://host/path" as a shell reports it: bounded and control-free.
export function isWorkingDirectoryUri(uri: string): boolean {
  return (
    uri.length <= MAX_WORKING_DIRECTORY_REPORT_LENGTH &&
    /^file:\/\/[^/]*\//u.test(uri) &&
    !/\p{Cc}/u.test(uri)
  );
}

// A reported directory names this machine only when its host is empty,
// "localhost" or the local host name. A remote shell emitting that same host
// identity is indistinguishable; the result can only name a local directory.
// Windows paths keep their drive letter; UNC and device paths are rejected.
export function localWorkingDirectory(
  uri: string,
  localHostName: string,
  platform: string,
): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== "file:" || parsed.search || parsed.hash)
    return undefined;
  const host = parsed.hostname.toLowerCase();
  if (
    host !== "" &&
    host !== "localhost" &&
    host !== localHostName.toLowerCase()
  )
    return undefined;
  let path: string;
  try {
    path = decodeURIComponent(parsed.pathname);
  } catch {
    return undefined;
  }
  if (path.includes("\0")) return undefined;
  if (platform === "win32") {
    const drive = /^\/([A-Za-z]:)(\/.*)?$/u.exec(path);
    if (!drive) return undefined;
    return `${drive[1]}${(drive[2] ?? "/").replaceAll("/", "\\")}`;
  }
  return path.startsWith("/") ? path : undefined;
}

function hasExactKeys<Key extends string>(
  value: unknown,
  keys: readonly Key[],
): value is Record<Key, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const actual = Object.keys(value);
  return (
    actual.length === keys.length && keys.every((key) => actual.includes(key))
  );
}
