import {
  isTerminalSessionId,
  type TerminalSessionId,
} from "./terminal-contract";
import {
  hasOnlyKeys,
  isPlainRecord,
  MAX_AGENT_READ_CHARS,
  MAX_AGENT_READ_LINES,
} from "./agent-api";

// Main ⇄ renderer contract for a window's agent grant (ADR 0052). The
// renderer confirms the marks, stops the grant and answers reads. A grant
// starts only from the toggle action (menu, shortcut or Command Palette).
export const agentIpc = {
  state: "agent:state",
  shown: "agent:shown",
  stop: "agent:stop",
  read: "agent:read",
  readResult: "agent:read-result",
} as const;

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
}
