/* eslint-disable max-lines, max-lines-per-function -- Keep native startup composition and its captured application/window lifetimes together. */
import {
  app,
  BrowserWindow,
  clipboard,
  ipcMain,
  Menu,
  screen,
  shell,
} from "electron";
import * as nodePty from "node-pty";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { terminalIpc } from "../shared/terminal-ipc";
import { registerExtensionViewScheme } from "./extension-view-host";
import { sendExtensionAwareClipboard } from "./extension-view-ipc";
import { coreActionMenuTemplate } from "./application-menu";
import {
  createCoreActionCatalog,
  type CoreActionCatalog,
} from "./action-catalog";
import { startCommandPalette } from "./command-palette";
import { terminalMenuActions } from "./terminal-menu-actions";
import { extensionInvocationTarget } from "./extension-invocation-target";
import { usesOptionalSnippets } from "../shared/snippets-mode";
import { startApplicationExtensions } from "./application-extensions";
import { registerSshTerminalLaunch } from "./ssh-terminal-ipc";
import { registerSemanticInputIpc } from "./semantic-input-ipc";
import { startApplicationLayout } from "./application-layout";
import { registerMirrorTypingIpc } from "./mirror-typing-ipc";
import { terminalContextMenuTemplate } from "./terminal-context-menu";
import * as applicationAbout from "./application-about";
import { startApplicationSettings } from "./application-settings";
import {
  registerWindowActionDelivery,
  createWindowActionSender,
  deliverExtensionKeybind,
} from "./window-action-delivery";
import { createKeybindCapture } from "./keybind-capture";
import { createDefaultShellResolver, defaultShellName } from "./default-shell";
import { MalformedLaunchRequestError } from "./launch-request";
import { prepareStartup } from "./application-startup";
import { registerTerminalShutdown } from "./terminal-shutdown";
import { applyLinuxDisplayBackendDefault } from "./linux-display-backend";
import { applyChromiumSandboxPolicy } from "./chromium-sandbox-policy";
import { applyChromiumGpuPolicy } from "./chromium-gpu-policy";
import {
  isFilePathPlatform,
  readClipboardPathInsertion,
} from "../shared/file-path-insertion";
import {
  startTerminalApplication,
  type TerminalApplication,
} from "./terminal-application";
import { terminalApplicationFailure } from "./terminal-application-failure";
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
import { createNativeDialogs } from "./native-dialogs";
import { DEFAULT_LANGUAGE, translatorFor } from "../shared/i18n";
import {
  createOperationalEventLog,
  type OperationalEventLog,
} from "./operational-events";

// Dialogs follow the configured language once the configuration is loaded.
let currentTranslator = () => translatorFor(DEFAULT_LANGUAGE);
const nativeDialogs = createNativeDialogs(() => currentTranslator());
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

let palette: ReturnType<typeof startCommandPalette> | undefined;
const { sendAction, notifyWindow } = createWindowActionSender(() => palette);

let terminalApplication: TerminalApplication<BrowserWindow> | undefined;
const keybindCapture = createKeybindCapture(process.platform);
let operationalEvents: OperationalEventLog | undefined;
let disposeTerminalSessions = () => {};
let extensions:
  Awaited<ReturnType<typeof startApplicationExtensions>> | undefined;
let sshLaunch: ReturnType<typeof registerSshTerminalLaunch>;
let layouts: ReturnType<typeof startApplicationLayout>;
let mirrors: ReturnType<typeof registerMirrorTypingIpc>;
let semanticInput: ReturnType<typeof registerSemanticInputIpc>;
const shutdown = registerTerminalShutdown(app, {
  application: () => terminalApplication,
  disposeSessions: () => {
    sshLaunch?.dispose();
    layouts?.dispose();
    mirrors?.dispose();
    semanticInput?.dispose();
    disposeTerminalSessions();
  },
  disposeExtensions: () => extensions?.dispose() ?? Promise.resolve(true),
  onExtensionCleanupUnknown: () =>
    process.stderr.write("Extension cleanup did not settle before Quit.\n"),
});

registerExtensionViewScheme();
applyChromiumSandboxPolicy(app.commandLine);

applyChromiumGpuPolicy(app.commandLine);

applyLinuxDisplayBackendDefault(app);

app.on("before-quit", () => operationalEvents?.flush());

app
  .whenReady()
  .then(async () => {
    const { account, consumeLaunchRequest, configurationLoadOptions } =
      prepareStartup(
        developmentApplicationIconPath,
        packagedApplicationIconPath,
      );
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
        sshLaunch = registerSshTerminalLaunch(
          terminalIpcRouter.isTrustedSender,
          () => terminalApplication?.isQuitting() === true,
        );
        layouts = startApplicationLayout({
          trusted: terminalIpcRouter.isTrustedSender,
          home: account.homedir,
          application: () => terminalApplication,
        });
        mirrors = registerMirrorTypingIpc({
          ipc: ipcMain,
          trusted: terminalIpcRouter.isTrustedSender,
          quitting: () => terminalApplication?.isQuitting() === true,
        });
        semanticInput = registerSemanticInputIpc({
          ipc: ipcMain,
          trusted: terminalIpcRouter.isTrustedSender,
          quitting: () => terminalApplication?.isQuitting() === true,
        });
        let rebuildMenu = () => {};
        let actionCatalog: CoreActionCatalog;
        extensions = await startApplicationExtensions({
          translator: () => currentTranslator(),
          sendAction,
          applicationRoot,
          ssh: sshLaunch,
          layout: layouts,
          mirrorTyping: mirrors,
          semanticInput,
          isTrustedSender: terminalIpcRouter.isTrustedSender,
          changed: () => rebuildMenu(),
          keybind: (event, input, owner, companionOnly) =>
            deliverExtensionKeybind(
              actionCatalog,
              event,
              input,
              owner,
              keybindCapture,
              companionOnly,
            ),
        });
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
        currentTranslator = () =>
          translatorFor(configurationReloader.current().configuration.language);
        const resolveCurrentDefaultShell = createDefaultShellResolver(
          account.shell,
          () => configurationReloader.current().configuration.windowsShell,
        );
        terminalApplication = startTerminalApplication<BrowserWindow>({
          confirmClose: userConfiguration.confirmClose,
          alwaysOnTopDefault: userConfiguration.alwaysOnTop,
          createWindow(lifecycle, restoration) {
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
            const actionDelivery = registerWindowActionDelivery(
              window,
              () => actionCatalog,
              keybindCapture,
              () => palette,
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
            sshLaunch.register(window);
            const invocationTarget = extensionInvocationTarget(window);
            const controller = terminalIpcRouter.registerController({
              windowId: lifecycle.windowId,
              configuration: terminalRendererConfiguration(
                active,
                nativeTitleInset,
              ),
              initialFullScreen: window.isFullScreen(),
              mirrorWindowFocused: () => window.isFocused(),
              mirrorWindowAvailable: () =>
                !terminalApplication?.isQuitting() &&
                !window.isDestroyed() &&
                window.isVisible() &&
                !window.isMinimized(),
              onMirrorStopped: (lease, reason) =>
                mirrors.stopped(window, lease, reason),
              backgroundTransparency: backgroundEffects.register(
                window,
                active.configuration,
              ),
              webContents: window.webContents,
              consumeSshLaunch: (token) => sshLaunch.consume(window, token),
              homeDirectory: account.homedir,
              initialLayout: () => layouts.initial(window),
              consumeLayoutLaunch: (token) => layouts.consume(window, token),
              createSession(callbacks, workingDirectory, ssh, restored) {
                return shutdown.createSession(nodePty.spawn, {
                  shell: resolveCurrentDefaultShell(),
                  launchRequest: restored
                    ? { kind: "default-shell" }
                    : (ssh?.request ?? consumeLaunch()),
                  ...(ssh ? { fallbackTitle: ssh.title } : {}),
                  platform: process.platform,
                  homeDirectory: account.homedir,
                  ...(workingDirectory ? { workingDirectory } : {}),
                  applicationVersionProvider: app,
                  environment: process.env,
                  ...callbacks,
                });
              },
              onSessionStartError: lifecycle.onSessionStartError,
              onTabsEmpty: lifecycle.onTabsEmpty,
              onSessionExit: (exit, context) => {
                actionDelivery.invalidate();
                invocationTarget.ended(context.sessionId);
                titleController.sessionEnded(context.sessionId);
                lifecycle.onSessionExit(exit, context);
              },
              onSessionStarted: (sessionId, title) => {
                invocationTarget.started(sessionId);
                titleController.sessionStarted(sessionId, title);
              },
              onSessionSelected: (sessionId) => {
                invocationTarget.selected(sessionId);
                mirrors.selectionChanged(window, sessionId);
                actionDelivery.select(sessionId);
                titleController.selectSession(sessionId);
              },
              onSettingsSelected: () => {
                invocationTarget.selected(null);
                mirrors.selectionChanged(window, null);
                actionDelivery.select("settings");
                titleController.selectSettings(
                  currentTranslator().t("settings.title"),
                );
              },
              onSessionTitleSync: titleController.syncSessionTitle,
              onTitleRequest: titleController.requestTitle,
              onBell: titleController.ringBell,
              onUserInteraction: titleController.resetAttention,
              openExternalLink: (url) => shell.openExternal(url),
              onExternalLinkOpenError: nativeDialogs.externalLinkError,
              writeClipboardText: (text) => clipboard.writeText(text),
              readClipboardText: () =>
                isFilePathPlatform(process.platform)
                  ? readClipboardPathInsertion(clipboard, process.platform)
                  : clipboard.readText(),
              onClipboardError: nativeDialogs.clipboardError,
              loadSnippets: () =>
                loadTerminalSnippets({
                  environment: process.env,
                  homeDirectory: account.homedir,
                }),
              loadLocalImage: (request, abortSignal) =>
                loadLocalImageForWindow(
                  window,
                  request,
                  abortSignal,
                  currentTranslator(),
                ),
              confirmPaste: () => nativeDialogs.confirmPaste(window),
              showClipboardContextMenu(request) {
                Menu.buildFromTemplate([
                  ...terminalContextMenuTemplate(
                    window,
                    terminalApplication!,
                    request,
                    configurationReloader.current().configuration.keybinds
                      .closePane,
                    currentTranslator().t,
                  ),
                  ...extensions!.contextMenu(
                    window,
                    request?.sessionId,
                    () =>
                      !!request && controller.claimContextMenuTarget(request),
                  ),
                ]).popup({ window });
              },
            });

            layouts.register(window, controller, restoration?.plan);
            mirrors.register(window, controller);
            semanticInput.register(window);
            extensions!.registerWindow(window, (source, context) =>
              invocationTarget.capture(
                (id) => controller.reportedWorkingDirectory?.(id),
                source,
                context,
              ),
            );
            window.once("ready-to-show", () => {
              if (restoration && !restoration.focus()) window.showInactive();
              else backgroundEffects.show(window);
            });
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
          showQuitConfirmation: nativeDialogs.confirmQuit,
          showCloseWindowConfirmation: nativeDialogs.confirmCloseWindow,
          showCloseTabConfirmation: nativeDialogs.confirmCloseTab,
          showClosePaneConfirmation: nativeDialogs.confirmClosePane,
          showSessionFailure: nativeDialogs.sessionFailure,
          sendFontZoom: (window, command) =>
            sendAction(window.webContents, terminalIpc.fontZoom, command),
          sendClipboardAction: (window, action, target) =>
            sendExtensionAwareClipboard(
              ipcMain,
              window.webContents,
              action,
              target,
            ),
          sendFind: notifyWindow(terminalIpc.find),
          sendTitleBarToggle: notifyWindow(terminalIpc.titleBarToggle),
          sendTabBarToggle: notifyWindow(terminalIpc.tabBarToggle),
          sendAuxiliaryPanelToggle: notifyWindow(
            terminalIpc.auxiliaryPanelToggle,
          ),
          sendSnippetsToggle: (window) => {
            if (usesOptionalSnippets(process.platform, process.arch))
              extensions?.toggleSnippets(window);
            else notifyWindow(terminalIpc.snippetsToggle)(window);
          },
          sendLocalImageOpen: notifyWindow(terminalIpc.localImageOpen),
          toggleDeveloperTools: (window) => window.webContents.toggleDevTools(),
          sendTabCommand: (window, command) =>
            sendAction(window.webContents, terminalIpc.tabCommand, command),
          quit: () => app.quit(),
          operationalEvents: operationalEvents!,
        });

        const menuActions = terminalMenuActions(terminalApplication, {
          newWindow: () => {
            void terminalApplication!.newWindow().catch((cause) => {
              const failure = terminalApplicationFailure("new-window", cause);
              operationalEvents!.write({
                name: "application.failure",
                stage: failure.stage,
              });
              nativeDialogs.applicationFailure(failure);
            });
          },
          reloadUserConfiguration: () => void configurationReloader.reload(),
          showAbout: applicationAbout.startApplicationAbout(
            terminalIpcRouter,
            sendAction,
          ),
          showCommandPalette: () => palette?.show(),
          showSettings: startApplicationSettings(
            terminalIpcRouter,
            configurationLoadOptions,
            configurationReloader,
            keybindCapture,
            sendAction,
          ),
        });
        rebuildMenu = () => {
          actionCatalog = createCoreActionCatalog(
            app.name,
            menuActions,
            configurationReloader.current().configuration.keybinds,
            currentTranslator().t,
            extensions?.actions(),
          );
          nativeMenu.installApplicationMenu(
            coreActionMenuTemplate(
              app.name,
              actionCatalog,
              currentTranslator().t,
            ),
          );
        };
        rebuildMenu();
        palette = startCommandPalette({
          ipcMain,
          isTrustedSender: terminalIpcRouter.isTrustedSender,
          selectedContents: () => BrowserWindow.getFocusedWindow()?.webContents,
          catalog: () => actionCatalog,
        });
        app.once("will-quit", palette.dispose);

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
    nativeDialogs.applicationFailure(failure);
    app.quit();
  });
