import { FitAddon } from "@xterm/addon-fit";
import { Terminal } from "@xterm/xterm";
import {
  isBoundedTerminalPayload,
  isTerminalSize,
  splitTerminalPayload,
} from "../shared/terminal-contract";
import type { TerminalSessionAdapter } from "./terminal-session-adapter";

export interface TerminalSurface {
  dispose(): void;
}

export async function mountTerminalSurface(
  container: HTMLElement,
  adapter: TerminalSessionAdapter,
): Promise<TerminalSurface> {
  const terminal = new Terminal({
    cursorBlink: true,
    convertEol: false,
  });
  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.open(container);

  let disposed = false;
  const inputSubscription = terminal.onData((data) => {
    for (const chunk of splitTerminalPayload(data)) adapter.write(chunk);
  });
  const resizeSubscription = terminal.onResize((size) => {
    if (isTerminalSize(size)) adapter.resize(size);
  });
  const resizeObserver = new ResizeObserver(() => fitAddon.fit());
  resizeObserver.observe(container);

  const surface: TerminalSurface = {
    dispose() {
      if (disposed) return;
      disposed = true;
      resizeObserver.disconnect();
      inputSubscription.dispose();
      resizeSubscription.dispose();
      adapter.close();
      terminal.dispose();
    },
  };

  try {
    await adapter.start({
      onOutput(data) {
        if (!disposed && isBoundedTerminalPayload(data)) terminal.write(data);
      },
      onExit() {
        surface.dispose();
      },
    });
    if (!disposed) fitAddon.fit();
    return surface;
  } catch (error) {
    surface.dispose();
    throw new Error("Failed to start the Terminal Surface session Adapter", {
      cause: error,
    });
  }
}
