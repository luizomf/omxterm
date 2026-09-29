import type { TerminalBridge } from "../shared/terminal-bridge";
import {
  isBoundedTerminalPayload,
  isTerminalSize,
  type TerminalSessionId,
  type TerminalSize,
} from "../shared/terminal-contract";
import type {
  TerminalSessionAdapter,
  TerminalSessionHandlers,
} from "../terminal-surface/terminal-session-adapter";

// The Terminal Surface only sees the portable TerminalSessionAdapter; the
// session id is exposed for the tab layer that owns this adapter.
export interface ElectronTerminalAdapter extends TerminalSessionAdapter {
  sessionId(): TerminalSessionId | undefined;
}

export function createElectronTerminalAdapter(
  bridge: TerminalBridge,
  fontConfigurationId?: string,
): ElectronTerminalAdapter {
  let closed = false;
  let started = false;
  let surfaceId: string | undefined;
  const retention =
    fontConfigurationId === undefined
      ? undefined
      : bridge.retainSurface(fontConfigurationId).then((id) => {
          surfaceId = id;
          if (closed) bridge.releaseSurface(id);
          return id;
        });
  // Initialization can fail before start consumes the registration response.
  // A rejected registration owns no resources; start still observes its error.
  void retention?.catch(() => {});
  let closeReason: "rendering-failure" | undefined;
  let sessionId: TerminalSessionId | undefined;
  let removeOutputListener: (() => void) | undefined;
  let removeExitListener: (() => void) | undefined;
  let pendingEvents: Array<
    | {
        readonly type: "output";
        readonly source: TerminalSessionId;
        readonly data: string;
        readonly end: number;
      }
    | {
        readonly type: "exit";
        readonly source: TerminalSessionId;
        readonly exit: Parameters<TerminalSessionHandlers["onExit"]>[0];
      }
  > = [];

  return {
    sessionId: () => sessionId,
    async start(handlers: TerminalSessionHandlers) {
      if (started || closed)
        throw new Error("Terminal Adapter cannot be started twice");
      started = true;
      const deliverOutput = (
        source: TerminalSessionId,
        data: string,
        end: number,
      ) => {
        if (closed || source !== sessionId) return;
        handlers.onOutput(data);
        bridge.acknowledgeOutput(source, end);
      };
      const deliverExit = (
        source: TerminalSessionId,
        exit: Parameters<TerminalSessionHandlers["onExit"]>[0],
      ) => {
        if (!closed && source === sessionId) handlers.onExit(exit);
      };
      removeOutputListener = bridge.onOutput((source, data, end) => {
        if (sessionId === undefined) {
          // The start response identifies the owner. Preserve every candidate
          // event until then: main already flow-controls each owned session,
          // and dropping a crossing native read here could strand it paused.
          pendingEvents.push({ type: "output", source, data, end });
          return;
        }
        deliverOutput(source, data, end);
      });
      removeExitListener = bridge.onExit((source, exit) => {
        if (sessionId === undefined) {
          pendingEvents.push({ type: "exit", source, exit });
          return;
        }
        deliverExit(source, exit);
      });
      const owner = retention ? await retention : undefined;
      if (closed) throw new Error("Terminal Adapter was closed before start");
      const startedSessionId = await (owner === undefined
        ? bridge.start()
        : bridge.start(owner));
      const closedBeforeStart = closed;
      sessionId = startedSessionId;
      for (const event of pendingEvents) {
        if (event.type === "output")
          deliverOutput(event.source, event.data, event.end);
        else deliverExit(event.source, event.exit);
      }
      pendingEvents = [];
      // The adapter owns exactly one Live Terminal Session: a close requested
      // while the start round-trip was in flight still terminates it.
      if (closedBeforeStart) bridge.close(startedSessionId, closeReason);
    },
    write(data: string) {
      if (!closed && sessionId !== undefined && isBoundedTerminalPayload(data))
        bridge.input(sessionId, data);
    },
    resize(size: TerminalSize) {
      if (!closed && sessionId !== undefined && isTerminalSize(size))
        bridge.resize(sessionId, size);
    },
    close(reason) {
      if (closed) return;
      closed = true;
      closeReason = reason;
      if (surfaceId !== undefined) bridge.releaseSurface(surfaceId);
      removeOutputListener?.();
      removeExitListener?.();
      pendingEvents = [];
      if (sessionId !== undefined) bridge.close(sessionId, closeReason);
    },
  };
}
