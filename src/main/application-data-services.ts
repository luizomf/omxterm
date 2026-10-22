import type { IpcMain } from "electron";
import { resolveApplicationDataDirectory } from "./application-data";
import { startSettingsBackup } from "./backup-wiring";
import { startCommandLibrary } from "./command-wiring";
import { startHighlightSettings } from "./highlight-wiring";
import type { OperationalEventLog } from "./operational-events";
import { startSavedSessions } from "./saved-session-wiring";
import type { IpcEvent } from "./terminal-ipc-types";

// Loads the Application Data documents (sessions, highlighting, commands),
// serves their IPC to trusted windows, and backs them up and restores them
// together with the user configuration.
export async function startApplicationDataServices(options: {
  readonly ipcMain: IpcMain;
  readonly homeDirectory: string;
  readonly isTrustedSender: (event: IpcEvent) => boolean;
  readonly operationalEvents: Pick<OperationalEventLog, "write">;
  readonly startupConnection: string | undefined;
  readonly reloadConfiguration: () => Promise<unknown>;
}) {
  const { startupConnection, reloadConfiguration, ...shared } = options;
  const savedSessions = await startSavedSessions({
    ...shared,
    ...(startupConnection === undefined ? {} : { startupConnection }),
  });
  const highlightSettings = await startHighlightSettings(shared);
  const commandLibrary = await startCommandLibrary(shared);
  const backup = startSettingsBackup({
    ipcMain: options.ipcMain,
    isTrustedSender: options.isTrustedSender,
    directory: resolveApplicationDataDirectory(
      process.env,
      options.homeDirectory,
    ),
    homeDirectory: options.homeDirectory,
    targets: {
      "sessions.json": savedSessions.prepareRestore,
      "highlights.json": highlightSettings.prepareRestore,
      "commands.json": commandLibrary.prepareRestore,
    },
    reloadConfiguration,
  });
  // Menu actions for these documents; a failed toggle restores the menu.
  const menuActions = (rebuildMenu: () => void) => ({
    toggleOutputHighlighting: () => {
      const current = highlightSettings.current();
      void highlightSettings
        .save({ ...current, enabled: !current.enabled })
        .catch(rebuildMenu);
    },
    backUpSettings: () => backup.request("create"),
    restoreSettings: () => backup.request("restore"),
  });
  return { savedSessions, highlightSettings, menuActions };
}
