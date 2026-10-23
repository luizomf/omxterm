import {
  app,
  BrowserWindow,
  clipboard,
  dialog,
  ipcMain,
  Menu,
  screen,
  shell,
} from "electron";
import * as nodePty from "node-pty";
import { hostname } from "node:os";
import { terminalIpc } from "../shared/terminal-ipc";
import {
  terminalActionInvocations,
  terminalApplicationMenuTemplate,
  terminalClipboardContextMenuTemplate,
} from "./application-menu";
import { deliverKeybindsFromKeyEvents } from "./keybind-delivery";
import { createDefaultShellResolver, defaultShellName } from "./default-shell";
import { registerTerminalShutdown } from "./terminal-shutdown";
import { prepareStartup } from "./startup-preparation";
import { readStartupCommandLine } from "./command-line-startup";
import {
  requestsStartupLaunch,
  startupOptionsForWindow,
} from "./command-line-options";
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
  startupFailureStage,
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
import type { OperationalEventLog } from "./operational-events";
import { startApplicationDataServices } from "./application-data-services";
import { applicationMenuActions } from "./application-menu-actions";
import { registerCommandPaletteActions } from "./command-palette-actions";
import { registerMainMenu, terminalMainMenuTemplate } from "./main-menu";
import { createTranslator, resolveLocale } from "../shared/i18n";
import { commandIpc } from "../shared/command-ipc";
import { sessionIpc } from "../shared/session-ipc";
import { launchTerminalSession } from "./session-launch";
import {
  linuxWindowIconPath,
  preloadPath,
  rendererPath,
} from "./application-paths";
import {
  confirmBroadcast,
  confirmClosePane,
  confirmCloseTab,
  confirmCloseWindow,
  confirmProtectedPaste,
  confirmQuit,
} from "./native-confirmations";

const showClipboardError = () =>
  dialog.showErrorBox("Clipboard Error", "Clipboard operation failed.");
let terminalApplication: TerminalApplication<BrowserWindow> | undefined;
let operationalEvents: OperationalEventLog | undefined;
let disposeTerminalSessions = () => {};
const shutdown = registerTerminalShutdown(app, {
  application: () => terminalApplication,
  disposeSessions: () => disposeTerminalSessions(),
});

const commandLine = readStartupCommandLine(app);

applyChromiumSandboxPolicy(app.commandLine);

// --help and --version exit without a window and an invalid option is
// reported by this process, so neither relaunches for the display backend.
if (commandLine.action === "run") applyLinuxDisplayBackendDefault(app);

app.on("before-quit", () => operationalEvents?.flush());

app
  .whenReady()
  .then(async () => {
    if (commandLine.action === "invalid") throw commandLine.error;
    if (commandLine.action !== "run") return;
    const startup = prepareStartup(app, commandLine.logLevel);
    const { account, consumeLaunchRequest, configurationLoadOptions } = startup;
    operationalEvents = startup.operationalEvents;
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
        const {
          savedSessions,
          workspace,
          menuActions: dataActions,
          menuState: dataMenuState,
        } = await startApplicationDataServices({
          ipcMain,
          homeDirectory: account.homedir,
          isTrustedSender: terminalIpcRouter.isTrustedSender,
          operationalEvents: operationalEvents!,
          startupConnection: commandLine.startup.ssh,
          reloadConfiguration: () => configurationReloader.reload(),
          isQuitting: () => terminalApplication?.isQuitting() ?? false,
          onMenuStateChange: () => rebuildMenu(),
        });
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
            const consumeStartup = startupOptionsForWindow(
              lifecycle.windowId,
              commandLine.startup,
            );
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
              ...workspace.windowOptions(lifecycle.windowId, (listener) =>
                window.once("closed", listener),
              ),
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
              localHostNames: [hostname()],
              createSession: (callbacks, launch) =>
                launchTerminalSession(
                  launch,
                  {
                    shell: resolveCurrentDefaultShell(),
                    platform: process.platform,
                    homeDirectory: account.homedir,
                    applicationVersionProvider: app,
                    environment: process.env,
                    ...callbacks,
                  },
                  {
                    consumeLaunchRequest: consumeLaunch,
                    consumeStartupOptions: consumeStartup,
                    savedSessions,
                    start: (sessionOptions) =>
                      shutdown.createSession(nodePty.spawn, sessionOptions),
                  },
                ),
              confirmBroadcast: (targetCount) =>
                confirmBroadcast(window, targetCount),
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
              confirmPaste: () => confirmProtectedPaste(window),
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
          showQuitConfirmation: confirmQuit,
          showCloseWindowConfirmation: confirmCloseWindow,
          showCloseTabConfirmation: confirmCloseTab,
          showClosePaneConfirmation: confirmClosePane,
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
          sendTitleBarToggle: (window) =>
            window.webContents.send(terminalIpc.titleBarToggle),
          sendTabBarToggle: (window) =>
            window.webContents.send(terminalIpc.tabBarToggle),
          sendSnippetsToggle: (window) =>
            window.webContents.send(terminalIpc.snippetsToggle),
          sendSessionsToggle: (window) =>
            window.webContents.send(sessionIpc.toggleSidebar),
          sendCommandsToggle: (window) =>
            window.webContents.send(commandIpc.toggleSidebar),
          sendCommandPaletteToggle: (window) =>
            window.webContents.send(terminalIpc.commandPalette),
          sendLocalImageOpen: (window) =>
            window.webContents.send(terminalIpc.localImageOpen),
          toggleDeveloperTools: (window) => window.webContents.toggleDevTools(),
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
        const menuActions = applicationMenuActions(terminalApplication, {
          newWindow: openNewWindow,
          reloadUserConfiguration: () => void configurationReloader.reload(),
          ...dataActions(() => rebuildMenu()),
        });
        const keybindActionInvocations = terminalActionInvocations(menuActions);
        registerCommandPaletteActions(
          ipcMain,
          terminalIpcRouter.isTrustedSender,
          keybindActionInvocations,
        );
        const menuTranslator = createTranslator(
          resolveLocale(app.getPreferredSystemLanguages()),
        );
        registerMainMenu(
          ipcMain,
          terminalIpcRouter.isTrustedSender,
          (sender, { x, y }) => {
            const window = BrowserWindow.getAllWindows().find(
              (candidate) => candidate.webContents === sender,
            );
            if (!window) return;
            Menu.buildFromTemplate(
              terminalMainMenuTemplate(
                menuTranslator,
                menuActions,
                configurationReloader.current().configuration.keybinds,
                dataMenuState(),
              ),
            ).popup({ window, x, y });
          },
        );
        rebuildMenu = () =>
          nativeMenu.installApplicationMenu(
            terminalApplicationMenuTemplate(
              app.name,
              menuActions,
              configurationReloader.current().configuration.keybinds,
              dataMenuState(),
            ),
          );
        rebuildMenu();

        const restore = !requestsStartupLaunch(commandLine);
        for (let left = workspace.startupWindowCount(restore); left > 0; left--)
          await terminalApplication.newWindow();
      },
    );
  })
  .catch((cause) => {
    const failure = terminalApplicationFailure(
      startupFailureStage(cause),
      cause,
    );
    operationalEvents?.write({
      name: "application.failure",
      stage: failure.stage,
    });
    const display = terminalApplicationFailureDisplay(failure);
    dialog.showErrorBox(display.title, display.message);
    // An invalid option exits with the conventional usage status.
    if (failure.stage === "command-line") app.exit(2);
    else app.quit();
  });
