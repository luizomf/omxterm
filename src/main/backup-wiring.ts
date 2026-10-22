import { BrowserWindow, dialog, type IpcMain } from "electron";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { backupIpc, type BackupRequest } from "../shared/backup-ipc";
import {
  BACKUP_EXTENSION,
  BackupError,
  collectBackup,
  decryptBackup,
  encryptBackup,
  MAX_BACKUP_BYTES,
  restoreBackup,
  validatePassphrase,
  type RestoreTargets,
} from "./settings-backup";
import type { IpcEvent, IpcMainPort } from "./terminal-ipc-types";
import { registerTrustedHandlers } from "./trusted-ipc";

export interface SettingsBackup {
  // Starts the create or restore flow in the focused Terminal Window.
  request(kind: BackupRequest): void;
}

// Backup and restore of settings. The renderer collects the passphrase; main
// chooses files with native dialogs, encrypts, decrypts and applies them, so
// the renderer never sees a path or file contents.
export function startSettingsBackup(options: {
  readonly ipcMain: IpcMain;
  readonly isTrustedSender: (event: IpcEvent) => boolean;
  readonly directory: string;
  readonly homeDirectory: string;
  readonly targets: RestoreTargets;
  readonly reloadConfiguration: () => Promise<unknown>;
}): SettingsBackup {
  // A chosen backup waits here, per window, until its passphrase arrives.
  const chosen = new WeakMap<object, Uint8Array>();
  const ownerOf = (event: IpcEvent) =>
    BrowserWindow.fromWebContents(event.sender as Electron.WebContents);
  const filters = [{ name: "OMXTerm backup", extensions: [BACKUP_EXTENSION] }];
  const userMessage = (cause: unknown) =>
    new Error(
      cause instanceof BackupError
        ? cause.message
        : "The backup could not be completed",
    );

  registerTrustedHandlers(
    options.ipcMain as unknown as IpcMainPort,
    options.isTrustedSender,
    {
      [backupIpc.create]: async (event, passphrase) => {
        try {
          validatePassphrase(passphrase);
          const owner = ownerOf(event);
          const date = new Date().toISOString().slice(0, 10);
          const saveOptions = {
            defaultPath: path.join(
              options.homeDirectory,
              `omxterm-settings-${date}.${BACKUP_EXTENSION}`,
            ),
            filters,
          };
          const result = owner
            ? await dialog.showSaveDialog(owner, saveOptions)
            : await dialog.showSaveDialog(saveOptions);
          if (result.canceled || !result.filePath) return false;
          const contents = await collectBackup(options.directory);
          const bytes = await encryptBackup(contents, passphrase as string);
          await writeFile(result.filePath, bytes, { mode: 0o600 });
          return true;
        } catch (cause) {
          throw userMessage(cause);
        }
      },
      [backupIpc.choose]: async (event) => {
        const owner = ownerOf(event);
        const openOptions: Electron.OpenDialogOptions = {
          properties: ["openFile"],
          filters,
        };
        const result = owner
          ? await dialog.showOpenDialog(owner, openOptions)
          : await dialog.showOpenDialog(openOptions);
        const file = result.filePaths[0];
        if (result.canceled || !file) return false;
        // Fixed messages keep the chosen path out of errors and logs.
        const bytes = await readFile(file).catch(() => {
          throw new Error("The backup file could not be read");
        });
        if (bytes.byteLength > MAX_BACKUP_BYTES)
          throw new Error("The backup file is too large");
        chosen.set(event.sender, bytes);
        return true;
      },
      [backupIpc.restore]: async (event, passphrase) => {
        const bytes = chosen.get(event.sender);
        if (!bytes) throw new Error("Choose a backup file first");
        try {
          const contents = await decryptBackup(bytes, passphrase as string);
          chosen.delete(event.sender);
          const result = await restoreBackup(
            contents,
            options.directory,
            options.targets,
          );
          await options.reloadConfiguration();
          return result;
        } catch (cause) {
          throw userMessage(cause);
        }
      },
    },
  );

  return {
    request(kind) {
      const window =
        BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
      if (window && !window.webContents.isDestroyed())
        window.webContents.send(backupIpc.request, kind);
    },
  };
}
