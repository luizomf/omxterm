import { app, BrowserWindow } from "electron";
import path from "node:path";

export function createResttyHostWindows(
  root: string,
  onWindowOpen: () => void,
  onNavigate: () => void,
  terminals: readonly { close(): void }[],
) {
  // Electron can ignore SIGTERM. Preserve interruption failure and close PTYs;
  // the external supervisor owns bounded fallback and profile cleanup.
  for (const [signal, code] of [
    ["SIGINT", 130],
    ["SIGTERM", 143],
  ] as const) {
    process.once(signal, () => {
      process.send?.({ type: "fixture-interrupted", signal });
      try {
        for (const terminal of terminals) terminal.close();
      } finally {
        app.exit(code);
      }
    });
  }
  const keeper = new BrowserWindow({ show: false });
  const window = new BrowserWindow({
    width: 900,
    height: 600,
    show: false,
    webPreferences: {
      preload: path.join(root, "preload.cjs"),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
      backgroundThrottling: false,
    },
  });
  window.webContents.setWindowOpenHandler(() => {
    onWindowOpen();
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event) => {
    onNavigate();
    event.preventDefault();
  });
  return { keeper, window };
}
