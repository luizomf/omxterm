import type { IpcRenderer, IpcRendererEvent } from "electron";
import { backupIpc, isBackupRequest } from "../shared/backup-ipc";
import type { BackupBridge } from "../shared/terminal-bridge";

const MAX_PASSPHRASE_LENGTH = 1024;

export function createBackupBridge(ipc: IpcRenderer): BackupBridge {
  const passphrase = (value: string) => {
    if (typeof value !== "string" || value.length > MAX_PASSPHRASE_LENGTH)
      throw new TypeError("Invalid passphrase");
    return value;
  };
  return {
    async create(value) {
      return (await ipc.invoke(backupIpc.create, passphrase(value))) === true;
    },
    async choose() {
      return (await ipc.invoke(backupIpc.choose)) === true;
    },
    async restore(value) {
      const response: unknown = await ipc.invoke(
        backupIpc.restore,
        passphrase(value),
      );
      const restored =
        typeof response === "object" && response !== null
          ? (response as Record<string, unknown>).restored
          : undefined;
      if (!Number.isInteger(restored))
        throw new TypeError("Invalid restore response");
      return { restored: restored as number };
    },
    onRequest(listener) {
      const handler = (_event: IpcRendererEvent, payload: unknown) => {
        if (isBackupRequest(payload)) listener(payload);
      };
      ipc.on(backupIpc.request, handler);
      return () => ipc.removeListener(backupIpc.request, handler);
    },
  };
}
