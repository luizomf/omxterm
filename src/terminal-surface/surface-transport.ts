import type { PtyCallbacks, PtyTransport } from "restty";
import { isTerminalSize, type TerminalSize } from "../shared/terminal-contract";
import type {
  TerminalSessionAdapter,
  TerminalSessionHandlers,
} from "./terminal-session-adapter";

// Rendering survives a retained exit; native transport authority does not.
export function surfaceTransport(
  adapter: TerminalSessionAdapter,
  live: () => boolean,
  ready: () => boolean,
  resized: (
    size: TerminalSize,
    meta: Parameters<PtyTransport["resize"]>[2],
  ) => void,
  laidOut: () => boolean = () => true,
) {
  let callbacks: PtyCallbacks | undefined;
  let cell: { readonly width: number; readonly height: number } | undefined;
  let measured: TerminalSize | undefined;
  const writable = () => live() && ready();
  const transport: PtyTransport = {
    connect(options) {
      if (live()) {
        callbacks = options.callbacks;
        callbacks.onConnect?.();
      }
    },
    disconnect() {
      const previous = callbacks;
      callbacks = undefined;
      previous?.onDisconnect?.();
    },
    sendInput(data) {
      if (writable()) adapter.write(data);
      return writable();
    },
    resize(cols, rows, meta) {
      // A resize without metadata (the post-start replay) reuses the last
      // device-pixel cell size Restty reported.
      if (meta?.cellW !== undefined && meta.cellH !== undefined)
        cell = { width: meta.cellW, height: meta.cellH };
      const size = withPixels({ cols, rows }, cell);
      // A hidden tab's grid comes from a placeholder canvas unless the host
      // estimated its box; keep only a laid-out or estimated grid, even if the
      // tab is shown before start.
      measured = laidOut() ? size : undefined;
      resized(size, meta);
      if (writable()) adapter.resize(size);
      return writable();
    },
    isConnected: () => callbacks !== undefined && live(),
    destroy() {},
  };
  return {
    transport,
    output: (data: string) => {
      if (live()) callbacks?.onData?.(data);
    },
    // Start at the grid Restty reported on connect, pixels included, so a
    // program that runs at once reads it (#1038, #1041). Without one: 80×24.
    start: (handlers: TerminalSessionHandlers) =>
      adapter.start(handlers, measured),
  };
}

function withPixels(
  size: TerminalSize,
  cell: { readonly width: number; readonly height: number } | undefined,
): TerminalSize {
  if (!cell) return size;
  const sized = {
    ...size,
    pixelWidth: size.cols * cell.width,
    pixelHeight: size.rows * cell.height,
  };
  return isTerminalSize(sized) ? sized : size;
}
