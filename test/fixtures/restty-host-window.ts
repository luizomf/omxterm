import { app, BrowserWindow } from "electron";
import path from "node:path";

export async function initializeResttyHostWindow(
  window: BrowserWindow,
  root: string,
  sessionReady: () => boolean,
  waitFor: (
    predicate: () => boolean | Promise<boolean>,
    label: string,
  ) => Promise<void>,
) {
  await window.loadFile(path.join(root, "renderer", "index.html"));
  window.showInactive();
  await waitFor(sessionReady, "default Restty session");
  // This host scenario asserts active-window DOM focus. Native activation lets
  // the production page-focus owner restore it without forcing a DOM target.
  // Activate the owned macOS app only at initial readiness, not during blur tests.
  if (process.platform === "darwin" && !app.isActive()) {
    app.focus({ steal: true });
  }
  window.focus();
  await waitFor(() => window.isFocused(), "native host window activation");
  await waitFor(
    () =>
      window.webContents.executeJavaScript(
        "document.activeElement?.closest('.restty-terminal-surface') !== null",
        true,
      ),
    "initial terminal focus",
  );
}

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
