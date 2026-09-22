import type { TerminalIpcController } from "./terminal-ipc-controller";

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
  let resourcesDisposed = false;
  let windowClosed = false;

  const disposeResources = () => {
    if (resourcesDisposed) return;
    resourcesDisposed = true;
    window.webContents.removeListener("render-process-gone", onRendererLoss);
    window.webContents.removeListener("destroyed", onRendererLoss);
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

  window.webContents.once("render-process-gone", onRendererLoss);
  window.webContents.once("destroyed", onRendererLoss);
  window.on("enter-full-screen", onFullScreenChange);
  window.on("leave-full-screen", onFullScreenChange);
  window.once("closed", onClosed);

  return { dispose: disposeResources };
}
