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
  terminalActionInvocations,
  terminalApplicationMenuTemplate,
  terminalClipboardContextMenuTemplate,
} from "./application-menu";
import { deliverUnhandledKeybinds } from "./keybind-delivery";
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
import { installedFontFamilyMetrics } from "./installed-font-family";
import { loadTerminalSnippets } from "./snippets";
import {
  userConfigurationFallbackNotice,
  type UserConfigurationError,
} from "./user-configuration";
import { startWithUserConfiguration } from "./configured-startup";
import {
  createOperationalEventLog,
  type OperationalEventLog,
} from "./operational-events";

const mainDirectory = path.dirname(fileURLToPath(import.meta.url));
const applicationRoot = path.resolve(mainDirectory, "..");
const preloadPath = path.join(applicationRoot, "preload", "index.cjs");
const rendererPath = path.join(applicationRoot, "renderer", "index.html");
const developmentApplicationIconPath = path.resolve(
  applicationRoot,
  "..",
  "assets",
  "application-icon.png",
);

let terminalApplication: TerminalApplication<BrowserWindow> | undefined;
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
    if (!app.isPackaged) app.dock?.setIcon(developmentApplicationIconPath);

    const account = userInfo();
    operationalEvents = createOperationalEventLog({
      environment: process.env,
      homeDirectory: account.homedir,
    });
    return startWithUserConfiguration(
      {
        environment: process.env,
        homeDirectory: account.homedir,
        getInstalledFontFamilyMetrics: installedFontFamilyMetrics,
      },
      async ({ configuration: userConfiguration, fallback }) => {
        operationalEvents!.setLevel(userConfiguration.logLevel);
        if (fallback) {
          operationalEvents!.write({
            name: "configuration.rejected",
            reason: configurationRejectionReason(fallback.error),
          });
          process.stderr.write(
            `${userConfigurationFallbackNotice(fallback)}\n`,
          );
        } else {
          operationalEvents!.write({ name: "configuration.validated" });
        }
        operationalEvents!.write({ name: "application.started" });
        const rendererConfiguration = Object.freeze({
          ...(userConfiguration.fontFamily
            ? { fontFamily: userConfiguration.fontFamily }
            : {}),
          fontSize: userConfiguration.fontSize,
          fontLineHeight: userConfiguration.fontLineHeight,
          terminalPadding: userConfiguration.terminalPadding,
          scrollbackLines: userConfiguration.scrollbackLines,
          optionKeyMode: userConfiguration.optionKeyMode,
          terminalTheme: userConfiguration.terminalTheme,
          userFileErrors: Object.freeze(
            fallback ? [userConfigurationFallbackNotice(fallback)] : [],
          ),
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
              terminalWindowOptions(preloadPath, userConfiguration),
            );
            const defaultShellName = path.basename(defaultShell);
            lockTerminalRendererNavigation(window.webContents);
            // Delivery path for keybinds whose registered menu accelerator the
            // platform refuses to fire, e.g. Control+Tab on macOS (#82).
            deliverUnhandledKeybinds(
              window.webContents,
              userConfiguration.keybinds,
              (action) => keybindActionInvocations[action](),
            );
            // Closing a window is guarded by confirmClose regardless of its
            // trigger (menu, keybind, or native close button). A window whose
            // renderer is gone closes without asking: there is no session
            // worth guarding and no usable window to confirm against.
            let rendererLost = false;
            window.webContents.once("render-process-gone", () => {
              rendererLost = true;
            });
            window.webContents.once("destroyed", () => {
              rendererLost = true;
            });
            window.on("close", (event) => {
              if (rendererLost || terminalApplication!.mayCloseWindow(window))
                return;
              event.preventDefault();
              void terminalApplication!.requestWindowClose(window);
            });
            const titleController = createTerminalWindowTitleController(
              window,
              {
                fallbackSessionTitle: defaultShellName,
                requestDockAttention: () =>
                  void app.dock?.bounce("informational"),
                sendSessionTitle: (sessionId, title) => {
                  if (!window.webContents.isDestroyed())
                    window.webContents.send(terminalIpc.tabTitle, {
                      sessionId,
                      title,
                    });
                },
                onRejected: (reason) =>
                  operationalEvents!.write({
                    name: "boundary.rejected",
                    boundary: "title",
                    reason,
                  }),
              },
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
                  applicationVersionProvider: app,
                  environment: process.env,
                  ...callbacks,
                });
              },
              onSessionStartError: lifecycle.onSessionStartError,
              onSessionExit: (exit, context) => {
                titleController.sessionEnded(context.sessionId);
                lifecycle.onSessionExit(exit, context);
              },
              onSessionStarted: titleController.sessionStarted,
              onSessionSelected: titleController.selectSession,
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
              loadSnippets: () =>
                loadTerminalSnippets({
                  environment: process.env,
                  homeDirectory: account.homedir,
                }),
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
              sessionActivity: controller,
              async load() {
                try {
                  await window.loadFile(rendererPath);
                } catch (cause) {
                  windowHost.dispose();
                  terminalApplication!.forceCloseWindow(window);
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
          async showCloseWindowConfirmation(window) {
            const result = await dialog.showMessageBox(window, {
              type: "question",
              title: "Close Window",
              message: "Close this Terminal Window and all of its tabs?",
              detail: "All of its Live Terminal Sessions will end.",
              buttons: ["Close", "Cancel"],
              defaultId: 1,
              cancelId: 1,
              noLink: true,
            });
            return result.response === 0;
          },
          async showCloseTabConfirmation(window) {
            const result = await dialog.showMessageBox(window, {
              type: "question",
              title: "Close Tab",
              message: "Close this Terminal Tab?",
              detail: "Its Live Terminal Session will end.",
              buttons: ["Close", "Cancel"],
              defaultId: 1,
              cancelId: 1,
              noLink: true,
            });
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
          sendSnippetsToggle: (window) =>
            window.webContents.send(terminalIpc.snippetsToggle),
          sendTabCommand: (window, command) =>
            window.webContents.send(terminalIpc.tabCommand, command),
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
        const menuActions = {
          newWindow: openNewWindow,
          closeSelectedWindow: () =>
            void terminalApplication!.closeSelectedWindow(),
          newTabInSelectedWindow: () =>
            terminalApplication!.newTabInSelectedWindow(),
          closeSelectedTab: () => void terminalApplication!.closeSelectedTab(),
          selectNextTab: () => terminalApplication!.selectNextTab(),
          selectPreviousTab: () => terminalApplication!.selectPreviousTab(),
          selectTabInSelectedWindow: (position: number) =>
            terminalApplication!.selectTabInSelectedWindow(position),
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
          toggleSelectedSnippets: terminalApplication.toggleSelectedSnippets,
        };
        const keybindActionInvocations = terminalActionInvocations(menuActions);
        Menu.setApplicationMenu(
          Menu.buildFromTemplate(
            terminalApplicationMenuTemplate(
              app.name,
              menuActions,
              userConfiguration.keybinds,
            ),
          ),
        );

        await terminalApplication.newWindow();
      },
    );
  })
  .catch((cause) => {
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
