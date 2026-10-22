import type { IpcEvent, IpcHandler, IpcMainPort } from "./terminal-ipc-types";

export type TrustedIpcHandler = (
  event: IpcEvent,
  payload?: unknown,
) => Promise<unknown> | unknown;

// Registers invoke handlers that only answer the main frame of a registered
// Terminal Window; anything else is rejected before the handler runs.
export function registerTrustedHandlers(
  ipcMain: IpcMainPort,
  isTrusted: (event: IpcEvent) => boolean,
  handlers: Readonly<Record<string, TrustedIpcHandler>>,
  onRejected?: () => void,
): () => void {
  const channels = Object.keys(handlers);
  for (const channel of channels) {
    const handler: IpcHandler = (event, payload) => {
      if (event.senderFrame !== event.sender.mainFrame || !isTrusted(event)) {
        onRejected?.();
        throw new Error("Rejected IPC from an untrusted sender");
      }
      return handlers[channel]!(event, payload);
    };
    ipcMain.handle(channel, handler);
  }
  return () => {
    for (const channel of channels) ipcMain.removeHandler(channel);
  };
}
