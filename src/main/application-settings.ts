import { app, BrowserWindow, ipcMain } from "electron";
import { createSettingsService } from "./settings-service";
import { startSettings } from "./settings-wiring";
import type { TerminalIpcRouter } from "./terminal-ipc-types";
import type { LoadUserConfigurationOptions } from "./user-configuration";
import type { UserConfigurationReloader } from "./user-configuration-reloader";

export function startApplicationSettings(
  router: TerminalIpcRouter,
  loadOptions: LoadUserConfigurationOptions,
  reloader: UserConfigurationReloader,
) {
  const settings = startSettings({
    ipcMain,
    isTrustedSender: router.isTrustedSender,
    service: createSettingsService({
      loadOptions,
      reload: () => reloader.reload(),
    }),
    selectedContents: () => BrowserWindow.getFocusedWindow()?.webContents,
  });
  app.once("will-quit", settings.dispose);
  return settings.show;
}
