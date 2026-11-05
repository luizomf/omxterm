import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { translatorFor } from "../shared/i18n";
import { createSettingsService } from "./settings-service";
import { startSettings } from "./settings-wiring";
import type {
  TerminalIpcRouter,
  TrustedWebContents,
} from "./terminal-ipc-types";
import type { KeybindCapture } from "./keybind-capture";
import type { LoadUserConfigurationOptions } from "./user-configuration";
import type { UserConfigurationReloader } from "./user-configuration-reloader";

export function startApplicationSettings(
  router: TerminalIpcRouter,
  loadOptions: LoadUserConfigurationOptions,
  reloader: UserConfigurationReloader,
  capture: Pick<KeybindCapture, "set">,
  sendAction?: (
    sender: TrustedWebContents,
    channel: string,
    payload?: unknown,
  ) => void,
) {
  const settings = startSettings({
    ipcMain,
    ...(sendAction ? { sendAction } : {}),
    isTrustedSender: router.isTrustedSender,
    service: createSettingsService({
      loadOptions,
      reload: () => reloader.reload(),
    }),
    selectedContents: () => BrowserWindow.getFocusedWindow()?.webContents,
    capture,
    themeDialogs: {
      async chooseImport(owner) {
        const window = BrowserWindow.getAllWindows().find(
          (window) => window.webContents === owner,
        );
        if (!window || owner.isDestroyed()) return null;
        const { t } = translatorFor(reloader.current().configuration.language);
        const result = await dialog.showOpenDialog(window, {
          title: t("settings.author.import"),
          properties: ["openFile", "dontAddToRecent"],
          filters: [
            { name: t("settings.author.jsonFilter"), extensions: ["json"] },
          ],
        });
        return result.canceled ||
          window.isDestroyed() ||
          result.filePaths.length !== 1
          ? null
          : result.filePaths[0]!;
      },
      async chooseExport(owner) {
        const window = BrowserWindow.getAllWindows().find(
          (window) => window.webContents === owner,
        );
        if (!window || owner.isDestroyed()) return null;
        const { t } = translatorFor(reloader.current().configuration.language);
        const result = await dialog.showSaveDialog(window, {
          title: t("settings.author.exportTitle"),
          buttonLabel: t("settings.author.exportNew"),
          message: t("settings.author.exportHint"),
          defaultPath: "theme.json",
          properties: ["dontAddToRecent"],
          filters: [
            { name: t("settings.author.jsonFilter"), extensions: ["json"] },
          ],
        });
        return result.canceled || window.isDestroyed()
          ? null
          : (result.filePath ?? null);
      },
    },
  });
  app.once("will-quit", settings.dispose);
  return settings.show;
}
