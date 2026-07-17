import { app, BrowserWindow, dialog, ipcMain, Menu } from "electron";
import * as nodePty from "node-pty";
import { userInfo } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { terminalApplicationMenuTemplate } from "./application-menu";
import { createLocalTerminalSession } from "./local-terminal-session";
import {
  DEFAULT_ALWAYS_ON_TOP,
  DEFAULT_CONFIRM_CLOSE,
  startTerminalApplication,
  type TerminalApplication,
} from "./terminal-application";
import {
  terminalApplicationFailure,
  terminalApplicationFailureDisplay,
} from "./terminal-application-failure";
import {
  registerTerminalIpcRouter,
  type IpcMainPort,
} from "./terminal-ipc-controller";
import { terminalSessionFailureDialog } from "./terminal-session-failure";
import { terminalWindowOptions } from "./terminal-window";
import { registerTerminalWindowHost } from "./terminal-window-host";

const mainDirectory = path.dirname(fileURLToPath(import.meta.url));
const applicationRoot = path.resolve(mainDirectory, "..");
const preloadPath = path.join(applicationRoot, "preload", "index.cjs");
const rendererPath = path.join(applicationRoot, "renderer", "index.html");

let terminalApplication: TerminalApplication | undefined;

app.on("before-quit", (event) => {
  if (!terminalApplication || terminalApplication.isQuitting()) return;
  event.preventDefault();
  void terminalApplication.requestQuit();
});

app
  .whenReady()
  .then(async () => {
    const terminalIpcRouter = registerTerminalIpcRouter(
      // Electron's public handler type contains `any`; isolate that boundary here.
      ipcMain as unknown as IpcMainPort,
    );
    terminalApplication = startTerminalApplication<BrowserWindow>({
      confirmClose: DEFAULT_CONFIRM_CLOSE,
      alwaysOnTopDefault: DEFAULT_ALWAYS_ON_TOP,
      createWindow(lifecycle) {
        const account = userInfo();
        if (!account.shell)
          throw new Error(
            "The operating system did not provide a Default Shell",
          );
        const defaultShell = account.shell;

        const window = new BrowserWindow(terminalWindowOptions(preloadPath));
        const controller = terminalIpcRouter.registerController({
          webContents: window.webContents,
          createSession(callbacks) {
            return createLocalTerminalSession(nodePty.spawn, {
              shell: defaultShell,
              homeDirectory: account.homedir,
              applicationVersion: app.getVersion(),
              environment: process.env,
              ...callbacks,
            });
          },
          onSessionStartError: lifecycle.onSessionStartError,
          onSessionExit: lifecycle.onSessionExit,
        });

        window.once("ready-to-show", () => window.show());
        const windowHost = registerTerminalWindowHost(
          window,
          controller,
          lifecycle.onWindowClosed,
        );

        return {
          window,
          async load() {
            try {
              await window.loadFile(rendererPath);
            } catch (cause) {
              windowHost.dispose();
              if (!window.isDestroyed()) window.close();
              throw terminalApplicationFailure("renderer-load", cause);
            }
          },
        };
      },
      getSelectedWindow: () => BrowserWindow.getFocusedWindow() ?? undefined,
      async showQuitConfirmation(window) {
        const options = {
          type: "question" as const,
          title: "Quit OMXTerm",
          message: "Quit OMXTerm and close all Terminal Windows?",
          detail: "All open Live Terminal Sessions will end.",
          buttons: ["Quit", "Cancel"],
          defaultId: 1,
          cancelId: 1,
          noLink: true,
        };
        const result =
          window && !window.isDestroyed()
            ? await dialog.showMessageBox(window, options)
            : await dialog.showMessageBox(options);
        return result.response === 0;
      },
      async showSessionFailure(window, failure) {
        const failureDialog = terminalSessionFailureDialog(failure);
        await dialog.showMessageBox(window, {
          ...failureDialog,
          buttons: [...failureDialog.buttons],
          noLink: true,
        });
      },
      quit: () => app.quit(),
    });

    const openNewWindow = () => {
      void terminalApplication!.newWindow().catch((cause) => {
        const failure = terminalApplicationFailure("new-window", cause);
        const display = terminalApplicationFailureDisplay(failure);
        dialog.showErrorBox(display.title, display.message);
      });
    };
    Menu.setApplicationMenu(
      Menu.buildFromTemplate(
        terminalApplicationMenuTemplate(app.name, {
          newWindow: openNewWindow,
          closeSelectedWindow: terminalApplication.closeSelectedWindow,
          requestQuit: () => void terminalApplication!.requestQuit(),
          toggleSelectedFullScreen:
            terminalApplication.toggleSelectedFullScreen,
          toggleSelectedAlwaysOnTop:
            terminalApplication.toggleSelectedAlwaysOnTop,
        }),
      ),
    );

    await terminalApplication.newWindow();
  })
  .catch((cause) => {
    const failure = terminalApplicationFailure("startup", cause);
    const display = terminalApplicationFailureDisplay(failure);
    dialog.showErrorBox(display.title, display.message);
    app.quit();
  });
