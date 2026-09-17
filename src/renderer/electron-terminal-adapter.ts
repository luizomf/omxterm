import type { TerminalBridge } from "../shared/terminal-bridge";
import {
  isBoundedTerminalPayload,
  isTerminalSize,
  MAX_TERMINAL_PAYLOAD_BYTES,
  type TerminalSessionId,
  type TerminalSize,
} from "../shared/terminal-contract";
import type {
  TerminalSessionAdapter,
  TerminalSessionHandlers,
} from "../terminal-surface/terminal-session-adapter";

const encoder = new TextEncoder();

// The Terminal Surface only sees the portable TerminalSessionAdapter; the
// session id is exposed for the tab layer that owns this adapter.
export interface ElectronTerminalAdapter extends TerminalSessionAdapter {
  sessionId(): TerminalSessionId | undefined;
}

export function createElectronTerminalAdapter(
  bridge: TerminalBridge,
): ElectronTerminalAdapter {
  let closed = false;
  let started = false;
  let sessionId: TerminalSessionId | undefined;
  let removeOutputListener: (() => void) | undefined;
  let removeExitListener: (() => void) | undefined;
  const pendingOutputBytes = new Map<TerminalSessionId, number>();
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
          const pending = pendingOutputBytes.get(source) ?? 0;
          const next = pending + encoder.encode(data).byteLength;
          // The not-yet-known owning session is main-side flow controlled;
          // cap unrelated sessions observed during the start round-trip too.
          if (next <= 2 * MAX_TERMINAL_PAYLOAD_BYTES) {
            pendingOutputBytes.set(source, next);
            pendingEvents.push({ type: "output", source, data, end });
          }
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
      const startedSessionId = await bridge.start();
      sessionId = startedSessionId;
      for (const event of pendingEvents) {
        if (event.type === "output")
          deliverOutput(event.source, event.data, event.end);
        else deliverExit(event.source, event.exit);
      }
      pendingEvents = [];
      pendingOutputBytes.clear();
      // The adapter owns exactly one Live Terminal Session: a close requested
      // while the start round-trip was in flight still terminates it.
      if (closed) bridge.close(startedSessionId);
    },
    write(data: string) {
      if (!closed && sessionId !== undefined && isBoundedTerminalPayload(data))
        bridge.input(sessionId, data);
    },
    resize(size: TerminalSize) {
      if (!closed && sessionId !== undefined && isTerminalSize(size))
        bridge.resize(sessionId, size);
    },
    close() {
      if (closed) return;
      closed = true;
      removeOutputListener?.();
      removeExitListener?.();
      pendingEvents = [];
      pendingOutputBytes.clear();
      if (sessionId !== undefined) bridge.close(sessionId);
    },
  };
}
