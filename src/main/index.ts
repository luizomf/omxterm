import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  screen,
  shell,
} from "electron";
import * as nodePty from "node-pty";
import { existsSync } from "node:fs";
import { userInfo } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { terminalIpc } from "../shared/terminal-ipc";
import {
  terminalActionInvocations,
  terminalApplicationMenuTemplate,
} from "./application-menu";
import {
  electronTerminalExportHost,
  popupTerminalContextMenu,
  saveTerminalExport,
} from "./terminal-export";
import * as applicationAbout from "./application-about";
import { deliverKeybindsFromKeyEvents } from "./keybind-delivery";
import { createDefaultShellResolver, defaultShellName } from "./default-shell";
import {
  MalformedLaunchRequestError,
  startupLaunchRequest,
} from "./launch-request";
import { registerTerminalShutdown } from "./terminal-shutdown";
import { applyLinuxDisplayBackendDefault } from "./linux-display-backend";
import { applyChromiumSandboxPolicy } from "./chromium-sandbox-policy";
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
import { terminalSessionFailureDialog } from "./terminal-session-failure";
import {
  lockTerminalRendererNavigation,
  terminalNativeTitleInset,
  terminalWindowOptions,
} from "./terminal-window";
import {
  guardTerminalWindowClose,
  registerTerminalWindowHost,
} from "./terminal-window-host";
import { registerWindowChrome } from "./window-chrome";
import * as nativeMenu from "./native-application-menu";
import { createNativeTerminalWindowTitleController } from "./terminal-window-attention";
import { installedFontFamilyMetrics } from "./installed-font-family";
import { fontIpcRouter } from "./terminal-font-data";
import { loadTerminalSnippets } from "./snippets";
import {
  configurationRejectionReason,
  loadUserConfiguration,
  userConfigurationFallbackNotice,
  startupUserFileNotices,
} from "./user-configuration";
import {
  createUserConfigurationReloader,
  terminalSurfaceFontBaseline,
} from "./user-configuration-reloader";
import { createWindowBackgroundEffectsOwner } from "./window-background-effects";
import {
  applyActiveUserConfiguration,
  terminalRendererConfiguration,
} from "./active-user-configuration";
import { startWithUserConfiguration } from "./configured-startup";
import { loadLocalImageForWindow } from "./local-image-loader";
import {
  createOperationalEventLog,
  type OperationalEventLog,
} from "./operational-events";

const showClipboardError = () =>
  dialog.showErrorBox("Clipboard Error", "Clipboard operation failed.");
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

const notifyWindow = (channel: string) => (window: BrowserWindow) =>
  window.webContents.send(channel);

let terminalApplication: TerminalApplication<BrowserWindow> | undefined;
let operationalEvents: OperationalEventLog | undefined;
let disposeTerminalSessions = () => {};
const shutdown = registerTerminalShutdown(app, {
  application: () => terminalApplication,
  disposeSessions: () => disposeTerminalSessions(),
});

applyChromiumSandboxPolicy(app.commandLine);

applyLinuxDisplayBackendDefault(app);

app.on("before-quit", () => operationalEvents?.flush());

app
  .whenReady()
  .then(async () => {
    const { account, consumeLaunchRequest, configurationLoadOptions } =
      prepareStartup();
    operationalEvents = createOperationalEventLog({
      environment: process.env,
      homeDirectory: account.homedir,
    });
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
        warnings?.forEach((warning) => process.stderr.write(`${warning}\n`));
        operationalEvents!.write({ name: "application.started" });
        const terminalIpcRouter = fontIpcRouter(ipcMain, operationalEvents!);
        disposeTerminalSessions = () => terminalIpcRouter.dispose();
        let rebuildMenu = () => {};
        const nativeTitleInset = terminalNativeTitleInset(process.platform);
        const backgroundEffects = createWindowBackgroundEffectsOwner(
          process.platform,
          app.commandLine.getSwitchValue("ozone-platform"),
        );
        const configurationReloader = createUserConfigurationReloader({
          initial: {
            configuration: userConfiguration,
            userFileErrors: startupUserFileNotices(fallback, warnings),
          },
          load: () => loadUserConfiguration(configurationLoadOptions),
          ...terminalSurfaceFontBaseline(userConfiguration),
          activeTerminalSurfaceFontConfigurations: () =>
            terminalIpcRouter.activeTerminalSurfaceFontConfigurations(),
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
                nativeTitleInset,
                platform: process.platform,
                applyBackgroundEffects: backgroundEffects.apply,
              },
            ),
        });
        const resolveCurrentDefaultShell = createDefaultShellResolver(
          account.shell,
          () => configurationReloader.current().configuration.windowsShell,
        );
        terminalApplication = startTerminalApplication<BrowserWindow>({
          confirmClose: userConfiguration.confirmClose,
          alwaysOnTopDefault: userConfiguration.alwaysOnTop,
          createWindow(lifecycle) {
            const consumeLaunch = consumeLaunchRequest(lifecycle.windowId);
            const active = configurationReloader.current();
            const initialShell = resolveCurrentDefaultShell();
            const window = new BrowserWindow(
              terminalWindowOptions(
                preloadPath,
                active.configuration,
                process.platform,
                linuxWindowIconPath,
              ),
            );
            const shellName = defaultShellName(process.platform, initialShell);
            lockTerminalRendererNavigation(window.webContents);
            deliverKeybindsFromKeyEvents(
              window.webContents,
              () => configurationReloader.current().configuration.keybinds,
              (action) => keybindActionInvocations[action](),
              process.platform,
            );
            guardTerminalWindowClose(window, terminalApplication!);
            const chrome = registerWindowChrome(window, ipcMain, {
              platform: process.platform,
              showTitleBar: active.configuration.showTitleBar,
              cursor: () => screen.getCursorScreenPoint(),
              popupApplicationMenu: nativeMenu.applicationMenuForWindow(window),
            });
            const titleController = createNativeTerminalWindowTitleController(
              window,
              {
                fallbackSessionTitle: shellName,
                onWindowTitle: chrome.setTitle,
                sendSessionTitle: (sessionId, title) =>
                  !window.webContents.isDestroyed() &&
                  window.webContents.send(terminalIpc.tabTitle, {
                    sessionId,
                    title,
                  }),
                onRejected: (reason) =>
                  operationalEvents!.write({
                    name: "boundary.rejected",
                    boundary: "title",
                    reason,
                  }),
              },
              app.dock,
            );
            window.once("closed", () => titleController.dispose());
            const controller = terminalIpcRouter.registerController({
              windowId: lifecycle.windowId,
              configuration: terminalRendererConfiguration(
                active,
                nativeTitleInset,
              ),
              initialFullScreen: window.isFullScreen(),
              backgroundTransparency: backgroundEffects.register(
                window,
                active.configuration,
              ),
              webContents: window.webContents,
              createSession(callbacks) {
                return shutdown.createSession(nodePty.spawn, {
                  shell: resolveCurrentDefaultShell(),
                  launchRequest: consumeLaunch(),
                  platform: process.platform,
                  homeDirectory: account.homedir,
                  applicationVersionProvider: app,
                  environment: process.env,
                  ...callbacks,
                });
              },
              onSessionStartError: lifecycle.onSessionStartError,
              onTabsEmpty: lifecycle.onTabsEmpty,
              onSessionExit: (exit, context) => {
                titleController.sessionEnded(context.sessionId);
                lifecycle.onSessionExit(exit, context);
              },
              onSessionStarted: titleController.sessionStarted,
              onSessionSelected: titleController.selectSession,
              onSessionTitleSync: titleController.syncSessionTitle,
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
              readClipboardText: () =>
                isFilePathPlatform(process.platform)
                  ? readClipboardPathInsertion(clipboard, process.platform)
                  : clipboard.readText(),
              onClipboardError: showClipboardError,
              loadSnippets: () =>
                loadTerminalSnippets({
                  environment: process.env,
                  homeDirectory: account.homedir,
                }),
              loadLocalImage: (request, abortSignal) =>
                loadLocalImageForWindow(window, request, abortSignal),
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
              showClipboardContextMenu: (request) =>
                popupTerminalContextMenu(window, request),
              saveTerminalExport: async (request) => {
                await saveTerminalExport(
                  request,
                  electronTerminalExportHost(window),
                );
              },
            });

            window.once("ready-to-show", () => backgroundEffects.show(window));
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
          sendFind: notifyWindow(terminalIpc.find),
          sendTitleBarToggle: notifyWindow(terminalIpc.titleBarToggle),
          sendTabBarToggle: notifyWindow(terminalIpc.tabBarToggle),
          sendSnippetsToggle: notifyWindow(terminalIpc.snippetsToggle),
          sendLocalImageOpen: notifyWindow(terminalIpc.localImageOpen),
          toggleDeveloperTools: (window) => window.webContents.toggleDevTools(),
          sendTabCommand: (window, command) =>
            window.webContents.send(terminalIpc.tabCommand, command),
          quit: () => app.quit(),
          operationalEvents: operationalEvents!,
        });

        const menuActions = {
          newWindow: () => {
            void terminalApplication!.newWindow().catch((cause) => {
              const failure = terminalApplicationFailure("new-window", cause);
              operationalEvents!.write({
                name: "application.failure",
                stage: failure.stage,
              });
              const display = terminalApplicationFailureDisplay(failure);
              dialog.showErrorBox(display.title, display.message);
            });
          },
          closeSelectedWindow: () =>
            void terminalApplication!.closeSelectedWindow(),
          newTabInSelectedWindow: terminalApplication.newTabInSelectedWindow,
          closeSelectedTab: () => void terminalApplication!.closeSelectedTab(),
          selectNextTab: terminalApplication.selectNextTab,
          selectPreviousTab: terminalApplication.selectPreviousTab,
          selectTabInSelectedWindow:
            terminalApplication.selectTabInSelectedWindow,
          requestQuit: () => void terminalApplication!.requestQuit(),
          toggleSelectedFullScreen:
            terminalApplication.toggleSelectedFullScreen,
          toggleSelectedAlwaysOnTop:
            terminalApplication.toggleSelectedAlwaysOnTop,
          toggleSelectedDevTools: terminalApplication.toggleSelectedDevTools,
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
          findInSelectedTerminal: terminalApplication.findInSelectedWindow,
          toggleSelectedSnippets: terminalApplication.toggleSelectedSnippets,
          toggleSelectedTabBar: terminalApplication.toggleSelectedTabBar,
          toggleSelectedTitleBar: terminalApplication.toggleSelectedTitleBar,
          reloadUserConfiguration: () => void configurationReloader.reload(),
          openLocalImage: terminalApplication.openLocalImageInSelectedWindow,
          showAbout: applicationAbout.startApplicationAbout(terminalIpcRouter),
        };
        const keybindActionInvocations = terminalActionInvocations(menuActions);
        rebuildMenu = () =>
          nativeMenu.installApplicationMenu(
            terminalApplicationMenuTemplate(
              app.name,
              menuActions,
              configurationReloader.current().configuration.keybinds,
            ),
          );
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
  applicationAbout.configureApplicationAbout(
    app,
    app.isPackaged
      ? packagedApplicationIconPath
      : developmentApplicationIconPath,
  );
  const launch = startupLaunchRequest(process.argv, app.isPackaged);
  if (!app.isPackaged) app.dock?.setIcon(developmentApplicationIconPath);
  const account = userInfo();
  return {
    account,
    consumeLaunchRequest: launch,
    configurationLoadOptions: {
      environment: process.env,
      homeDirectory: account.homedir,
      platform: process.platform,
      getInstalledFontFamilyMetrics: installedFontFamilyMetrics,
    },
  };
}
