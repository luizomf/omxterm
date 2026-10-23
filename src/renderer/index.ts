import "./terminal-window.css";
import "./window-chrome.css";
import "./workspace.css";
import { createElectronTerminalAdapter } from "./electron-terminal-adapter";
import { mountTerminalWindowPage } from "./terminal-window-host";
import { renderUserFileErrorBanner } from "./user-file-error-banner";
import { mountResttyTerminalSurface } from "../terminal-surface/restty-terminal-surface";
import { createTranslator, resolveLocale } from "../shared/i18n";
import { showStartupSplash } from "./startup-splash";

const translator = createTranslator(resolveLocale([...navigator.languages]));
const hideStartupSplash = showStartupSplash(document);
document.documentElement.lang = translator.locale;

const tabStrip = document.querySelector<HTMLElement>("#tab-strip");
if (!tabStrip) throw new Error("Terminal Tab strip container is missing");
const tabsContainer = document.querySelector<HTMLElement>("#terminal-tabs");
if (!tabsContainer) throw new Error("Terminal Tabs container is missing");
const errorBanner = document.querySelector<HTMLElement>("#user-file-errors");
if (!errorBanner) throw new Error("User File Error banner is missing");
const snippetsElement =
  document.querySelector<HTMLElement>("#snippets-sidebar");
if (!snippetsElement) throw new Error("Snippets Sidebar container is missing");
const workspaceElement =
  document.querySelector<HTMLElement>("#workspace-sidebar");
if (!workspaceElement)
  throw new Error("Workspace Sidebar container is missing");
const surfaceFailure = document.querySelector<HTMLElement>(
  "#terminal-surface-failure",
);
if (!surfaceFailure)
  throw new Error("Terminal Surface failure banner is missing");

void Promise.all([
  window.omxterm.terminal.configuration(),
  window.omxterm.sessions.startupConnection().catch(() => null),
  window.omxterm.terminal.workspacePlan().catch(() => null),
]).then(([configuration, startupConnection, workspacePlan]) => {
  // Render before mounting so the Terminal Surface measures the space the
  // banner leaves, instead of resizing right after it appears.
  renderUserFileErrorBanner(errorBanner, configuration.userFileErrors);
  const host = mountTerminalWindowPage(
    { tabStrip, tabsContainer },
    {
      configuration,
      chrome: window.omxterm.terminal,
      toolbar: {
        runAction: window.omxterm.terminal.runAction,
        openMainMenu: window.omxterm.terminal.openMainMenu,
      },
      mount: mountResttyTerminalSurface,
      loadFontData: window.omxterm.terminal.fontData,
      onSurfaceFailure(message) {
        hideStartupSplash();
        surfaceFailure.textContent = message;
        surfaceFailure.hidden = false;
      },
      createAdapter: (configurationId, launch) =>
        createElectronTerminalAdapter(
          window.omxterm.terminal,
          configurationId,
          launch,
        ),
      subscribeToFontZoom: window.omxterm.terminal.onFontZoom,
      subscribeToConfigurationUpdates:
        window.omxterm.terminal.onConfigurationUpdate,
      userFileErrorBanner: errorBanner,
      subscribeToClipboardActions: window.omxterm.terminal.onClipboardAction,
      droppedFilePathInsertion:
        window.omxterm.terminal.droppedFilePathInsertion,
      subscribeToTabCommands: window.omxterm.terminal.onTabCommand,
      subscribeToTabBarToggle: window.omxterm.terminal.onTabBarToggle,
      subscribeToTabTitles: window.omxterm.terminal.onTabTitle,
      notifyTabSelection: window.omxterm.terminal.notifyTabSelection,
      syncTabTitle: window.omxterm.terminal.syncTabTitle,
      notifyTabsEmpty: window.omxterm.terminal.notifyTabsEmpty,
      onTitleRequest: window.omxterm.terminal.title,
      onBell: window.omxterm.terminal.bell,
      translator,
      confirmBroadcast: window.omxterm.terminal.confirmBroadcast,
      reportWorkingDirectory: window.omxterm.terminal.reportWorkingDirectory,
      onExternalLink: window.omxterm.terminal.openExternalLink,
      loadLocalImage: window.omxterm.terminal.loadLocalImage,
      subscribeToLocalImageOpen: window.omxterm.terminal.onLocalImageOpen,
      clipboard: {
        writeText: window.omxterm.terminal.writeClipboardText,
        readText: window.omxterm.terminal.readClipboardText,
        confirmPaste: window.omxterm.terminal.confirmPaste,
        requestContextMenu: window.omxterm.terminal.requestClipboardContextMenu,
      },
      highlights: window.omxterm.highlights,
      ...(workspacePlan ? { initialWorkspace: workspacePlan } : {}),
      reportWorkspace: window.omxterm.terminal.reportWorkspace,
      ...(startupConnection
        ? {
            initialLaunch: {
              spec: { kind: "quick-ssh", target: startupConnection },
              label: startupConnection,
              retainOnExit: true,
            },
          }
        : {}),
      workspace: {
        element: workspaceElement,
        sessions: window.omxterm.sessions,
        commands: window.omxterm.commands,
        backup: window.omxterm.backup,
        highlights: window.omxterm.highlights,
        preferences: window.omxterm.preferences,
        files: window.omxterm.files,
        assistant: window.omxterm.assistant,
        sessionDirectory: window.omxterm.terminal.sessionDirectory,
        palette: {
          onToggle: window.omxterm.terminal.onCommandPalette,
          runAction: window.omxterm.terminal.runAction,
        },
      },
      snippets: {
        element: snippetsElement,
        load: window.omxterm.terminal.snippets,
        subscribeToToggle: window.omxterm.terminal.onSnippetsToggle,
      },
    },
  );
  void host.ready.then(hideStartupSplash, (error: unknown) => {
    hideStartupSplash();
    host.dispose();
    throw new Error("Failed to mount the Terminal Surface", { cause: error });
  });
});
