import { hostname, homedir } from "node:os";
import path from "node:path";
import { shell, type IpcMain } from "electron";
import {
  fileBrowserIpc,
  isFileName,
  isFilePath,
  isFilePathList,
} from "../shared/file-browser";
import { createFileBrowser } from "./file-browser";
import type { OperationalEventLog } from "./operational-events";
import type { IpcEvent, IpcMainPort } from "./terminal-ipc-types";
import { registerTrustedHandlers } from "./trusted-ipc";

function record(payload: unknown): Record<string, unknown> {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload))
    throw new TypeError("Invalid file request");
  return payload as Record<string, unknown>;
}

function filePath(value: unknown): string {
  if (!isFilePath(value) || !path.isAbsolute(value))
    throw new TypeError("Invalid file path");
  return value;
}

function fileName(value: unknown): string {
  if (!isFileName(value)) throw new TypeError("Invalid file name");
  return value;
}

// Serves the Files panel. Every handler validates its payload; paths must be
// absolute and names single components, so a request cannot reach outside
// what the user picked in the panel through "..".
export function startFileBrowser(options: {
  readonly ipcMain: IpcMain;
  readonly isTrustedSender: (event: IpcEvent) => boolean;
  readonly operationalEvents: Pick<OperationalEventLog, "write">;
}): () => void {
  const browser = createFileBrowser({
    platform: process.platform,
    hostname: hostname(),
    trash: (target) => shell.trashItem(target),
  });
  return registerTrustedHandlers(
    options.ipcMain as unknown as IpcMainPort,
    options.isTrustedSender,
    {
      [fileBrowserIpc.home]: () => ({
        home: homedir(),
        platform: process.platform,
        separator: path.sep,
      }),
      [fileBrowserIpc.list]: (_event, payload) =>
        browser.list(filePath(payload)),
      [fileBrowserIpc.resolve]: async (_event, payload) => {
        if (typeof payload !== "string" || payload.length > 8_192)
          throw new TypeError("Invalid directory URI");
        return (await browser.resolve(payload)) ?? null;
      },
      [fileBrowserIpc.open]: async (_event, payload) => {
        const failure = await shell.openPath(filePath(payload));
        return failure === ""
          ? { ok: true }
          : { ok: false, error: failure.slice(0, 512) };
      },
      [fileBrowserIpc.reveal]: (_event, payload) => {
        shell.showItemInFolder(filePath(payload));
        return { ok: true };
      },
      [fileBrowserIpc.createFolder]: (_event, payload) => {
        const request = record(payload);
        return browser.createFolder(
          filePath(request.parent),
          fileName(request.name),
        );
      },
      [fileBrowserIpc.createFile]: (_event, payload) => {
        const request = record(payload);
        return browser.createFile(
          filePath(request.parent),
          fileName(request.name),
        );
      },
      [fileBrowserIpc.rename]: (_event, payload) => {
        const request = record(payload);
        return browser.rename(filePath(request.path), fileName(request.name));
      },
      [fileBrowserIpc.trash]: (_event, payload) => {
        if (!isFilePathList(payload)) throw new TypeError("Invalid file list");
        return browser.trash(payload.map(filePath));
      },
      [fileBrowserIpc.copyOrMove]: (_event, payload) => {
        const request = record(payload);
        if (request.mode !== "copy" && request.mode !== "move")
          throw new TypeError("Invalid transfer");
        if (!isFilePathList(request.sources))
          throw new TypeError("Invalid file list");
        return browser.transfer(
          request.mode,
          request.sources.map(filePath),
          filePath(request.destination),
        );
      },
    },
    () =>
      options.operationalEvents.write({
        name: "boundary.rejected",
        boundary: "ipc",
        reason: "untrusted-sender",
      }),
  );
}
