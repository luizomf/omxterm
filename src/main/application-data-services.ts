import { app, BrowserWindow, safeStorage, type IpcMain } from "electron";
import { highlightIpc } from "../shared/highlight-ipc";
import { fileBrowserIpc } from "../shared/file-browser";
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
import { startPreferences } from "./preferences-wiring";
import { startFileBrowser } from "./file-browser-wiring";
import { startOutputFiles } from "./output-file-wiring";
import { startRemoteFiles } from "./remote-files-wiring";
import { startAssistant } from "./assistant-wiring";
import { createCredentialStore } from "./credential-store";
import { startAbout } from "./about-wiring";
import { startFilePeek } from "./file-peek-wiring";
import { MAX_WINDOW_CORNER_RADIUS } from "../shared/user-configuration";
import type { TerminalIpcRouter } from "./terminal-ipc-types";
import type { PreferencesServiceOptions } from "./preferences-service";

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
  // How each pane started, for remote browsing in the Files panel.
  readonly sessionLaunch: TerminalIpcRouter["sessionLaunch"];
  // The user's shell, named to the assistant (basename only).
  readonly shell: string;
  // config.json access for the Preferences dialog.
  readonly configuration: Pick<
    PreferencesServiceOptions,
    "configurationPath" | "platform" | "validate" | "active"
  >;
}) {
  const {
    startupConnection,
    reloadConfiguration,
    isQuitting,
    onMenuStateChange,
    configuration,
    sessionLaunch,
    shell,
    ...shared
  } = options;
  // One store for every secret (AI keys, SSH passwords), so writes to
  // credentials.json never race.
  const credentials = createCredentialStore(
    safeStorage,
    resolveApplicationDataDirectory(process.env, options.homeDirectory),
    process.platform,
  );
  const savedSessions = await startSavedSessions({
    ...shared,
    credentials,
    ...(startupConnection === undefined ? {} : { startupConnection }),
  });
  const highlightSettings = await startHighlightSettings(shared);
  startRemoteFiles({ ...shared, sessionLaunch, savedSessions });
  const assistant = await startAssistant({
    ...shared,
    directory: resolveApplicationDataDirectory(
      process.env,
      options.homeDirectory,
    ),
    shell,
    credentials,
  });
  highlightSettings.subscribe(onMenuStateChange);
  const commandLibrary = await startCommandLibrary(shared);
  startFileBrowser(shared);
  startOutputFiles(shared);
  const about = startAbout(shared);
  startFilePeek(shared);
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

  const preferences = startPreferences({
    ...shared,
    ...configuration,
    reload: async () => {
      await reloadConfiguration();
    },
    extras: {
      get: () => ({
        restoreWindows: workspace.restoreEnabled(),
        highlightOutput: highlightSettings.current().enabled,
      }),
      async setRestoreWindows(enabled) {
        if (workspace.restoreEnabled() !== enabled)
          await workspace.setRestore(enabled);
        onMenuStateChange();
      },
      async setHighlightOutput(enabled) {
        const current = highlightSettings.current();
        if (current.enabled !== enabled)
          await highlightSettings.save({ ...current, enabled });
      },
    },
  });

  const sendToFocused = (channel: string) => {
    const window =
      BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
    if (window && !window.webContents.isDestroyed())
      window.webContents.send(channel);
  };

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
    openHighlightRules: () => sendToFocused(highlightIpc.openEditor),
    openPreferences: preferences.open,
    toggleSelectedFiles: () => sendToFocused(fileBrowserIpc.toggle),
    toggleSelectedAssistant: assistant.toggle,
    showAbout: about.show,
    adjustCornerRadius(delta: number) {
      const current = configuration.active().configuration.cornerRadius;
      const next = Math.max(
        0,
        Math.min(MAX_WINDOW_CORNER_RADIUS, current + delta),
      );
      if (next !== current) void preferences.save({ cornerRadius: next });
    },
    setAutoHideTitleBar(enabled: boolean) {
      void preferences
        .save({ autoHideTitleBar: enabled })
        .finally(onMenuStateChange);
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
    autoHideTitleBar: configuration.active().configuration.autoHideTitleBar,
  });
  return { savedSessions, workspace, preferences, menuActions, menuState };
}
