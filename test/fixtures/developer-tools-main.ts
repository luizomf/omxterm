import { app, BrowserWindow } from "electron";
import { startTerminalApplication } from "../../src/main/terminal-application";

const resultPrefix = "__OMXTERM_DEVELOPER_TOOLS_RESULT__";

async function run() {
  await app.whenReady();
  const windows: BrowserWindow[] = [];
  let selected: BrowserWindow | undefined;
  const application = startTerminalApplication<BrowserWindow>({
    createWindow() {
      const window = new BrowserWindow({ show: false });
      windows.push(window);
      return {
        window,
        sessionActivity: {
          hasBusySelectedSession: () => false,
          hasBusySession: () => false,
        },
        load: async () => {},
      };
    },
    getSelectedWindow: () => selected,
    showQuitConfirmation: async () => true,
    showCloseWindowConfirmation: async () => true,
    showCloseTabConfirmation: async () => true,
    showSessionFailure: async () => {},
    sendFontZoom: () => {},
    sendClipboardAction: () => {},
    sendSnippetsToggle: () => {},
    toggleDeveloperTools: (window) => window.webContents.toggleDevTools(),
    sendTabCommand: () => {},
    quit: () => {},
  });
  await application.newWindow();
  await application.newWindow();
  selected = windows[1]!;

  const opened = new Promise<void>((resolve) =>
    selected!.webContents.once("devtools-opened", resolve),
  );
  application.toggleSelectedDevTools();
  await opened;
  const firstWindowOpened = windows[0]!.webContents.isDevToolsOpened();
  const selectedWindowOpened = selected.webContents.isDevToolsOpened();

  const closed = new Promise<void>((resolve) =>
    selected!.webContents.once("devtools-closed", resolve),
  );
  application.toggleSelectedDevTools();
  await closed;
  const selectedWindowClosed = !selected.webContents.isDevToolsOpened();

  for (const window of windows) window.destroy();
  process.stdout.write(
    resultPrefix +
      JSON.stringify({
        firstWindowOpened,
        selectedWindowOpened,
        selectedWindowClosed,
      }) +
      "\n",
  );
  app.exit(0);
}

void run().catch((error: unknown) => {
  process.stderr.write(
    `${error instanceof Error ? error.stack : String(error)}\n`,
  );
  app.exit(1);
});
