import { BrowserWindow, type IpcMain } from "electron";
import { highlightIpc } from "../shared/highlight-ipc";
import { resolveApplicationDataDirectory } from "./application-data";
import {
  createHighlightSettingsService,
  type HighlightSettingsService,
} from "./highlight-settings-store";
import type { OperationalEventLog } from "./operational-events";
import type { IpcEvent, IpcMainPort } from "./terminal-ipc-types";
import { registerTrustedHandlers } from "./trusted-ipc";

// Loads highlights.json and serves it to Terminal Windows; every change is
// broadcast so all windows and panes apply the same rules immediately.
export async function startHighlightSettings(options: {
  readonly ipcMain: IpcMain;
  readonly homeDirectory: string;
  readonly isTrustedSender: (event: IpcEvent) => boolean;
  readonly operationalEvents: Pick<OperationalEventLog, "write">;
}): Promise<HighlightSettingsService> {
  const service = createHighlightSettingsService(
    resolveApplicationDataDirectory(process.env, options.homeDirectory),
  );
  const loaded = await service.load();
  if (loaded.recovered)
    options.operationalEvents.write({
      name: "application-data.recovered",
      document: "highlights",
      reason: loaded.recovered.reason,
    });
  service.subscribe((settings) => {
    for (const window of BrowserWindow.getAllWindows())
      if (!window.webContents.isDestroyed())
        window.webContents.send(highlightIpc.changed, settings);
  });
  registerTrustedHandlers(
    options.ipcMain as unknown as IpcMainPort,
    options.isTrustedSender,
    {
      [highlightIpc.get]: () => service.current(),
      [highlightIpc.save]: (_event, payload) => service.save(payload),
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
