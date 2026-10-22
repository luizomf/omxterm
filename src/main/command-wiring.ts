import { BrowserWindow, type IpcMain } from "electron";
import { commandIpc } from "../shared/command-ipc";
import { isSavedSessionId } from "../shared/terminal-launch";
import { resolveApplicationDataDirectory } from "./application-data";
import {
  createCommandLibraryService,
  type CommandLibraryService,
} from "./command-library";
import { findExecutable } from "./executable-lookup";
import type { OperationalEventLog } from "./operational-events";
import type { IpcEvent, IpcMainPort } from "./terminal-ipc-types";
import { registerTrustedHandlers } from "./trusted-ipc";

// The Command Manager's custom commands and tool availability for every
// Terminal Window. Commands are only ever typed into a terminal by the
// renderer after the user previews them; main never runs them.
export async function startCommandLibrary(options: {
  readonly ipcMain: IpcMain;
  readonly homeDirectory: string;
  readonly isTrustedSender: (event: IpcEvent) => boolean;
  readonly operationalEvents: Pick<OperationalEventLog, "write">;
}): Promise<CommandLibraryService> {
  const service = createCommandLibraryService({
    directory: resolveApplicationDataDirectory(
      process.env,
      options.homeDirectory,
    ),
    findExecutable: (name) =>
      findExecutable(name, process.env, process.platform),
  });
  const loaded = await service.load();
  if (loaded.recovered)
    options.operationalEvents.write({
      name: "application-data.recovered",
      document: "commands",
      reason: loaded.recovered.reason,
    });
  service.subscribe((document) => {
    for (const window of BrowserWindow.getAllWindows())
      if (!window.webContents.isDestroyed())
        window.webContents.send(commandIpc.changed, document);
  });
  const requireId = (value: unknown) => {
    if (!isSavedSessionId(value)) throw new TypeError("Invalid command id");
    return value;
  };
  const flag = (payload: unknown) => {
    if (
      typeof payload !== "object" ||
      payload === null ||
      typeof (payload as Record<string, unknown>).on !== "boolean"
    )
      throw new TypeError("Invalid command flag");
    const { id, on } = payload as { id: unknown; on: boolean };
    return { id: requireId(id), on };
  };
  registerTrustedHandlers(
    options.ipcMain as unknown as IpcMainPort,
    options.isTrustedSender,
    {
      [commandIpc.list]: () => {
        service.refreshTools();
        return service.current();
      },
      [commandIpc.save]: (_event, payload) => service.saveCommand(payload),
      [commandIpc.delete]: (_event, payload) =>
        service.deleteCommand(requireId(payload)),
      [commandIpc.favorite]: (_event, payload) => {
        const { id, on } = flag(payload);
        return service.setFavorite(id, on);
      },
      [commandIpc.hide]: (_event, payload) => {
        const { id, on } = flag(payload);
        return service.setHidden(id, on);
      },
      [commandIpc.availability]: (_event, payload) => {
        if (
          !Array.isArray(payload) ||
          !payload.every((item) => typeof item === "string")
        )
          throw new TypeError("Invalid tool list");
        return service.availability(payload as string[]);
      },
      [commandIpc.platform]: () => process.platform,
    },
    () =>
      options.operationalEvents.write({
        name: "boundary.rejected",
        boundary: "ipc",
        reason: "untrusted-sender",
      }),
  );
  return service;
}
