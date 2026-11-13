import {
  agentKeyBytes,
  parseAgentChord,
  DEFAULT_AGENT_IDLE_MS,
  DEFAULT_AGENT_READ_LINES,
  hasOnlyKeys,
  isAgentPaneId,
  isPlainRecord,
  MAX_AGENT_IDLE_MS,
  MAX_AGENT_KEYS,
  MAX_AGENT_READ_LINES,
  MAX_AGENT_SEND_BYTES,
  MAX_AGENT_WAIT_MS,
  MIN_AGENT_IDLE_MS,
  utf8Length,
  type AgentCommand,
  type AgentErrorCode,
  type AgentKeyChord,
} from "../shared/agent-api";
import type { TerminalSessionId } from "../shared/terminal-contract";
import type { AgentSessionPort } from "./terminal-ipc-types";

export class AgentApiError extends Error {
  constructor(
    readonly code: AgentErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "AgentApiError";
  }
}

export interface AgentPaneText {
  readonly text: string;
  readonly truncated: boolean;
  readonly cols?: number;
  readonly rows?: number;
}

export interface AgentCommandsOptions {
  readonly sessions: AgentSessionPort;
  /** The renderer's text for one pane; rejects with an AgentApiError. */
  readonly read: (
    sessionId: TerminalSessionId,
    lines: number,
    signal: AbortSignal,
  ) => Promise<AgentPaneText>;
  /**
   * The bytes the pane's Surface encodes for these keys in its current modes;
   * rejects with an AgentApiError.
   */
  readonly encode: (
    sessionId: TerminalSessionId,
    keys: readonly AgentKeyChord[],
    signal: AbortSignal,
  ) => Promise<string>;
  readonly now?: () => number;
  /** How long a read or press waits for the window to consume sent output. */
  readonly catchUpMs?: number;
}

export interface AgentCaller {
  readonly pane?: string;
  readonly signal: AbortSignal;
}

const MAX_REMEMBERED_EXITS = 256;

const invalid = (message: string) =>
  new AgentApiError("invalid-request", message);

function integer(
  value: unknown,
  name: string,
  min: number,
  max: number,
  fallback?: number,
): number {
  if (value === undefined && fallback !== undefined) return fallback;
  if (!Number.isSafeInteger(value) || (value as number) < min)
    throw invalid(`${name} must be an integer from ${min} to ${max}.`);
  if ((value as number) > max)
    throw invalid(`${name} must be an integer from ${min} to ${max}.`);
  return value as number;
}

function argumentsOf(
  args: unknown,
  required: readonly string[],
  optional: readonly string[] = [],
): Record<string, unknown> {
  const value = args === undefined ? {} : args;
  if (!isPlainRecord(value) || !hasOnlyKeys(value, required, optional))
    throw invalid("Unexpected or missing arguments.");
  return value;
}

const unsupportedPress = () =>
  new AgentApiError(
    "unsupported-key",
    "press takes Up, Down, Left, Right, Home, End, PageUp, PageDown, Insert, Delete, F1 to F12, Enter, Tab, Escape, Backspace or Space, with any of Ctrl+, Alt+ and Shift+.",
  );

// 1 to MAX_AGENT_KEYS key names, for send and press.
function keyNames(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length === 0 ||
    value.length > MAX_AGENT_KEYS ||
    !value.every((key) => typeof key === "string")
  )
    throw invalid(`keys must list 1 to ${MAX_AGENT_KEYS} key names.`);
  return value as string[];
}

function pressChords(value: unknown): AgentKeyChord[] {
  return keyNames(value).map((name) => {
    const chord = parseAgentChord(name);
    if (!chord) throw unsupportedPress();
    return chord;
  });
}

// Settles when check() returns a value, the signal aborts or time runs out.
// Every change in the window runs the watchers again.
function watch<T>(
  watchers: Set<() => void>,
  signal: AbortSignal,
  timeoutMs: number,
  check: () => T | undefined,
  onTimeout: () => T,
  nextCheckIn?: () => number | undefined,
) {
  return new Promise<T>((resolve, reject) => {
    let idleTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = () => {
      watchers.delete(run);
      clearTimeout(timer);
      clearTimeout(idleTimer);
      signal.removeEventListener("abort", abort);
    };
    const run = () => {
      let result: T | undefined;
      try {
        result = check();
      } catch (error) {
        finish();
        reject(error);
        return;
      }
      if (result !== undefined) {
        finish();
        resolve(result);
        return;
      }
      clearTimeout(idleTimer);
      const delay = nextCheckIn?.();
      if (delay !== undefined) idleTimer = setTimeout(run, Math.max(0, delay));
    };
    const abort = () => {
      finish();
      reject(signal.reason);
    };
    const timer = setTimeout(() => {
      finish();
      resolve(onTimeout());
    }, timeoutMs);
    if (signal.aborted) return abort();
    signal.addEventListener("abort", abort, { once: true });
    watchers.add(run);
    run();
  });
}

/**
 * list, send, read, wait and press for one granted window (ADR 0052). Every pane id
 * is checked against this window's live sessions; another window's ids are
 * simply unknown here.
 */
export function createAgentCommands(options: AgentCommandsOptions) {
  const now = options.now ?? Date.now;
  let disposed = false;
  const lastOutput = new Map<TerminalSessionId, number>();
  // The last position seen per session survives its exit, for `exited`.
  const lastSent = new Map<TerminalSessionId, number>();
  const exits = new Map<
    TerminalSessionId,
    { readonly exitCode: number; readonly offset: number }
  >();
  const watchers = new Set<() => void>();
  const changed = () => {
    for (const watcher of [...watchers]) watcher();
  };
  const unobserve = options.sessions.observe({
    output(sessionId) {
      lastOutput.set(sessionId, now());
      const sent = options.sessions.position(sessionId)?.sent;
      if (sent !== undefined) lastSent.set(sessionId, sent);
      changed();
    },
    acknowledged: changed,
    exited(sessionId, exitCode) {
      lastOutput.delete(sessionId);
      exits.set(sessionId, { exitCode, offset: lastSent.get(sessionId) ?? 0 });
      lastSent.delete(sessionId);
      if (exits.size > MAX_REMEMBERED_EXITS)
        exits.delete(exits.keys().next().value!);
      changed();
    },
  });

  const pane = (value: unknown): TerminalSessionId => {
    if (!isAgentPaneId(value)) throw invalid("pane must be an id such as s1.");
    return value;
  };
  const position = (sessionId: TerminalSessionId) => {
    const current = options.sessions.position(sessionId);
    if (current) return current;
    if (exits.has(sessionId))
      throw new AgentApiError("not-live", "The pane's program has ended.");
    throw new AgentApiError("unknown-pane", "No such pane in this window.");
  };

  // Let the window's parser take everything main already sent, so a read
  // right after a send sees its echo and a press its mode. A busy window
  // still answers.
  const caughtUp = (sessionId: TerminalSessionId, signal: AbortSignal) => {
    position(sessionId);
    return watch(
      watchers,
      signal,
      options.catchUpMs ?? 1000,
      () => {
        const current = position(sessionId);
        return current.acknowledged >= current.sent ? true : undefined;
      },
      () => false,
    );
  };

  const commands: Record<
    AgentCommand,
    (args: unknown, caller: AgentCaller) => unknown
  > = {
    list(args, caller) {
      argumentsOf(args, []);
      return {
        panes: options.sessions.sessions().map((session) => ({
          pane: session.sessionId,
          focused: session.focused,
          self: session.sessionId === caller.pane,
          ...(session.cols === undefined
            ? {}
            : { cols: session.cols, rows: session.rows }),
          live: true,
        })),
      };
    },

    send(args) {
      const value = argumentsOf(args, ["pane"], ["text", "keys"]);
      const sessionId = pane(value.pane);
      if (value.text === undefined && value.keys === undefined)
        throw invalid("send needs text, keys or both.");
      if (
        value.text !== undefined &&
        (typeof value.text !== "string" || value.text.length === 0)
      )
        throw invalid("text must be a non-empty string.");
      let data = (value.text as string | undefined) ?? "";
      if (value.keys !== undefined) {
        for (const key of keyNames(value.keys)) {
          const bytes = key.length <= 32 ? agentKeyBytes(key) : undefined;
          if (bytes === undefined)
            throw new AgentApiError(
              "unsupported-key",
              "Only Enter, Tab, Escape, Backspace, Space and Ctrl+A to Ctrl+Z are supported.",
            );
          data += bytes;
        }
      }
      if (utf8Length(data) > MAX_AGENT_SEND_BYTES)
        throw new AgentApiError("too-large", "At most 64 KiB per send.");
      const offset = position(sessionId).sent;
      const receipt = options.sessions.write(sessionId, data);
      if (receipt === "rejected")
        throw new AgentApiError("not-live", "The pane isn't accepting input.");
      return { receipt, offset };
    },

    async read(args, caller) {
      const value = argumentsOf(args, ["pane"], ["lines", "source"]);
      const sessionId = pane(value.pane);
      if (value.source !== undefined && value.source !== "tail")
        throw invalid('Only the "tail" source is available in this version.');
      const lines = integer(
        value.lines,
        "lines",
        1,
        MAX_AGENT_READ_LINES,
        DEFAULT_AGENT_READ_LINES,
      );
      await caughtUp(sessionId, caller.signal);
      const acknowledged = position(sessionId).acknowledged;
      const text = await options.read(sessionId, lines, caller.signal);
      return {
        text: text.text,
        ...(text.cols === undefined
          ? {}
          : { cols: text.cols, rows: text.rows }),
        offset: acknowledged,
        truncated: text.truncated,
      };
    },

    // Named keys, encoded by the window for the pane's current modes as the
    // user's key would be, then written here in one write like send.
    async press(args, caller) {
      const value = argumentsOf(args, ["pane", "keys"]);
      const sessionId = pane(value.pane);
      const keys = pressChords(value.keys);
      await caughtUp(sessionId, caller.signal);
      const data = await options.encode(sessionId, keys, caller.signal);
      // The grant may have ended while the window encoded.
      if (disposed)
        throw new AgentApiError("revoked", "The user stopped agent access.");
      if (data === "") throw unsupportedPress();
      const offset = position(sessionId).sent;
      const receipt = options.sessions.write(sessionId, data);
      if (receipt === "rejected")
        throw new AgentApiError("not-live", "The pane isn't accepting input.");
      return { receipt, offset };
    },

    wait(args, caller) {
      const value = argumentsOf(
        args,
        ["pane", "timeoutMs"],
        ["after", "idleMs", "match"],
      );
      const sessionId = pane(value.pane);
      if (value.match !== undefined)
        throw invalid("match isn't available in this version; use idleMs.");
      const timeoutMs = integer(
        value.timeoutMs,
        "timeoutMs",
        1,
        MAX_AGENT_WAIT_MS,
      );
      const idleMs = integer(
        value.idleMs,
        "idleMs",
        MIN_AGENT_IDLE_MS,
        MAX_AGENT_IDLE_MS,
        DEFAULT_AGENT_IDLE_MS,
      );
      const exited = () => {
        const exit = exits.get(sessionId);
        return exit && { reason: "exited", ...exit };
      };
      if (!options.sessions.position(sessionId) && exits.has(sessionId))
        return exited();
      const start = position(sessionId);
      const after = integer(value.after, "after", 0, start.sent, start.sent);
      let last = start;
      return watch<object>(
        watchers,
        caller.signal,
        timeoutMs,
        () => {
          const current = options.sessions.position(sessionId);
          if (!current) {
            const exit = exited();
            if (exit) return exit;
            throw new AgentApiError("unknown-pane", "The pane was closed.");
          }
          last = current;
          const quiet = now() - (lastOutput.get(sessionId) ?? 0);
          return current.sent > after &&
            quiet >= idleMs &&
            current.acknowledged >= current.sent
            ? { reason: "idle", offset: current.sent }
            : undefined;
        },
        () => ({ reason: "timeout", offset: last.sent }),
        () => {
          const output = lastOutput.get(sessionId);
          return last.sent > after && output !== undefined
            ? output + idleMs - now()
            : undefined;
        },
      );
    },
  };

  return {
    run(command: AgentCommand, args: unknown, caller: AgentCaller) {
      return Promise.resolve().then(() => commands[command](args, caller));
    },
    dispose() {
      disposed = true;
      unobserve();
      watchers.clear();
    },
  };
}

export type AgentCommands = ReturnType<typeof createAgentCommands>;
