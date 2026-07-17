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

export const DEFAULT_SCROLLBACK_LINES = 10_000;
export const MAX_SCROLLBACK_LINES = 100_000;

export type OptionKeyMode = "none" | "left" | "right" | "both";

export interface TerminalSurfaceOptions {
  readonly scrollbackLines?: number;
  readonly optionKeyMode?: OptionKeyMode;
}

export async function mountTerminalSurface(
  container: HTMLElement,
  adapter: TerminalSessionAdapter,
  options: TerminalSurfaceOptions = {},
): Promise<TerminalSurface> {
  const scrollbackLines = options.scrollbackLines ?? DEFAULT_SCROLLBACK_LINES;
  const optionKeyMode = options.optionKeyMode ?? "none";

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
    if (
      !Number.isInteger(scrollbackLines) ||
      scrollbackLines < 0 ||
      scrollbackLines > MAX_SCROLLBACK_LINES
    ) {
      throw new TypeError(
        `scrollback.lines must be an integer from 0 through ${MAX_SCROLLBACK_LINES}`,
      );
    }
    if (
      optionKeyMode !== "none" &&
      optionKeyMode !== "left" &&
      optionKeyMode !== "right" &&
      optionKeyMode !== "both"
    ) {
      throw new TypeError(
        "keyboard.optionAsAlt must be none, left, right, or both",
      );
    }

    const mountedTerminal = new Terminal({
      cursorBlink: true,
      convertEol: false,
      scrollback: scrollbackLines,
      macOptionIsMeta: optionKeyMode === "both",
    });
    terminal = mountedTerminal;
    applyOptionKeyMode(mountedTerminal, optionKeyMode);
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

function applyOptionKeyMode(terminal: Terminal, mode: OptionKeyMode): void {
  let leftOptionDown = false;
  let rightOptionDown = false;

  terminal.attachCustomKeyEventHandler((event) => {
    if (event.code === "AltLeft") leftOptionDown = event.type !== "keyup";
    if (event.code === "AltRight") rightOptionDown = event.type !== "keyup";
    if (!event.altKey) {
      leftOptionDown = false;
      rightOptionDown = false;
    }

    terminal.options.macOptionIsMeta =
      mode === "both" ||
      (mode === "left" && leftOptionDown) ||
      (mode === "right" && rightOptionDown);
    return true;
  });
}
