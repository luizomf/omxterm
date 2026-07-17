import { app, BrowserWindow, dialog, ipcMain } from "electron";
import * as nodePty from "node-pty";
import { userInfo } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createLocalTerminalSession } from "./local-terminal-session";
import {
  registerTerminalIpcController,
  type IpcMainPort,
} from "./terminal-ipc-controller";
import { terminalWindowOptions } from "./terminal-window";

const mainDirectory = path.dirname(fileURLToPath(import.meta.url));
const applicationRoot = path.resolve(mainDirectory, "..");

async function createTerminalWindow(): Promise<void> {
  const account = userInfo();
  if (!account.shell)
    throw new Error("The operating system did not provide a Default Shell");
  const defaultShell = account.shell;

  const window = new BrowserWindow(
    terminalWindowOptions(path.join(applicationRoot, "preload", "index.cjs")),
  );

  const controller = registerTerminalIpcController({
    // Electron's public handler type contains `any`; isolate that library boundary here.
    ipcMain: ipcMain as unknown as IpcMainPort,
    webContents: window.webContents,
    createSession(callbacks) {
      return createLocalTerminalSession(nodePty.spawn, {
        shell: defaultShell,
        homeDirectory: account.homedir,
        environment: process.env,
        ...callbacks,
      });
    },
    onSessionStartError(error) {
      void dialog
        .showMessageBox(window, {
          type: "error",
          title: "Shell could not start",
          message: "The Default Shell could not be started.",
          detail:
            error instanceof Error
              ? error.message
              : "Unknown shell startup failure",
        })
        .finally(() => {
          if (!window.isDestroyed()) window.close();
        });
    },
    onSessionExit(exit) {
      if (exit.exitCode === 0 && exit.signal === 0) {
        if (!window.isDestroyed()) window.close();
        return;
      }

      void dialog
        .showMessageBox(window, {
          type: "error",
          title: "Shell exited unexpectedly",
          message: "The Default Shell exited unexpectedly.",
          detail: `Exit code: ${exit.exitCode}; signal: ${exit.signal}`,
        })
        .finally(() => {
          if (!window.isDestroyed()) window.close();
        });
    },
  });

  window.once("ready-to-show", () => window.show());
  window.once("closed", () => {
    controller.dispose();
    if (BrowserWindow.getAllWindows().length === 0) app.quit();
  });

  try {
    await window.loadFile(path.join(applicationRoot, "renderer", "index.html"));
  } catch (error) {
    controller.dispose();
    if (!window.isDestroyed()) window.close();
    throw new Error("Failed to load the Terminal Window renderer", {
      cause: error,
    });
  }
}

app
  .whenReady()
  .then(createTerminalWindow)
  .catch((error: unknown) => {
    void dialog.showErrorBox(
      "OMXTerm could not start",
      error instanceof Error ? error.message : "Unknown startup failure",
    );
    app.quit();
  });
