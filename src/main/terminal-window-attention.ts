import type { BrowserWindow, Dock } from "electron";
import {
  createTerminalWindowTitleController,
  type TerminalWindowTitleControllerOptions,
} from "./terminal-window-title";

export function createNativeTerminalWindowTitleController(
  window: Parameters<typeof createTerminalWindowTitleController>[0] &
    Pick<BrowserWindow, "flashFrame" | "isDestroyed">,
  options: Omit<TerminalWindowTitleControllerOptions, "requestAttention">,
  dock: Pick<Dock, "bounce" | "cancelBounce"> | undefined,
  platform: string = process.platform,
) {
  return createTerminalWindowTitleController(window, {
    ...options,
    requestAttention: () =>
      requestTerminalWindowAttention(window, dock, platform),
  });
}

function requestTerminalWindowAttention(
  window: Pick<BrowserWindow, "flashFrame" | "isDestroyed">,
  dock: Pick<Dock, "bounce" | "cancelBounce"> | undefined,
  platform: string = process.platform,
): () => void {
  if (platform === "darwin" && dock) {
    const requestId = dock.bounce("informational");
    return () => {
      if (requestId >= 0) dock.cancelBounce(requestId);
    };
  }
  if (platform === "linux" || platform === "win32") {
    window.flashFrame(true);
    return () => {
      // The controller also disposes on `closed`, after the native window is gone.
      if (!window.isDestroyed()) window.flashFrame(false);
    };
  }
  return () => {};
}
