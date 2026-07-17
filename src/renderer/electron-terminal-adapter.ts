import type { TerminalBridge } from "../shared/terminal-bridge";
import {
  isBoundedTerminalPayload,
  isTerminalSize,
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
  let removeOutputListener: (() => void) | undefined;
  let removeExitListener: (() => void) | undefined;

  return {
    async start(handlers: TerminalSessionHandlers) {
      if (started || closed)
        throw new Error("Terminal Adapter cannot be started twice");
      started = true;
      removeOutputListener = bridge.onOutput(handlers.onOutput);
      removeExitListener = bridge.onExit(handlers.onExit);
      await bridge.start();
    },
    write(data: string) {
      if (!closed && isBoundedTerminalPayload(data)) bridge.input(data);
    },
    resize(size: TerminalSize) {
      if (!closed && isTerminalSize(size)) bridge.resize(size);
    },
    close() {
      if (closed) return;
      closed = true;
      removeOutputListener?.();
      removeExitListener?.();
      bridge.close();
    },
  };
}
