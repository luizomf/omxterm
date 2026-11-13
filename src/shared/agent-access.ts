import {
  isTerminalFontZoom,
  isTerminalSessionId,
  isTerminalTabCommand,
  type TerminalFontZoom,
  type TerminalSessionId,
  type TerminalTabCommand,
} from "./terminal-contract";
import {
  hasOnlyKeys,
  isAgentKeyChord,
  isPlainRecord,
  MAX_AGENT_KEYS,
  MAX_AGENT_READ_CHARS,
  MAX_AGENT_READ_LINES,
  type AgentKeyChord,
} from "./agent-api";

// Main ⇄ renderer contract for a window's agent grant (ADR 0052). The
// renderer confirms the marks, stops the grant, answers reads and tab lists, and encodes
// presses for a pane's modes (main writes the bytes), and runs the tab and pane
// shortcuts an agent presses on the pane it names. A grant
// starts only from the toggle action (menu, shortcut or Command Palette).
export const agentIpc = {
  state: "agent:state",
  shown: "agent:shown",
  stop: "agent:stop",
  read: "agent:read",
  readResult: "agent:read-result",
  press: "agent:press",
  pressResult: "agent:press-result",
  tabs: "agent:tabs",
  tabsResult: "agent:tabs-result",
  action: "agent:action",
  actionResult: "agent:action-result",
  actionCancel: "agent:action-cancel",
} as const;

/** Bounds for the window's tab tree, whatever the renderer sends. */
export const MAX_AGENT_TABS = 256;
export const MAX_AGENT_TAB_PANES = 256;
export const MAX_AGENT_TAB_TITLE = 200;

/** The encoded bytes of one press request; each key is a few bytes. */
export const MAX_AGENT_PRESS_CHARS = MAX_AGENT_KEYS * 64;

export const AGENT_REFUSALS = [
  "in-use",
  "path-too-long",
  "unavailable",
  "unsupported",
] as const;
export type AgentRefusal = (typeof AGENT_REFUSALS)[number];

/**
 * pending: show the marks and confirm them; granted: agents can connect;
 * off: no grant, optionally because the last attempt was refused.
 */
export type AgentAccessState =
  | { readonly state: "pending" | "granted" }
  | { readonly state: "off"; readonly refused?: AgentRefusal };

export function isAgentAccessState(value: unknown): value is AgentAccessState {
  if (!isPlainRecord(value)) return false;
  if (value.state === "pending" || value.state === "granted")
    return hasOnlyKeys(value, ["state"]);
  return (
    value.state === "off" &&
    hasOnlyKeys(value, ["state"], ["refused"]) &&
    (value.refused === undefined ||
      AGENT_REFUSALS.includes(value.refused as AgentRefusal))
  );
}

export interface AgentReadRequest {
  readonly id: string;
  readonly sessionId: TerminalSessionId;
  readonly lines: number;
}

export type AgentReadResult =
  | {
      readonly id: string;
      readonly text: string;
      readonly truncated: boolean;
      readonly cols?: number;
      readonly rows?: number;
    }
  | { readonly id: string; readonly error: "unknown-pane" | "failed" };

const isReadId = (value: unknown): value is string =>
  typeof value === "string" && /^[0-9a-f-]{36}$/u.test(value);

export function isAgentReadRequest(value: unknown): value is AgentReadRequest {
  return (
    isPlainRecord(value) &&
    hasOnlyKeys(value, ["id", "sessionId", "lines"]) &&
    isReadId(value.id) &&
    isTerminalSessionId(value.sessionId) &&
    Number.isSafeInteger(value.lines) &&
    (value.lines as number) >= 1 &&
    (value.lines as number) <= MAX_AGENT_READ_LINES
  );
}

const isGridSize = (value: unknown) =>
  value === undefined || (Number.isSafeInteger(value) && (value as number) > 0);

export function isAgentReadResult(value: unknown): value is AgentReadResult {
  if (!isPlainRecord(value) || !isReadId(value.id)) return false;
  if ("error" in value)
    return (
      hasOnlyKeys(value, ["id", "error"]) &&
      (value.error === "unknown-pane" || value.error === "failed")
    );
  return (
    hasOnlyKeys(value, ["id", "text", "truncated"], ["cols", "rows"]) &&
    typeof value.text === "string" &&
    value.text.length <= MAX_AGENT_READ_CHARS &&
    typeof value.truncated === "boolean" &&
    isGridSize(value.cols) &&
    isGridSize(value.rows)
  );
}

export interface AgentPressRequest {
  readonly id: string;
  readonly sessionId: TerminalSessionId;
  readonly keys: readonly AgentKeyChord[];
}

/** The bytes the pane's Surface encoded, or why it couldn't. */
export type AgentPressResult =
  | { readonly id: string; readonly data: string }
  | { readonly id: string; readonly error: "unknown-pane" | "unavailable" };

export function isAgentPressRequest(
  value: unknown,
): value is AgentPressRequest {
  return (
    isPlainRecord(value) &&
    hasOnlyKeys(value, ["id", "sessionId", "keys"]) &&
    isReadId(value.id) &&
    isTerminalSessionId(value.sessionId) &&
    Array.isArray(value.keys) &&
    value.keys.length >= 1 &&
    value.keys.length <= MAX_AGENT_KEYS &&
    value.keys.every(isAgentKeyChord)
  );
}

export function isAgentPressResult(value: unknown): value is AgentPressResult {
  if (!isPlainRecord(value) || !isReadId(value.id)) return false;
  if ("error" in value)
    return (
      hasOnlyKeys(value, ["id", "error"]) &&
      (value.error === "unknown-pane" || value.error === "unavailable")
    );
  return (
    hasOnlyKeys(value, ["id", "data"]) &&
    typeof value.data === "string" &&
    value.data.length <= MAX_AGENT_PRESS_CHARS
  );
}

export interface AgentTabsRequest {
  readonly id: string;
}

/** One tab as the window shows it; its panes are session ids. */
export interface AgentWindowTab {
  readonly tab: string;
  readonly title: string;
  readonly selected: boolean;
  readonly panes: readonly TerminalSessionId[];
}

export type AgentTabsResult =
  | { readonly id: string; readonly tabs: readonly AgentWindowTab[] }
  | { readonly id: string; readonly error: "failed" };

export function isAgentTabsRequest(value: unknown): value is AgentTabsRequest {
  return (
    isPlainRecord(value) && hasOnlyKeys(value, ["id"]) && isReadId(value.id)
  );
}

function isAgentWindowTab(value: unknown): value is AgentWindowTab {
  return (
    isPlainRecord(value) &&
    hasOnlyKeys(value, ["tab", "title", "selected", "panes"]) &&
    typeof value.tab === "string" &&
    /^t[1-9][0-9]{0,8}$/u.test(value.tab) &&
    typeof value.title === "string" &&
    value.title.length <= MAX_AGENT_TAB_TITLE &&
    typeof value.selected === "boolean" &&
    Array.isArray(value.panes) &&
    value.panes.length <= MAX_AGENT_TAB_PANES &&
    value.panes.every(isTerminalSessionId)
  );
}

export function isAgentTabsResult(value: unknown): value is AgentTabsResult {
  if (!isPlainRecord(value) || !isReadId(value.id)) return false;
  if ("error" in value)
    return hasOnlyKeys(value, ["id", "error"]) && value.error === "failed";
  return (
    hasOnlyKeys(value, ["id", "tabs"]) &&
    Array.isArray(value.tabs) &&
    value.tabs.length <= MAX_AGENT_TABS &&
    value.tabs.every(isAgentWindowTab)
  );
}

/**
 * The tab, pane and window commands an agent's shortcut runs in the window
 * (#1050, #1052). Close Pane never carries a popup target: the pane it closes
 * is the one the request names. Copy and Select All act on that pane too.
 */
export type AgentWindowCommand =
  | { readonly action: "zoom"; readonly zoom: TerminalFontZoom }
  | {
      readonly action:
        "copy" | "select-all" | "toggle-tab-bar" | "toggle-title-bar";
    }
  | Extract<
      TerminalTabCommand,
      {
        action:
          | "new"
          | "close"
          | "next"
          | "previous"
          | "select"
          | "split"
          | "focus-pane"
          | "swap-pane"
          | "equalize-panes";
      }
    >
  | { readonly action: "close-pane" };

const AGENT_WINDOW_ACTIONS = new Set<string>([
  "new",
  "close",
  "next",
  "previous",
  "select",
  "split",
  "focus-pane",
  "swap-pane",
  "equalize-panes",
  "close-pane",
]);

const AGENT_WINDOW_OWN_ACTIONS = new Set<string>([
  "copy",
  "select-all",
  "toggle-tab-bar",
  "toggle-title-bar",
]);

export function isAgentWindowCommand(
  value: unknown,
): value is AgentWindowCommand {
  if (isPlainRecord(value) && value.action === "zoom")
    return (
      hasOnlyKeys(value, ["action", "zoom"]) && isTerminalFontZoom(value.zoom)
    );
  if (
    isPlainRecord(value) &&
    typeof value.action === "string" &&
    AGENT_WINDOW_OWN_ACTIONS.has(value.action)
  )
    return hasOnlyKeys(value, ["action"]);
  return (
    isTerminalTabCommand(value) &&
    AGENT_WINDOW_ACTIONS.has(value.action) &&
    !(value.action === "close-pane" && "target" in value)
  );
}

/** Focus this pane (selecting its tab), then run the command. */
export interface AgentActionRequest {
  readonly id: string;
  readonly sessionId: TerminalSessionId;
  readonly command: AgentWindowCommand;
}

export type AgentActionResult =
  | { readonly id: string }
  | { readonly id: string; readonly error: "unknown-pane" | "unavailable" };

export function isAgentActionCancel(value: unknown): value is { id: string } {
  return (
    isPlainRecord(value) && hasOnlyKeys(value, ["id"]) && isReadId(value.id)
  );
}

export function isAgentActionRequest(
  value: unknown,
): value is AgentActionRequest {
  return (
    isPlainRecord(value) &&
    hasOnlyKeys(value, ["id", "sessionId", "command"]) &&
    isReadId(value.id) &&
    isTerminalSessionId(value.sessionId) &&
    isAgentWindowCommand(value.command)
  );
}

export function isAgentActionResult(
  value: unknown,
): value is AgentActionResult {
  if (!isPlainRecord(value) || !isReadId(value.id)) return false;
  return "error" in value
    ? hasOnlyKeys(value, ["id", "error"]) &&
        (value.error === "unknown-pane" || value.error === "unavailable")
    : hasOnlyKeys(value, ["id"]);
}

/**
 * The last `lines` rows of exported text, without trailing spaces or the
 * blank rows below the cursor, cut at its start to the read limit.
 */
export function agentTail(
  text: string,
  lines: number,
): { text: string; truncated: boolean } {
  const rows = text.split(/\r?\n/u).map((row) => row.replace(/[ \t]+$/u, ""));
  while (rows.length > 0 && rows.at(-1) === "") rows.pop();
  let tail = rows.slice(-lines).join("\n");
  let truncated = false;
  if (tail.length > MAX_AGENT_READ_CHARS) {
    tail = tail.slice(tail.length - MAX_AGENT_READ_CHARS);
    // Never start on half of a surrogate pair.
    if (/^[\uDC00-\uDFFF]/u.test(tail)) tail = tail.slice(1);
    truncated = true;
  }
  return { text: tail, truncated };
}

/** The window's side of the grant, exposed by preload. */
export interface AgentAccessBridge {
  onState(listener: (state: AgentAccessState) => void): () => void;
  /** The marks are on screen: main may admit agents. */
  shown(): void;
  /** The user clicked a mark. */
  stop(): void;
  onRead(listener: (request: AgentReadRequest) => void): () => void;
  readResult(result: AgentReadResult): void;
  onPress(listener: (request: AgentPressRequest) => void): () => void;
  pressResult(result: AgentPressResult): void;
  onTabs(listener: (request: AgentTabsRequest) => void): () => void;
  tabsResult(result: AgentTabsResult): void;
  onAction(listener: (request: AgentActionRequest) => void): () => void;
  actionResult(result: AgentActionResult): void;
  /** Main stopped waiting for this action: drop it if it hasn't run. */
  onActionCancel(listener: (id: string) => void): () => void;
}
