/* eslint-disable max-lines -- Keep each agent command's argument checks beside its handler in one table. */
import {
  agentChordSendsNothing,
  agentKeyBytes,
  DEFAULT_AGENT_IDLE_MS,
  DEFAULT_AGENT_READ_LINES,
  hasOnlyKeys,
  isAgentPaneId,
  isPlainRecord,
  MAX_AGENT_IDLE_MS,
  MAX_AGENT_KEYS,
  MAX_AGENT_MATCH_CHARS,
  MAX_AGENT_READ_LINES,
  MAX_AGENT_SEND_BYTES,
  MAX_AGENT_WAIT_MS,
  MIN_AGENT_IDLE_MS,
  parseAgentChord,
  utf8Length,
  type AgentCommand,
  type AgentErrorCode,
  type AgentKeyChord,
} from "../shared/agent-api";
import type {
  AgentPaneRead,
  AgentWindowCommand,
  AgentWindowTab,
} from "../shared/agent-access";
import type { TerminalSessionId } from "../shared/terminal-contract";
import type {
  TerminalActionName,
  TerminalKeybinds,
} from "../shared/terminal-keybinds";
import {
  AGENT_SHORTCUTS,
  agentShortcutList,
  type AgentNativeAction,
} from "./agent-shortcuts";
import { createScreenMatches } from "./agent-screen-match";
import type { AgentNeedsUser } from "./terminal-application";
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
  /** A screen read's: whether it is the alternate screen. */
  readonly alternate?: boolean;
}

export interface AgentCommandsOptions {
  readonly sessions: AgentSessionPort;
  /** The renderer's text for one pane; rejects with an AgentApiError. */
  readonly read: (
    sessionId: TerminalSessionId,
    read: AgentPaneRead,
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
  /** The window's tabs and the session ids of their panes, as it shows them. */
  readonly tabs: (signal: AbortSignal) => Promise<readonly AgentWindowTab[]>;
  /** The action a press chord runs, from the window's effective shortcuts. */
  readonly shortcut?: (chord: string) => TerminalActionName | undefined;
  /** The window's effective shortcuts, rebinds included, for `keys`. */
  readonly keybinds?: () => TerminalKeybinds;
  /**
   * Focuses the pane in the window, selecting its tab, then runs the
   * command; rejects with an AgentApiError.
   */
  readonly act?: (
    sessionId: TerminalSessionId,
    command: AgentWindowCommand,
    signal: AbortSignal,
  ) => Promise<void>;
  /** Why closing these sessions is the user's to do, if it is (ADR 0017). */
  readonly closeNeedsUser?: (
    sessionIds: readonly TerminalSessionId[],
  ) => AgentNeedsUser | undefined;
  /**
   * Runs a window action in main on the granted window, unless it's the
   * user's to do; then it runs nothing and says why.
   */
  readonly native?: (action: AgentNativeAction) => AgentNeedsUser | undefined;
  /** Decides which chords the user's own press would send; process.platform. */
  readonly platform?: string;
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

// A literal, non-empty and bounded; counted in characters, not code units.
function matchText(value: unknown): string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 2 * MAX_AGENT_MATCH_CHARS ||
    [...value].length > MAX_AGENT_MATCH_CHARS
  )
    throw invalid(
      `match must be text of 1 to ${MAX_AGENT_MATCH_CHARS} characters.`,
    );
  return value;
}

// wait's arguments but `after`, which is checked against the pane's position.
function waitRequest(args: unknown) {
  const value = argumentsOf(
    args,
    ["pane", "timeoutMs"],
    ["after", "idleMs", "match"],
  );
  if (!isAgentPaneId(value.pane))
    throw invalid("pane must be an id such as s1.");
  const match = value.match === undefined ? undefined : matchText(value.match);
  return {
    sessionId: value.pane,
    after: value.after,
    match,
    timeoutMs: integer(value.timeoutMs, "timeoutMs", 1, MAX_AGENT_WAIT_MS),
    // With only match, idleness is ignored.
    idleMs:
      match !== undefined && value.idleMs === undefined
        ? undefined
        : integer(
            value.idleMs,
            "idleMs",
            MIN_AGENT_IDLE_MS,
            MAX_AGENT_IDLE_MS,
            DEFAULT_AGENT_IDLE_MS,
          ),
  };
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
    "press sends Up, Down, Left, Right, Home, End, PageUp, PageDown, Insert, Delete, F1 to F12, Enter, Tab, Escape, Backspace or Space, with any of Ctrl+, Alt+ and Shift+, to the pane; any other chord must be one of the window's shortcuts.",
  );
const NEEDS_USER: Readonly<Record<AgentNeedsUser, string>> = {
  busy: "This needs the user: a program is still running there.",
  confirming: "This needs the user: they are already confirming a close.",
  closing: "This needs the user: the window is closing.",
  "other-windows": "This needs the user: it would close other windows too.",
  dialog: "This needs the user: a dialog is open in this window.",
  elsewhere:
    "This needs the user: they are in another window, and this would take them from it.",
};
const revoked = () =>
  new AgentApiError("revoked", "The user stopped agent access.");

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

// A chord the user's press turns into nothing is refused like an unknown key.
function pressChords(value: unknown, platform: string): AgentKeyChord[] {
  return keyNames(value).map((name) => {
    const chord = parseAgentChord(name);
    if (!chord || agentChordSendsNothing(chord, platform))
      throw unsupportedPress();
    return chord;
  });
}

// The one shortcut action a press runs, if any. A refused or parked
// shortcut answers before anything happens, whatever else the press holds.
function pressedShortcut(
  names: readonly string[],
  shortcut: AgentCommandsOptions["shortcut"],
): TerminalActionName | undefined {
  const actions = names.map((name) =>
    name.length <= 64 ? shortcut?.(name) : undefined,
  );
  const kinds = actions.map((action) =>
    action === undefined ? undefined : AGENT_SHORTCUTS[action].kind,
  );
  if (kinds.includes("refused"))
    throw new AgentApiError(
      "refused",
      "Only the user can allow or stop agents in this window.",
    );
  const parked = actions[kinds.indexOf("not-yet")];
  const parkedShortcut = parked && AGENT_SHORTCUTS[parked];
  if (parkedShortcut && parkedShortcut.kind === "not-yet")
    throw new AgentApiError("not-yet", `${parked} ${parkedShortcut.why}`);
  const run = actions[kinds.indexOf("run")];
  if (run && names.length > 1) throw invalid("Press a shortcut on its own.");
  return run;
}

// The user's click on a pane, then their press: the window focuses the pane
// (selecting its tab) and runs the action there, or main acts on the granted
// window. A close that would ask to confirm a Busy Session is the user's.
async function runShortcut(
  options: AgentCommandsOptions,
  disposed: () => boolean,
  sessionId: TerminalSessionId,
  action: TerminalActionName,
  signal: AbortSignal,
) {
  const shortcut = AGENT_SHORTCUTS[action];
  if (shortcut.kind !== "run") throw unsupportedPress();
  // Full screen, a new window, closing this one or quitting: main acts on
  // the granted window, whichever one is selected.
  if ("native" in shortcut) {
    if (!options.native) throw unsupportedPress();
    if (disposed()) throw revoked();
    const block = options.native(shortcut.native);
    if (block) throw new AgentApiError("needs-user", NEEDS_USER[block]);
    return { action, pane: sessionId };
  }
  if (!options.act) throw unsupportedPress();
  if (shortcut.closes) {
    // Without a check, assume the close would ask.
    const block =
      options.closeNeedsUser?.(
        await closedBy(shortcut.closes, sessionId, options.tabs, signal),
      ) ?? (options.closeNeedsUser ? undefined : "busy");
    if (block) throw new AgentApiError("needs-user", NEEDS_USER[block]);
  }
  if (disposed()) throw revoked();
  await options.act(sessionId, shortcut.command, signal);
  return { action, pane: sessionId };
}

// The panes a close would take: the named one, or every pane of its tab.
async function closedBy(
  closes: "pane" | "tab",
  sessionId: TerminalSessionId,
  tabs: AgentCommandsOptions["tabs"],
  signal: AbortSignal,
): Promise<readonly TerminalSessionId[]> {
  if (closes === "pane") return [sessionId];
  const tab = (await tabs(signal)).find((entry) =>
    entry.panes.includes(sessionId),
  );
  if (!tab)
    throw new AgentApiError("unknown-pane", "No such pane in this window.");
  return tab.panes;
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
 * list, send, read, wait and press for one granted window (ADR 0052). Every
 * pane id is checked against this window's live sessions; another window's
 * ids are simply unknown here.
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
  const screens = createScreenMatches({
    read: options.read,
    shown: (sessionId) => options.sessions.position(sessionId)?.acknowledged,
    changed: () => changed(),
    now,
  });
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
      screens.forget(sessionId);
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
    // The window knows its tabs; main knows each pane's size and focus.
    async list(args, caller) {
      argumentsOf(args, []);
      const windowTabs = await options.tabs(caller.signal);
      const live = new Map(
        options.sessions.sessions().map((s) => [s.sessionId, s]),
      );
      return {
        tabs: windowTabs.map((tab) => ({
          tab: tab.tab,
          // A title is the program's text: no control characters.
          title: tab.title.replace(/[\p{Cc}\p{Cf}\u2028\u2029]/gu, " "),
          selected: tab.selected,
          panes: tab.panes.map((sessionId) => {
            const session = live.get(sessionId);
            return {
              pane: sessionId,
              focused: session?.focused ?? false,
              self: sessionId === caller.pane,
              ...(session?.cols === undefined
                ? {}
                : { cols: session.cols, rows: session.rows }),
              live: session !== undefined,
            };
          }),
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
      screens.remember(sessionId, offset);
      const receipt = options.sessions.write(sessionId, data);
      if (receipt === "rejected")
        throw new AgentApiError("not-live", "The pane isn't accepting input.");
      return { receipt, offset };
    },

    async read(args, caller) {
      const value = argumentsOf(args, ["pane"], ["lines", "source"]);
      const sessionId = pane(value.pane);
      let read: AgentPaneRead;
      if (value.source === "screen") {
        if (value.lines !== undefined)
          throw invalid("lines is only for the tail source.");
        read = { source: "screen" };
      } else if (value.source === undefined || value.source === "tail") {
        read = {
          source: "tail",
          lines: integer(
            value.lines,
            "lines",
            1,
            MAX_AGENT_READ_LINES,
            DEFAULT_AGENT_READ_LINES,
          ),
        };
      } else throw invalid('source must be "tail" or "screen".');
      await caughtUp(sessionId, caller.signal);
      const acknowledged = position(sessionId).acknowledged;
      const text = await options.read(sessionId, read, caller.signal);
      return {
        text: text.text,
        ...(text.cols === undefined
          ? {}
          : { cols: text.cols, rows: text.rows }),
        offset: acknowledged,
        truncated: text.truncated,
      };
    },

    // A chord that is one of the window's shortcuts runs its action (#1050);
    // named keys are encoded by the window for the pane's current modes, as
    // the user's key would be, then written here in one write like send.
    async press(args, caller) {
      const value = argumentsOf(args, ["pane", "keys"]);
      const sessionId = pane(value.pane);
      const names = keyNames(value.keys);
      const action = pressedShortcut(names, options.shortcut);
      if (action) {
        position(sessionId);
        return runShortcut(
          options,
          () => disposed,
          sessionId,
          action,
          caller.signal,
        );
      }
      const keys = pressChords(names, options.platform ?? process.platform);
      await caughtUp(sessionId, caller.signal);
      const data = await options.encode(sessionId, keys, caller.signal);
      // The grant may have ended while the window encoded.
      if (disposed) throw revoked();
      if (data === "") throw unsupportedPress();
      const offset = position(sessionId).sent;
      screens.remember(sessionId, offset);
      const receipt = options.sessions.write(sessionId, data);
      if (receipt === "rejected")
        throw new AgentApiError("not-live", "The pane isn't accepting input.");
      return { receipt, offset };
    },

    // What press does with each shortcut, from the table and live shortcuts
    // it matches against (#1051).
    keys(args) {
      argumentsOf(args, []);
      return { shortcuts: agentShortcutList(options) };
    },

    wait(args, caller) {
      const { sessionId, match, timeoutMs, idleMs, ...request } =
        waitRequest(args);
      const exited = () => {
        const exit = exits.get(sessionId);
        return exit && { reason: "exited", ...exit };
      };
      if (!options.sessions.position(sessionId) && exits.has(sessionId))
        return exited();
      const start = position(sessionId);
      const after = integer(request.after, "after", 0, start.sent, start.sent);
      const screen =
        match === undefined
          ? undefined
          : screens.watch(sessionId, match, after, start.sent, caller.signal);
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
          const found = screen?.check();
          if (found !== undefined) return { reason: "match", offset: found };
          if (idleMs === undefined) return undefined;
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
          return idleMs !== undefined &&
            last.sent > after &&
            output !== undefined
            ? output + idleMs - now()
            : undefined;
        },
      ).finally(() => screen?.stop());
    },
  };

  return {
    run(command: AgentCommand, args: unknown, caller: AgentCaller) {
      return Promise.resolve().then(() => commands[command](args, caller));
    },
    dispose() {
      disposed = true;
      screens.dispose();
      unobserve();
      watchers.clear();
    },
  };
}

export type AgentCommands = ReturnType<typeof createAgentCommands>;
