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
