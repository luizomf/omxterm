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

export function createElectronTerminalAdapter(
  bridge: TerminalBridge,
): TerminalSessionAdapter {
  let closed = false;
  let started = false;
  let sessionId: TerminalSessionId | undefined;
  let removeOutputListener: (() => void) | undefined;
  let removeExitListener: (() => void) | undefined;

  return {
    async start(handlers: TerminalSessionHandlers) {
      if (started || closed)
        throw new Error("Terminal Adapter cannot be started twice");
      started = true;
      removeOutputListener = bridge.onOutput((source, data) => {
        if (source === sessionId) handlers.onOutput(data);
      });
      removeExitListener = bridge.onExit((source, exit) => {
        if (source === sessionId) handlers.onExit(exit);
      });
      const startedSessionId = await bridge.start();
      sessionId = startedSessionId;
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
      if (sessionId !== undefined) bridge.close(sessionId);
    },
  };
}
