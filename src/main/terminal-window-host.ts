import type { BrowserWindow } from "electron";
import type { TerminalApplication } from "./terminal-application";
import type { TerminalIpcController } from "./terminal-ipc-controller";

export function guardTerminalWindowClose(
  window: BrowserWindow,
  application: Pick<
    TerminalApplication<BrowserWindow>,
    "mayCloseWindow" | "requestWindowClose"
  >,
): void {
  // A lost renderer has no session worth guarding.
  let rendererLost = false;
  window.webContents.once("render-process-gone", () => {
    rendererLost = true;
  });
  window.webContents.once("destroyed", () => {
    rendererLost = true;
  });
  window.on("close", (event) => {
    if (rendererLost || application.mayCloseWindow(window)) return;
    event.preventDefault();
    void application.requestWindowClose(window);
  });
}

interface EventSource {
  on(event: string, listener: () => void): void;
  once(event: string, listener: () => void): void;
  removeListener(event: string, listener: () => void): void;
}

export interface HostedTerminalWindow extends EventSource {
  readonly webContents: EventSource;
  isDestroyed(): boolean;
  isFullScreen(): boolean;
  close(): void;
}

export interface TerminalWindowHost {
  dispose(): void;
}

export function registerTerminalWindowHost(
  window: HostedTerminalWindow,
  controller: Pick<TerminalIpcController, "applyFullScreen" | "dispose">,
  onWindowClosed: () => void,
): TerminalWindowHost {
  const webContents = window.webContents;
  let resourcesDisposed = false;
  let windowClosed = false;

  const disposeResources = () => {
    if (resourcesDisposed) return;
    resourcesDisposed = true;
    webContents.removeListener("render-process-gone", onRendererLoss);
    webContents.removeListener("destroyed", onRendererLoss);
    window.removeListener("enter-full-screen", onFullScreenChange);
    window.removeListener("leave-full-screen", onFullScreenChange);
    controller.dispose();
  };

  const onRendererLoss = () => {
    disposeResources();
    if (!window.isDestroyed()) window.close();
  };

  const onFullScreenChange = () => {
    if (!resourcesDisposed) controller.applyFullScreen(window.isFullScreen());
  };

  const onClosed = () => {
    disposeResources();
    if (windowClosed) return;
    windowClosed = true;
    onWindowClosed();
  };

  webContents.once("render-process-gone", onRendererLoss);
  webContents.once("destroyed", onRendererLoss);
  window.on("enter-full-screen", onFullScreenChange);
  window.on("leave-full-screen", onFullScreenChange);
  window.once("closed", onClosed);

  return { dispose: disposeResources };
}
