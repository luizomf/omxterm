import { randomBytes } from "node:crypto";
import type { AgentCommand, AgentErrorCode } from "../shared/agent-api";
import {
  agentIpc,
  isAgentActionResult,
  isAgentPressResult,
  isAgentReadResult,
  isAgentTabsResult,
  type AgentAccessState,
  type AgentWindowTab,
  type AgentRefusal,
} from "../shared/agent-access";
import {
  AgentApiError,
  createAgentCommands,
  type AgentCommands,
  type AgentPaneText,
} from "./agent-commands";
import {
  AgentEndpointInUseError,
  createAgentEndpoint,
  maxSocketPathBytes,
} from "./agent-endpoint";
import { createGrantFiles } from "./agent-grant-files";
import type { OperationalEventLog } from "./operational-events";
import type { AgentNativeAction } from "./agent-shortcuts";
import type { AgentCloseBlock } from "./terminal-application";
import type { TerminalSessionId } from "../shared/terminal-contract";
import type {
  TerminalActionName,
  TerminalKeybinds,
} from "../shared/terminal-keybinds";
import type {
  AgentSessionPort,
  IpcEvent,
  IpcMainPort,
  TrustedWebContents,
} from "./terminal-ipc-types";
import { subscribeWindowOwnerLoss } from "./window-owner-loss";
import {
  requestWindow,
  settleAction,
  settlePress,
  settleRead,
  settleTabs,
  type PendingRequests,
} from "./agent-window-requests";

const MARKS_CONFIRM_MS = 5000;

export type AgentGrantEnd =
  | "user"
  | "window-gone"
  | "reloaded"
  | "endpoint-failed"
  | "marks-unconfirmed"
  | "quit";
export type AgentGrantRefusal = AgentRefusal;

interface Emitter {
  on(event: string, listener: (...args: unknown[]) => void): unknown;
  removeListener(
    event: string,
    listener: (...args: unknown[]) => void,
  ): unknown;
}
export interface AgentAccessWindow extends Emitter {
  readonly webContents: TrustedWebContents &
    Emitter & { isCrashed?(): boolean };
  isDestroyed(): boolean;
}

interface Entry {
  readonly window: AgentAccessWindow;
  readonly contents: AgentAccessWindow["webContents"];
  readonly windowId: number;
  readonly sessions: AgentSessionPort;
  readonly closeNeedsUser?: (
    sessionIds: readonly TerminalSessionId[],
  ) => AgentCloseBlock | undefined;
  readonly native?: (action: AgentNativeAction) => AgentCloseBlock | undefined;
  state: "off" | "pending" | "granted";
  token?: Buffer;
  // Only a credential this process wrote is ours to remove: another process
  // on the same profile can have a window with the same id.
  credential?: boolean;
  commands?: AgentCommands;
  confirmTimer?: ReturnType<typeof setTimeout>;
  admitting?: boolean;
  readmit?: boolean;
  // Reads, tab lists, presses and actions the window hasn't answered yet.
  readonly pending: PendingRequests;
  cleanup(): void;
}

export interface AgentAccessOptions {
  readonly ipc: IpcMainPort;
  readonly trusted: (event: IpcEvent) => boolean;
  /** The Electron userData directory: one endpoint per profile. */
  readonly profile: string;
  readonly platform: NodeJS.Platform;
  readonly operationalEvents?: Pick<OperationalEventLog, "write">;
  /** A window's grant changed; the Window menu's check mark follows it. */
  readonly changed?: () => void;
  /** The action a press chord runs, from the effective shortcuts. */
  readonly shortcut?: (chord: string) => TerminalActionName | undefined;
  /** The effective shortcuts, rebinds included, for `keys`. */
  readonly keybinds?: () => TerminalKeybinds;
}

export { agentSocketPath } from "./agent-grant-files";

// A command's envelope, never its arguments or result (ADR 0004).
async function logged(
  log: Pick<OperationalEventLog, "write"> | undefined,
  windowId: number,
  command: AgentCommand,
  run: () => Promise<unknown>,
) {
  const started = Date.now();
  let outcome: "ok" | AgentErrorCode = "ok";
  try {
    return await run();
  } catch (error) {
    outcome = error instanceof AgentApiError ? error.code : "unavailable";
    throw error;
  } finally {
    log?.write({
      name: "agent.command",
      windowId,
      command,
      outcome,
      durationMs: Math.max(0, Date.now() - started),
    });
  }
}

// A window's answer settles only the request of its own channel.
function answerListener<R>(
  ownerFor: (event: IpcEvent) => Entry | undefined,
  valid: (payload: unknown) => payload is R,
  settle: (pending: PendingRequests, result: R) => void,
) {
  return (event: IpcEvent, payload?: unknown) => {
    const entry = ownerFor(event);
    if (entry && valid(payload)) settle(entry.pending, payload);
  };
}

// A granted window's commands; its reads, tab lists, presses and shortcut
// actions are asked of the window.
function commandsFor(
  entry: Entry,
  shortcut: AgentAccessOptions["shortcut"],
  keybinds: AgentAccessOptions["keybinds"],
): AgentCommands {
  const ask = <T>(channel: string, request: object, signal: AbortSignal) =>
    requestWindow<T>(entry.contents, entry.pending, channel, request, signal);
  return createAgentCommands({
    sessions: entry.sessions,
    ...(shortcut ? { shortcut } : {}),
    ...(keybinds ? { keybinds } : {}),
    ...(entry.closeNeedsUser ? { closeNeedsUser: entry.closeNeedsUser } : {}),
    ...(entry.native ? { native: entry.native } : {}),
    act: (sessionId, command, signal) =>
      ask<void>(agentIpc.action, { sessionId, command }, signal),
    read: (sessionId, lines, signal) =>
      ask<AgentPaneText>(agentIpc.read, { sessionId, lines }, signal),
    encode: (sessionId, keys, signal) =>
      ask<string>(agentIpc.press, { sessionId, keys }, signal),
    tabs: (signal) => ask<readonly AgentWindowTab[]>(agentIpc.tabs, {}, signal),
  });
}

function sendState(entry: Entry, state: AgentAccessState) {
  try {
    // A crashed renderer has no frame to receive it.
    if (!entry.contents.isDestroyed() && !entry.contents.isCrashed?.())
      entry.contents.send(agentIpc.state, state);
  } catch {
    // A window being torn down has no marks left to update.
  }
}

/**
 * Per-window agent grants (ADR 0052). Only toggle() creates one, and only
 * after the window confirmed its marks; the socket listens while a grant
 * exists. Grants live in memory; the credential file exists while they do.
 */
export function startAgentAccess(options: AgentAccessOptions) {
  const entries = new Map<object, Entry>();
  // This process, as OMXTERM_PANE, the credential and the handshake name it.
  const instance = randomBytes(8).toString("hex");
  const files = createGrantFiles(options.profile, instance);
  const socketPath = files.socketPath;
  const log = options.operationalEvents;
  const byWindowId = (windowId: number) =>
    [...entries.values()].find((entry) => entry.windowId === windowId);
  const active = () =>
    [...entries.values()].some((entry) => entry.state !== "off");

  const endpoint = createAgentEndpoint(socketPath, instance, {
    token: (windowId) => {
      const entry = byWindowId(windowId);
      return entry?.state === "granted" ? entry.token : undefined;
    },
    async request(windowId, command, args, caller) {
      const entry = byWindowId(windowId);
      if (entry?.state !== "granted" || !entry.commands)
        throw new AgentApiError("revoked", "The user stopped agent access.");
      const commands = entry.commands;
      return logged(log, windowId, command, () =>
        commands.run(command, args, caller),
      );
    },
    rejected: (reason) => log?.write({ name: "agent.rejected", reason }),
  });

  const removeGrantFile = (entry: Entry) => {
    if (!entry.credential) return;
    entry.credential = false;
    files.remove(entry.windowId);
  };

  const end = (
    entry: Entry,
    reason: AgentGrantEnd,
    refused?: AgentGrantRefusal,
  ) => {
    const was = entry.state;
    entry.state = "off";
    clearTimeout(entry.confirmTimer);
    endpoint.revoke(entry.windowId);
    entry.commands?.dispose();
    delete entry.commands;
    delete entry.token;
    for (const request of entry.pending.values())
      request.reject(
        new AgentApiError("revoked", "The user stopped agent access."),
      );
    entry.pending.clear();
    removeGrantFile(entry);
    if (!active()) endpoint.close();
    if (refused) {
      sendState(entry, { state: "off", refused });
      log?.write({
        name: "agent.grant",
        windowId: entry.windowId,
        action: "refused",
        reason: refused,
      });
    } else if (was !== "off") {
      sendState(entry, { state: "off" });
      if (was === "granted" || reason !== "user")
        log?.write({
          name: "agent.grant",
          windowId: entry.windowId,
          action: "ended",
          reason,
        });
    }
    if (was !== "off") options.changed?.();
  };

  const refuse = (entry: Entry, reason: AgentGrantRefusal) => {
    if (entry.state === "off") {
      sendState(entry, { state: "off", refused: reason });
      log?.write({
        name: "agent.grant",
        windowId: entry.windowId,
        action: "refused",
        reason,
      });
      // The menu item flipped its own check mark; put it back.
      options.changed?.();
      return;
    }
    end(entry, "user", reason);
  };

  // The renderer showed the marks: only now does the endpoint listen and
  // the credential exist (no mark, no access).
  const admitOnce = async (entry: Entry) => {
    clearTimeout(entry.confirmTimer);
    // Each toggle has its own token: a later attempt isn't this one.
    const token = entry.token!;
    const current = () => entry.state === "pending" && entry.token === token;
    try {
      await endpoint.listen(() => {
        for (const other of entries.values())
          if (other.state !== "off") end(other, "endpoint-failed");
      });
      if (!current()) return;
      await files.write(entry.windowId, token);
      entry.credential = true;
    } catch (error) {
      if (current())
        refuse(
          entry,
          error instanceof AgentEndpointInUseError ? "in-use" : "unavailable",
        );
      return;
    }
    if (!current()) {
      removeGrantFile(entry);
      return;
    }
    entry.state = "granted";
    entry.commands = commandsFor(entry, options.shortcut, options.keybinds);
    sendState(entry, { state: "granted" });
    log?.write({
      name: "agent.grant",
      windowId: entry.windowId,
      action: "started",
      reason: "user",
    });
    options.changed?.();
  };
  // One admission at a time per window, so a repeated confirmation can't
  // write or remove a credential under a grant that is being admitted.
  const admit = async (entry: Entry): Promise<void> => {
    if (entry.admitting) {
      entry.readmit = true;
      return;
    }
    entry.admitting = true;
    try {
      await admitOnce(entry);
    } finally {
      entry.admitting = false;
      if (entry.readmit) {
        entry.readmit = false;
        if (entry.state === "pending") await admit(entry);
      }
    }
  };

  const ownerFor = (event: IpcEvent) => {
    if (!options.trusted(event)) return undefined;
    return entries.get(event.sender);
  };
  const shownListener = (event: IpcEvent, payload?: unknown) => {
    const entry = ownerFor(event);
    if (!entry || payload !== undefined || entry.state !== "pending") return;
    void admit(entry);
  };
  const stopListener = (event: IpcEvent, payload?: unknown) => {
    const entry = ownerFor(event);
    if (entry && payload === undefined && entry.state !== "off")
      end(entry, "user");
  };
  const listen = <R>(
    channel: string,
    valid: (payload: unknown) => payload is R,
    settle: (pending: PendingRequests, result: R) => void,
  ) => {
    const listener = answerListener(ownerFor, valid, settle);
    options.ipc.on(channel, listener);
    return () => options.ipc.removeListener(channel, listener);
  };
  const stopAnswers = [
    listen(agentIpc.readResult, isAgentReadResult, settleRead),
    listen(agentIpc.pressResult, isAgentPressResult, settlePress),
    listen(agentIpc.tabsResult, isAgentTabsResult, settleTabs),
    listen(agentIpc.actionResult, isAgentActionResult, settleAction),
  ];
  options.ipc.on(agentIpc.shown, shownListener);
  options.ipc.on(agentIpc.stop, stopListener);

  return {
    instance,
    register(
      window: AgentAccessWindow,
      windowId: number,
      sessions: AgentSessionPort | undefined,
      closeNeedsUser?: (
        sessionIds: readonly TerminalSessionId[],
      ) => AgentCloseBlock | undefined,
      // Full Screen, New Window, Close Window and Quit, for this window.
      native?: (action: AgentNativeAction) => AgentCloseBlock | undefined,
    ) {
      if (!sessions) return;
      const contents = window.webContents;
      // A reload or a lost renderer can't keep its marks: the grant ends.
      const navigation = (
        _event: unknown,
        _url: unknown,
        inPlace: unknown,
        mainFrame: unknown,
      ) => {
        if (mainFrame && !inPlace && entry.state !== "off")
          end(entry, "reloaded");
      };
      let unsubscribe = () => {};
      const entry: Entry = {
        window,
        contents,
        windowId,
        sessions,
        ...(closeNeedsUser ? { closeNeedsUser } : {}),
        ...(native ? { native } : {}),
        state: "off",
        pending: new Map(),
        cleanup() {
          unsubscribe();
          contents.removeListener("did-start-navigation", navigation);
        },
      };
      entries.set(contents, entry);
      contents.on("did-start-navigation", navigation);
      unsubscribe = subscribeWindowOwnerLoss(window, () => {
        end(entry, "window-gone");
        entry.cleanup();
        entries.delete(contents);
      });
    },
    /** Allow Agents in This Window: the one gesture that grants. */
    toggle(window: AgentAccessWindow) {
      if (window.isDestroyed()) return;
      const entry = entries.get(window.webContents);
      if (!entry) return;
      if (entry.state !== "off") {
        end(entry, "user");
        return;
      }
      if (options.platform === "win32") return refuse(entry, "unsupported");
      if (Buffer.byteLength(socketPath) > maxSocketPathBytes(options.platform))
        return refuse(entry, "path-too-long");
      entry.state = "pending";
      entry.token = randomBytes(32);
      entry.confirmTimer = setTimeout(
        () => end(entry, "marks-unconfirmed"),
        MARKS_CONFIRM_MS,
      );
      sendState(entry, { state: "pending" });
      options.changed?.();
    },
    granted(window: AgentAccessWindow | undefined | null): boolean {
      if (!window || window.isDestroyed()) return false;
      return (entries.get(window.webContents)?.state ?? "off") !== "off";
    },
    /** Removes a crashed run's socket and credentials, never a live one's. */
    removeLeftovers: () =>
      active() ? Promise.resolve() : files.removeLeftovers(),
    dispose() {
      for (const entry of entries.values())
        if (entry.state !== "off") end(entry, "quit");
      for (const entry of entries.values()) entry.cleanup();
      entries.clear();
      endpoint.close();
      options.ipc.removeListener(agentIpc.shown, shownListener);
      options.ipc.removeListener(agentIpc.stop, stopListener);
      for (const stop of stopAnswers) stop();
    },
  };
}

export type AgentAccess = ReturnType<typeof startAgentAccess>;
