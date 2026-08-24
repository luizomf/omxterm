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
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { userInfo } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { terminalIpc } from "../shared/terminal-ipc";
import {
  terminalActionInvocations,
  terminalApplicationMenuTemplate,
  terminalClipboardContextMenuTemplate,
} from "./application-menu";
import { deliverKeybindsFromKeyEvents } from "./keybind-delivery";
import { resolveDefaultShell } from "./default-shell";
import {
  MalformedLaunchRequestError,
  startupLaunchRequest,
  withSwitchBeforeLaunchRequest,
} from "./launch-request";
import { createLocalTerminalSession } from "./local-terminal-session";
import { planLinuxDisplayBackendDefault } from "./linux-display-backend";
import {
  isFilePathPlatform,
  readClipboardPathInsertion,
} from "../shared/file-path-insertion";
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
  terminalNativeTitleInset,
  terminalWindowOptions,
} from "./terminal-window";
import { registerTerminalWindowHost } from "./terminal-window-host";
import { createTerminalWindowTitleController } from "./terminal-window-title";
import { installedFontFamilyMetrics } from "./installed-font-family";
import { loadTerminalSnippets } from "./snippets";
import {
  configurationRejectionReason,
  loadUserConfiguration,
  userConfigurationFallbackNotice,
  type UserConfigurationFallback,
} from "./user-configuration";
import { createUserConfigurationReloader } from "./user-configuration-reloader";
import {
  applyActiveUserConfiguration,
  terminalRendererConfiguration,
} from "./active-user-configuration";
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
const packagedApplicationIconPath = path.join(
  process.resourcesPath,
  "application-icon.png",
);
// Linux windows must carry their own icon: a directly-run AppImage has no
// registered desktop entry for the environment to resolve one from.
const linuxWindowIconPath =
  process.platform === "linux"
    ? existsSync(packagedApplicationIconPath)
      ? packagedApplicationIconPath
      : developmentApplicationIconPath
    : undefined;

let terminalApplication: TerminalApplication<BrowserWindow> | undefined;
let operationalEvents: OperationalEventLog | undefined;

const displayBackendAction = planLinuxDisplayBackendDefault(
  app.commandLine.getSwitchValue("ozone-platform"),
);
if (displayBackendAction === "append-x11") {
  app.commandLine.appendSwitch("ozone-platform", "x11");
} else if (displayBackendAction === "relaunch-x11") {
  // app.relaunch cannot escape an AppImage: Chromium's relauncher helper
  // runs from the FUSE mount, which unmounts when this process exits, so
  // the helper dies before starting the target. Spawn the persistent outer
  // AppImage (or the on-disk executable) directly, then exit.
  try {
    spawn(
      process.env["APPIMAGE"] ?? process.execPath,
      withSwitchBeforeLaunchRequest(
        process.argv.slice(1),
        "--ozone-platform=x11",
      ),
      { detached: true, stdio: "ignore" },
    ).unref();
    app.exit(0);
  } catch {
    // Keep running on the seeded backend rather than exiting into nothing.
  }
}

app.on("before-quit", (event) => {
  operationalEvents?.flush();
  if (!terminalApplication || terminalApplication.isQuitting()) return;
  event.preventDefault();
  void terminalApplication.requestQuit();
});

app
  .whenReady()
  .then(async () => {
    const { account, consumeLaunchRequest } = prepareStartup();
    operationalEvents = createOperationalEventLog({
      environment: process.env,
      homeDirectory: account.homedir,
    });
    const configurationLoadOptions = {
      environment: process.env,
      homeDirectory: account.homedir,
      platform: process.platform,
      getInstalledFontFamilyMetrics: installedFontFamilyMetrics,
    };
    return startWithUserConfiguration(
      configurationLoadOptions,
      async ({ configuration: userConfiguration, fallback, warnings }) => {
        operationalEvents!.setLevel(userConfiguration.logLevel);
        if (fallback) {
          operationalEvents!.write({
            name: "configuration.rejected",
            reason: configurationRejectionReason(
              fallback.error,
              fallback.surface,
            ),
          });
          process.stderr.write(
            `${userConfigurationFallbackNotice(fallback)}\n`,
          );
        } else {
          operationalEvents!.write({ name: "configuration.validated" });
        }
        for (const warning of warnings ?? [])
          process.stderr.write(`${warning}\n`);
        operationalEvents!.write({ name: "application.started" });
        const startupNotices = startupUserFileNotices(fallback, warnings);
        const terminalIpcRouter = registerTerminalIpcRouter(
          ipcMain as unknown as IpcMainPort,
          operationalEvents!,
        );
        let rebuildMenu = () => {};
        const configurationReloader = createUserConfigurationReloader({
          initial: {
            configuration: userConfiguration,
            userFileErrors: startupNotices,
          },
          load: () => loadUserConfiguration(configurationLoadOptions),
          operationalEvents: operationalEvents!,
          writeStderr: (detail) => process.stderr.write(detail),
          apply: (state, committed) =>
            applyActiveUserConfiguration(
              state,
              committed,
              terminalIpcRouter,
              BrowserWindow.getAllWindows(),
              terminalApplication,
              {
                rebuildMenu,
                nativeTitleInset: terminalNativeTitleInset(process.platform),
                platform: process.platform,
              },
            ),
        });
        const rendererConfiguration = () =>
          terminalRendererConfiguration(
            configurationReloader.current(),
            terminalNativeTitleInset(process.platform),
          );
        terminalApplication = startTerminalApplication<BrowserWindow>({
          confirmClose: userConfiguration.confirmClose,
          alwaysOnTopDefault: userConfiguration.alwaysOnTop,
          createWindow(lifecycle) {
            const consumeLaunch = consumeLaunchRequest(lifecycle.windowId);
            const defaultShell = resolveDefaultShell(
              process.platform,
              account.shell,
              process.env,
            );

            const active = configurationReloader.current();
            const window = new BrowserWindow(
              terminalWindowOptions(
                preloadPath,
                active.configuration,
                process.platform,
                linuxWindowIconPath,
              ),
            );
            const defaultShellName = path.basename(defaultShell);
            lockTerminalRendererNavigation(window.webContents);
            deliverKeybindsFromKeyEvents(
              window.webContents,
              () => configurationReloader.current().configuration.keybinds,
              (action) => keybindActionInvocations[action](),
              process.platform,
            );
            // A lost renderer has no session worth guarding.
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
              configuration: rendererConfiguration(),
              webContents: window.webContents,
              createSession(callbacks) {
                return createLocalTerminalSession(nodePty.spawn, {
                  shell: defaultShell,
                  launchRequest: consumeLaunch(),
                  platform: process.platform,
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
              readClipboardText: () => {
                if (!isFilePathPlatform(process.platform))
                  return clipboard.readText();
                return readClipboardPathInsertion(
                  {
                    availableFormats: () => clipboard.availableFormats(),
                    readText: () => clipboard.readText(),
                    readBuffer: (format) => clipboard.readBuffer(format),
                  },
                  process.platform,
                );
              },
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
          reloadUserConfiguration: () => void configurationReloader.reload(),
        };
        const keybindActionInvocations = terminalActionInvocations(menuActions);
        rebuildMenu = () => {
          Menu.setApplicationMenu(
            Menu.buildFromTemplate(
              terminalApplicationMenuTemplate(
                app.name,
                menuActions,
                configurationReloader.current().configuration.keybinds,
              ),
            ),
          );
        };
        rebuildMenu();

        await terminalApplication.newWindow();
      },
    );
  })
  .catch((cause) => {
    const stage =
      cause instanceof MalformedLaunchRequestError
        ? "launch-request"
        : "startup";
    const failure = terminalApplicationFailure(stage, cause);
    operationalEvents?.write({
      name: "application.failure",
      stage: failure.stage,
    });
    const display = terminalApplicationFailureDisplay(failure);
    dialog.showErrorBox(display.title, display.message);
    app.quit();
  });

function prepareStartup() {
  const launch = startupLaunchRequest(process.argv, app.isPackaged);
  if (!app.isPackaged) app.dock?.setIcon(developmentApplicationIconPath);
  return { account: userInfo(), consumeLaunchRequest: launch };
}

function startupUserFileNotices(
  fallback: UserConfigurationFallback | undefined,
  warnings: readonly string[] | undefined,
): readonly string[] {
  return Object.freeze([
    ...(fallback ? [userConfigurationFallbackNotice(fallback)] : []),
    ...(warnings ?? []),
  ]);
}
