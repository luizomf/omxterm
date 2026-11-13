// The local agent API's wire contract (ADR 0052, docs/dev/agent-api.md),
// shared by Electron main and the dependency-free omxterm-ctl client. Nothing
// here imports Node or the DOM, so both bundles keep the same limits.

export const AGENT_PROTOCOL = 1;
export const AGENT_GRANT_VERSION = 1;

/** One request line, newline excluded. */
export const MAX_AGENT_REQUEST_BYTES = 256 * 1024;
/** Each handshake line is small; anything longer is not a client. */
export const MAX_AGENT_HANDSHAKE_BYTES = 1024;
export const AGENT_HANDSHAKE_TIMEOUT_MS = 5000;
export const MAX_AGENT_SEND_BYTES = 64 * 1024;
export const MAX_AGENT_KEYS = 64;
export const DEFAULT_AGENT_READ_LINES = 200;
export const MAX_AGENT_READ_LINES = 10_000;
/** UTF-16 code units of read text; a longer tail is cut at its start. */
export const MAX_AGENT_READ_CHARS = 2 * 1024 * 1024;
export const DEFAULT_AGENT_IDLE_MS = 500;
export const MIN_AGENT_IDLE_MS = 100;
export const MAX_AGENT_IDLE_MS = 60_000;
export const MAX_AGENT_WAIT_MS = 600_000;

export const AGENT_GRANT_ITEM = "Allow Agents in This Window";

export const AGENT_COMMANDS = [
  "list",
  "send",
  "read",
  "wait",
  "press",
] as const;
export type AgentCommand = (typeof AGENT_COMMANDS)[number];

export const AGENT_ERROR_CODES = [
  "invalid-request",
  "revoked",
  "unknown-pane",
  "not-live",
  "unsupported-key",
  "too-large",
  "limit",
  "unavailable",
  "refused",
  "not-yet",
  "needs-user",
] as const;
export type AgentErrorCode = (typeof AGENT_ERROR_CODES)[number];

export type AgentRequestId = number | string;

/** A pane id as the API spells it: the window's session id, such as `s4`. */
export function isAgentPaneId(value: unknown): value is `s${number}` {
  return (
    typeof value === "string" &&
    value.length <= 12 &&
    /^s[1-9][0-9]*$/u.test(value)
  );
}

export function isAgentWindowId(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) > 0;
}

/**
 * One running OMXTerm process. A source run and the installed app can share a
 * profile and both have a window 1; the instance keeps a pane's agent on its
 * own process.
 */
export function isAgentInstance(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{16}$/u.test(value);
}

/** OMXTERM_PANE: `<instance>:<window>:<pane>`, such as `5f0c9a1e2b3d4c6f:3:s4`. */
export function parseAgentPane(
  value: string | undefined,
): { instance: string; window: number; pane: string } | undefined {
  const match = /^([0-9a-f]{16}):(\d{1,15}):(s\d{1,10})$/u.exec(value ?? "");
  if (!match) return undefined;
  const window = Number(match[2]);
  return isAgentWindowId(window) && isAgentPaneId(match[3])
    ? { instance: match[1]!, window, pane: match[3]! }
    : undefined;
}

export function isAgentNonce(value: unknown): value is string {
  return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value);
}

export function isAgentRequestId(value: unknown): value is AgentRequestId {
  return (
    (Number.isSafeInteger(value) && (value as number) >= 0) ||
    (typeof value === "string" && value.length > 0 && value.length <= 64)
  );
}

/**
 * Mode-independent keys for `send`: their bytes are the same whatever the
 * program asked the terminal for. Keys whose bytes depend on cursor and Kitty
 * modes are `press`, which the window encodes.
 */
export function agentKeyBytes(name: string): string | undefined {
  const key = name.toLowerCase();
  const fixed: Record<string, string> = {
    enter: "\r",
    tab: "\t",
    escape: "\x1b",
    backspace: "\x7f",
    space: " ",
  };
  if (Object.hasOwn(fixed, key)) return fixed[key];
  const control = /^ctrl\+([a-z])$/u.exec(key)?.[1];
  return control ? String.fromCharCode(control.charCodeAt(0) - 96) : undefined;
}

/**
 * Keys `press` names, with the DOM key and physical code the Surface's encoder
 * expects, so a press is encoded as the user's own key would be (#1048).
 */
const PRESS_KEYS: Readonly<Record<string, readonly [string, string]>> = {
  Up: ["ArrowUp", "ArrowUp"],
  Down: ["ArrowDown", "ArrowDown"],
  Left: ["ArrowLeft", "ArrowLeft"],
  Right: ["ArrowRight", "ArrowRight"],
  Home: ["Home", "Home"],
  End: ["End", "End"],
  PageUp: ["PageUp", "PageUp"],
  PageDown: ["PageDown", "PageDown"],
  Insert: ["Insert", "Insert"],
  Delete: ["Delete", "Delete"],
  Enter: ["Enter", "Enter"],
  Tab: ["Tab", "Tab"],
  Escape: ["Escape", "Escape"],
  Backspace: ["Backspace", "Backspace"],
  Space: [" ", "Space"],
  ...Object.fromEntries(
    Array.from({ length: 12 }, (_, index) => [
      `F${index + 1}`,
      [`F${index + 1}`, `F${index + 1}`],
    ]),
  ),
};
const PRESS_KEY_NAMES = new Map(
  Object.keys(PRESS_KEYS).map((name) => [name.toLowerCase(), name]),
);

/** One named key with its modifiers, as `press` and the window carry it. */
export interface AgentKeyChord {
  readonly key: string;
  readonly ctrl: boolean;
  readonly alt: boolean;
  readonly shift: boolean;
}

/** `Up`, `ctrl+shift+F5`: modifiers then one named key, in any letter case. */
export function parseAgentChord(name: string): AgentKeyChord | undefined {
  if (name.length > 32) return undefined;
  const parts = name.split("+");
  const key = PRESS_KEY_NAMES.get(parts.pop()!.toLowerCase());
  if (!key) return undefined;
  const modifiers = new Set<string>();
  for (const part of parts) {
    const modifier = part.toLowerCase();
    if (!["ctrl", "alt", "shift"].includes(modifier) || modifiers.has(modifier))
      return undefined;
    modifiers.add(modifier);
  }
  return {
    key,
    ctrl: modifiers.has("ctrl"),
    alt: modifiers.has("alt"),
    shift: modifiers.has("shift"),
  };
}

export function isAgentKeyChord(value: unknown): value is AgentKeyChord {
  return (
    isPlainRecord(value) &&
    hasOnlyKeys(value, ["key", "ctrl", "alt", "shift"]) &&
    typeof value.key === "string" &&
    Object.hasOwn(PRESS_KEYS, value.key) &&
    typeof value.ctrl === "boolean" &&
    typeof value.alt === "boolean" &&
    typeof value.shift === "boolean"
  );
}

/**
 * A chord the user's own press turns into no terminal input: macOS keeps
 * Ctrl+Space (with any other modifier) for switching input sources.
 */
export function agentChordSendsNothing(
  chord: AgentKeyChord,
  platform: string,
): boolean {
  return platform === "darwin" && chord.key === "Space" && chord.ctrl;
}

/** The key description the Surface encodes, shaped like a DOM key event. */
export function agentChordKey(chord: AgentKeyChord) {
  const [key, code] = PRESS_KEYS[chord.key]!;
  return {
    key,
    code,
    ctrlKey: chord.ctrl,
    altKey: chord.alt,
    shiftKey: chord.shift,
  };
}

/** The text an HMAC proof covers; the token itself never crosses. */
export function agentProofMessage(
  side: "server" | "client",
  clientNonce: string,
  serverNonce: string,
): string {
  return `${side}${clientNonce}${serverNonce}`;
}

/** The sentence `status` prints, and every refusal for a missing grant. */
export function agentNotGrantedSentence(): string {
  return `This OMXTerm window doesn't allow agents. Ask the user to choose ${AGENT_GRANT_ITEM} in the Window menu or the Command Palette, then try again.`;
}

export function isPlainRecord(
  value: unknown,
): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

export function hasOnlyKeys(
  value: Record<string, unknown>,
  required: readonly string[],
  optional: readonly string[] = [],
): boolean {
  const keys = Object.keys(value);
  return (
    required.every((key) => Object.hasOwn(value, key)) &&
    keys.every((key) => required.includes(key) || optional.includes(key))
  );
}

export function utf8Length(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code < 0x80) bytes += 1;
    else if (code < 0x800) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      const next = value.charCodeAt(index + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        bytes += 4;
        index += 1;
      } else bytes += 3;
    } else bytes += 3;
  }
  return bytes;
}
