import "./terminal-window.css";
import "./window-chrome.css";
import "./about/about-dialog.css";
import { createElectronTerminalAdapter } from "./electron-terminal-adapter";
import { mountTerminalWindowPage } from "./terminal-window-host";
import { renderUserFileErrorBanner } from "./user-file-error-banner";
import { mountResttyTerminalSurface } from "../terminal-surface/restty-terminal-surface";

const tabStrip = document.querySelector<HTMLElement>("#tab-strip");
if (!tabStrip) throw new Error("Terminal Tab strip container is missing");
const tabsContainer = document.querySelector<HTMLElement>("#terminal-tabs");
if (!tabsContainer) throw new Error("Terminal Tabs container is missing");
const errorBanner = document.querySelector<HTMLElement>("#user-file-errors");
if (!errorBanner) throw new Error("User File Error banner is missing");
const snippetsElement =
  document.querySelector<HTMLElement>("#snippets-sidebar");
if (!snippetsElement) throw new Error("Snippets Sidebar container is missing");
const surfaceFailure = document.querySelector<HTMLElement>(
  "#terminal-surface-failure",
);
if (!surfaceFailure)
  throw new Error("Terminal Surface failure banner is missing");

void window.omxterm.terminal.configuration().then((configuration) => {
  // Render before mounting so the Terminal Surface measures the space the
  // banner leaves, instead of resizing right after it appears.
  renderUserFileErrorBanner(errorBanner, configuration.userFileErrors);
  const host = mountTerminalWindowPage(
    { tabStrip, tabsContainer },
    {
      configuration,
      about: window.omxterm.about,
      chrome: window.omxterm.terminal,
      mount: mountResttyTerminalSurface,
      loadFontData: window.omxterm.terminal.fontData,
      onSurfaceFailure(message) {
        surfaceFailure.textContent = message;
        surfaceFailure.hidden = false;
      },
      createAdapter: (configurationId) =>
        createElectronTerminalAdapter(window.omxterm.terminal, configurationId),
      subscribeToFontZoom: window.omxterm.terminal.onFontZoom,
      subscribeToConfigurationUpdates:
        window.omxterm.terminal.onConfigurationUpdate,
      userFileErrorBanner: errorBanner,
      subscribeToClipboardActions: window.omxterm.terminal.onClipboardAction,
      droppedFilePathInsertion:
        window.omxterm.terminal.droppedFilePathInsertion,
      subscribeToTabCommands: window.omxterm.terminal.onTabCommand,
      subscribeToTabBarToggle: window.omxterm.terminal.onTabBarToggle,
      subscribeToFind: window.omxterm.terminal.onFind,
      subscribeToExportRequests: window.omxterm.terminal.onExportRequest,
      saveTerminalExport: window.omxterm.terminal.saveTerminalExport,
      subscribeToTabTitles: window.omxterm.terminal.onTabTitle,
      notifyTabSelection: window.omxterm.terminal.notifyTabSelection,
      syncTabTitle: window.omxterm.terminal.syncTabTitle,
      notifyTabsEmpty: window.omxterm.terminal.notifyTabsEmpty,
      onTitleRequest: window.omxterm.terminal.title,
      onBell: window.omxterm.terminal.bell,
      onExternalLink: window.omxterm.terminal.openExternalLink,
      loadLocalImage: window.omxterm.terminal.loadLocalImage,
      subscribeToLocalImageOpen: window.omxterm.terminal.onLocalImageOpen,
      clipboard: {
        writeText: window.omxterm.terminal.writeClipboardText,
        readText: window.omxterm.terminal.readClipboardText,
        confirmPaste: window.omxterm.terminal.confirmPaste,
        requestContextMenu: window.omxterm.terminal.requestClipboardContextMenu,
      },
      snippets: {
        element: snippetsElement,
        load: window.omxterm.terminal.snippets,
        subscribeToToggle: window.omxterm.terminal.onSnippetsToggle,
      },
    },
  );
  void host.ready.catch((error: unknown) => {
    host.dispose();
    throw new Error("Failed to mount the Terminal Surface", { cause: error });
  });
});
