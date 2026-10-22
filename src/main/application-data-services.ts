import { app, BrowserWindow, type IpcMain } from "electron";
import { highlightIpc } from "../shared/highlight-ipc";
import { statSync } from "node:fs";
import { parseSshTarget } from "../shared/saved-session-primitives";
import { resolveApplicationDataDirectory } from "./application-data";
import { startSettingsBackup } from "./backup-wiring";
import { startCommandLibrary } from "./command-wiring";
import { startHighlightSettings } from "./highlight-wiring";
import type { OperationalEventLog } from "./operational-events";
import { startSavedSessions } from "./saved-session-wiring";
import type { IpcEvent } from "./terminal-ipc-types";
import { createWorkspaceService } from "./workspace-service";

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
  readonly isQuitting: () => boolean;
  // The highlighting or restore checkbox changed.
  readonly onMenuStateChange: () => void;
}) {
  const {
    startupConnection,
    reloadConfiguration,
    isQuitting,
    onMenuStateChange,
    ...shared
  } = options;
  const savedSessions = await startSavedSessions({
    ...shared,
    ...(startupConnection === undefined ? {} : { startupConnection }),
  });
  const highlightSettings = await startHighlightSettings(shared);
  highlightSettings.subscribe(onMenuStateChange);
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
  const workspace = createWorkspaceService({
    directory: resolveApplicationDataDirectory(
      process.env,
      options.homeDirectory,
    ),
    isDirectory: (directory) => {
      try {
        return statSync(directory).isDirectory();
      } catch {
        return false;
      }
    },
    savedSession: (id) =>
      savedSessions.current().sessions.find((session) => session.id === id),
    isQuickTarget: (target) => parseSshTarget(target) !== undefined,
    isQuitting,
  });
  await workspace.load();
  // Windows are closed by now; the final layouts are written synchronously.
  app.on("will-quit", () => {
    try {
      workspace.saveOnExit();
    } catch {
      // A failed write keeps the previous workspace.json.
    }
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
    openHighlightRules: () => {
      const window =
        BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
      if (window && !window.webContents.isDestroyed())
        window.webContents.send(highlightIpc.openEditor);
    },
    toggleRestoreWorkspace: () => {
      void workspace
        .setRestore(!workspace.restoreEnabled())
        .finally(rebuildMenu);
    },
  });
  const menuState = () => ({
    outputHighlighting: highlightSettings.current().enabled,
    restoreWorkspace: workspace.restoreEnabled(),
  });
  return { savedSessions, workspace, menuActions, menuState };
}
