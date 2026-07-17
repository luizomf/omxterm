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
  let disposed = false;
  let terminal: Terminal | undefined;
  let inputSubscription: { dispose(): void } | undefined;
  let resizeSubscription: { dispose(): void } | undefined;
  let resizeObserver: ResizeObserver | undefined;

  const surface: TerminalSurface = {
    dispose() {
      const cleanupError = disposeResources();
      if (cleanupError) throw cleanupError.error;
    },
  };

  const disposeResources = (): { readonly error: unknown } | undefined => {
    if (disposed) return undefined;
    disposed = true;
    let firstError: unknown;
    let failed = false;
    for (const dispose of [
      () => resizeObserver?.disconnect(),
      () => inputSubscription?.dispose(),
      () => resizeSubscription?.dispose(),
      () => adapter.close(),
      () => terminal?.dispose(),
    ]) {
      try {
        dispose();
      } catch (error) {
        if (!failed) {
          failed = true;
          firstError = error;
        }
      }
    }
    return failed ? { error: firstError } : undefined;
  };

  try {
    const mountedTerminal = new Terminal({
      cursorBlink: true,
      convertEol: false,
    });
    terminal = mountedTerminal;
    const mountedFitAddon = new FitAddon();
    mountedTerminal.loadAddon(mountedFitAddon);
    mountedTerminal.open(container);

    inputSubscription = mountedTerminal.onData((data) => {
      for (const chunk of splitTerminalPayload(data)) adapter.write(chunk);
    });
    resizeSubscription = mountedTerminal.onResize((size) => {
      if (isTerminalSize(size)) adapter.resize(size);
    });
    resizeObserver = new ResizeObserver(() => mountedFitAddon.fit());
    resizeObserver.observe(container);

    await adapter.start({
      onOutput(data) {
        if (!disposed && isBoundedTerminalPayload(data))
          mountedTerminal.write(data);
      },
      onExit() {
        surface.dispose();
      },
    });
    if (!disposed) mountedFitAddon.fit();
    return surface;
  } catch (error) {
    disposeResources();
    throw new Error("Failed to mount the Terminal Surface", {
      cause: error,
    });
  }
}
