import { BrowserWindow } from "electron";
import path from "node:path";

export function createResttyHostWindows(
  root: string,
  onWindowOpen: () => void,
  onNavigate: () => void,
) {
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
