import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  shell,
} from "electron";
import * as nodePty from "node-pty";
import { userInfo } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { terminalIpc } from "../shared/terminal-ipc";
import {
  terminalApplicationMenuTemplate,
  terminalClipboardContextMenuTemplate,
} from "./application-menu";
import { createLocalTerminalSession } from "./local-terminal-session";
import {
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
import {
  lockTerminalRendererNavigation,
  terminalWindowOptions,
} from "./terminal-window";
import { registerTerminalWindowHost } from "./terminal-window-host";
import { createTerminalWindowTitleController } from "./terminal-window-title";
import { discoverInstalledFontFamilies } from "./installed-font-families";
import { UserConfigurationError } from "./user-configuration";
import { reportUserConfigurationFailure } from "./user-configuration-failure";
import { startWithUserConfiguration } from "./configured-startup";
import {
  createOperationalEventLog,
  type OperationalEventLog,
} from "./operational-events";

const mainDirectory = path.dirname(fileURLToPath(import.meta.url));
const applicationRoot = path.resolve(mainDirectory, "..");
const preloadPath = path.join(applicationRoot, "preload", "index.cjs");
const rendererPath = path.join(applicationRoot, "renderer", "index.html");

let terminalApplication: TerminalApplication | undefined;
let operationalEvents: OperationalEventLog | undefined;

app.on("before-quit", (event) => {
  operationalEvents?.flush();
  if (!terminalApplication || terminalApplication.isQuitting()) return;
  event.preventDefault();
  void terminalApplication.requestQuit();
});

app
  .whenReady()
  .then(async () => {
    const account = userInfo();
    operationalEvents = createOperationalEventLog({
      environment: process.env,
      homeDirectory: account.homedir,
    });
    return startWithUserConfiguration(
      {
        environment: process.env,
        homeDirectory: account.homedir,
        discoverInstalledFontFamilies,
      },
      async (userConfiguration) => {
        operationalEvents!.setLevel(userConfiguration.logLevel);
        operationalEvents!.write({ name: "configuration.validated" });
        operationalEvents!.write({ name: "application.started" });
        const rendererConfiguration = Object.freeze({
          ...(userConfiguration.fontFamily
            ? { fontFamily: userConfiguration.fontFamily }
            : {}),
          fontSize: userConfiguration.fontSize,
          scrollbackLines: userConfiguration.scrollbackLines,
          optionKeyMode: userConfiguration.optionKeyMode,
        });
        const terminalIpcRouter = registerTerminalIpcRouter(
          // Electron's public handler type contains `any`; isolate that boundary here.
          ipcMain as unknown as IpcMainPort,
          operationalEvents!,
        );
        terminalApplication = startTerminalApplication<BrowserWindow>({
          confirmClose: userConfiguration.confirmClose,
          alwaysOnTopDefault: userConfiguration.alwaysOnTop,
          createWindow(lifecycle) {
            if (!account.shell)
              throw new Error(
                "The operating system did not provide a Default Shell",
              );
            const defaultShell = account.shell;

            const window = new BrowserWindow(
              terminalWindowOptions(preloadPath),
            );
            lockTerminalRendererNavigation(window.webContents);
            const titleController = createTerminalWindowTitleController(
              window,
              () => app.dock?.bounce("informational"),
              (reason) =>
                operationalEvents!.write({
                  name: "boundary.rejected",
                  boundary: "title",
                  reason,
                }),
            );
            window.once("closed", () => titleController.dispose());
            const controller = terminalIpcRouter.registerController({
              windowId: lifecycle.windowId,
              configuration: rendererConfiguration,
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
              onTitleRequest: titleController.requestTitle,
              onBell: titleController.ringBell,
              onUserInteraction: titleController.resetAttention,
              openExternalLink: (url) => shell.openExternal(url),
              onExternalLinkOpenError: () =>
                dialog.showErrorBox(
                  "External Link Error",
                  "The External Link could not be opened.",
                ),
              writeClipboardText: (text) => clipboard.writeText(text),
              readClipboardText: () => clipboard.readText(),
              async confirmPaste() {
                const result = await dialog.showMessageBox(window, {
                  type: "warning",
                  title: "Protected Paste",
                  message: "Paste text that may contain multiple commands?",
                  detail:
                    "The paste contains multiple lines or control characters.",
                  buttons: ["Paste", "Cancel"],
                  defaultId: 1,
                  cancelId: 1,
                  noLink: true,
                });
                return result.response === 0;
              },
              showClipboardContextMenu() {
                const send = (action: "copy" | "paste" | "select-all") =>
                  window.webContents.send(terminalIpc.clipboardAction, action);
                Menu.buildFromTemplate(
                  terminalClipboardContextMenuTemplate({
                    copy: () => send("copy"),
                    paste: () => send("paste"),
                    selectAll: () => send("select-all"),
                  }),
                ).popup({ window });
              },
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
                  operationalEvents!.write({
                    name: "application.failure",
                    stage: "renderer-load",
                  });
                  throw terminalApplicationFailure("renderer-load", cause);
                }
              },
            };
          },
          getSelectedWindow: () =>
            BrowserWindow.getFocusedWindow() ?? undefined,
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
          sendFontZoom: (window, command) =>
            window.webContents.send(terminalIpc.fontZoom, command),
          sendClipboardAction: (window, action) =>
            window.webContents.send(terminalIpc.clipboardAction, action),
          quit: () => app.quit(),
          operationalEvents: operationalEvents!,
        });

        const openNewWindow = () => {
          void terminalApplication!.newWindow().catch((cause) => {
            const failure = terminalApplicationFailure("new-window", cause);
            operationalEvents!.write({
              name: "application.failure",
              stage: failure.stage,
            });
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
              zoomInSelectedWindow: () =>
                terminalApplication!.zoomSelectedWindow("in"),
              zoomOutSelectedWindow: () =>
                terminalApplication!.zoomSelectedWindow("out"),
              resetSelectedWindowZoom: () =>
                terminalApplication!.zoomSelectedWindow("reset"),
              copySelectedTerminal: () =>
                terminalApplication!.clipboardSelectedWindow("copy"),
              pasteSelectedTerminal: () =>
                terminalApplication!.clipboardSelectedWindow("paste"),
              selectAllSelectedTerminal: () =>
                terminalApplication!.clipboardSelectedWindow("select-all"),
            }),
          ),
        );

        await terminalApplication.newWindow();
      },
    );
  })
  .catch((cause) => {
    if (cause instanceof UserConfigurationError) {
      operationalEvents?.write({
        name: "configuration.rejected",
        reason: configurationRejectionReason(cause),
      });
      reportUserConfigurationFailure(cause, {
        writeStderr: (diagnostic) => process.stderr.write(diagnostic),
        showErrorBox: (title, message) => dialog.showErrorBox(title, message),
        quit: () => app.quit(),
      });
      return;
    }
    const failure = terminalApplicationFailure("startup", cause);
    operationalEvents?.write({
      name: "application.failure",
      stage: failure.stage,
    });
    const display = terminalApplicationFailureDisplay(failure);
    dialog.showErrorBox(display.title, display.message);
    app.quit();
  });

function configurationRejectionReason(
  failure: UserConfigurationError,
):
  | "read-failed"
  | "invalid-utf8"
  | "invalid-json"
  | "invalid-schema"
  | "font-discovery-failed" {
  if (failure.reason === "the file could not be read") return "read-failed";
  if (failure.reason === "the file is not valid UTF-8") return "invalid-utf8";
  if (failure.reason === "the file is not valid JSON") return "invalid-json";
  if (failure.reason === "installed font families could not be discovered")
    return "font-discovery-failed";
  return "invalid-schema";
}
