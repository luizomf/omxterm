import { app, BrowserWindow, shell, type App } from "electron";
import { startAbout } from "./about-wiring";
import { ipcMain } from "electron";
import type { TerminalIpcRouter } from "./terminal-ipc-types";

export function startApplicationAbout(router: TerminalIpcRouter) {
  const about = startAbout({
    ipcMain,
    isTrustedSender: router.isTrustedSender,
    getVersion: () => app.getVersion(),
    openExternal: (url) => shell.openExternal(url),
    selectedContents: () => BrowserWindow.getFocusedWindow()?.webContents,
  });
  app.once("will-quit", about.dispose);
  return about.show;
}

export function configureApplicationAbout(
  app: Pick<App, "getVersion" | "setAboutPanelOptions">,
  iconPath: string,
  platform: string = process.platform,
): void {
  if (platform !== "linux" && platform !== "win32") return;
  // Linux has no metadata defaults; Windows otherwise uses executable-resource
  // version text and a generic information icon. Keep macOS bundle defaults.
  app.setAboutPanelOptions({
    applicationName: "OMXTerm",
    applicationVersion: app.getVersion(),
    copyright: "Copyright © 2026 Luiz Otávio Miranda",
    iconPath,
  });
}
