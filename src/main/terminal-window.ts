import type { BrowserWindowConstructorOptions } from "electron";

export function terminalWindowOptions(
  preloadPath: string,
): BrowserWindowConstructorOptions {
  return {
    width: 960,
    height: 640,
    minWidth: 320,
    minHeight: 200,
    show: false,
    title: "OMXTerm",
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: preloadPath,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  };
}

export interface LockedTerminalWebContents {
  setWindowOpenHandler(handler: () => { action: "deny" }): void;
  on(
    event: "will-navigate",
    listener: (event: { preventDefault(): void }) => void,
  ): void;
}

export function lockTerminalRendererNavigation(
  webContents: LockedTerminalWebContents,
): void {
  webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  webContents.on("will-navigate", (event) => event.preventDefault());
}
