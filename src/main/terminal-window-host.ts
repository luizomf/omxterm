import type { TerminalIpcController } from "./terminal-ipc-controller";

interface EventSource {
  once(event: string, listener: () => void): void;
  removeListener(event: string, listener: () => void): void;
}

export interface HostedTerminalWindow extends EventSource {
  readonly webContents: EventSource;
  isDestroyed(): boolean;
  close(): void;
}

export interface TerminalWindowHost {
  dispose(): void;
}

export function registerTerminalWindowHost(
  window: HostedTerminalWindow,
  controller: TerminalIpcController,
  onWindowClosed: () => void,
): TerminalWindowHost {
  let resourcesDisposed = false;
  let windowClosed = false;

  const disposeResources = () => {
    if (resourcesDisposed) return;
    resourcesDisposed = true;
    window.webContents.removeListener("render-process-gone", onRendererLoss);
    window.webContents.removeListener("destroyed", onRendererLoss);
    controller.dispose();
  };

  const onRendererLoss = () => {
    disposeResources();
    if (!window.isDestroyed()) window.close();
  };

  const onClosed = () => {
    disposeResources();
    if (windowClosed) return;
    windowClosed = true;
    onWindowClosed();
  };

  window.webContents.once("render-process-gone", onRendererLoss);
  window.webContents.once("destroyed", onRendererLoss);
  window.once("closed", onClosed);

  return { dispose: disposeResources };
}
