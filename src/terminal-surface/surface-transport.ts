import type { PtyCallbacks, PtyTransport } from "restty";
import { isTerminalSize, type TerminalSize } from "../shared/terminal-contract";
import type { TerminalSessionAdapter } from "./terminal-session-adapter";

// Rendering survives a retained exit; native transport authority does not.
export function surfaceTransport(
  adapter: TerminalSessionAdapter,
  live: () => boolean,
  ready: () => boolean,
  resized: (
    size: TerminalSize,
    meta: Parameters<PtyTransport["resize"]>[2],
  ) => void,
) {
  let callbacks: PtyCallbacks | undefined;
  let cell: { readonly width: number; readonly height: number } | undefined;
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
