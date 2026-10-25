import "./terminal-window.css";
import "./window-chrome.css";
import "./about/about-dialog.css";
import "./settings/settings-dialog.css";
import { createElectronTerminalAdapter } from "./electron-terminal-adapter";
import { mountTerminalWindowPage } from "./terminal-window-host";
import { renderUserFileErrorBanner } from "./user-file-error-banner";
import { mountResttyTerminalSurface } from "../terminal-surface/restty-terminal-surface";

// Share composition with fixture entries without replacing host policy or mounts.
export function startTerminalWindow(bridge: Window["omxterm"]): void {
  const tabStrip = document.querySelector<HTMLElement>("#tab-strip");
  if (!tabStrip) throw new Error("Terminal Tab strip container is missing");
  const tabsContainer = document.querySelector<HTMLElement>("#terminal-tabs");
  if (!tabsContainer) throw new Error("Terminal Tabs container is missing");
  const errorBanner = document.querySelector<HTMLElement>("#user-file-errors");
  if (!errorBanner) throw new Error("User File Error banner is missing");
  const snippetsElement =
    document.querySelector<HTMLElement>("#snippets-sidebar");
  if (!snippetsElement)
    throw new Error("Snippets Sidebar container is missing");
  const surfaceFailure = document.querySelector<HTMLElement>(
    "#terminal-surface-failure",
  );
  if (!surfaceFailure)
    throw new Error("Terminal Surface failure banner is missing");

  void bridge.terminal.configuration().then((configuration) => {
    // Render before mounting so the Terminal Surface measures the space the
    // banner leaves, instead of resizing right after it appears.
    renderUserFileErrorBanner(errorBanner, configuration.userFileErrors);
    const host = mountTerminalWindowPage(
      { tabStrip, tabsContainer },
      {
        configuration,
        about: bridge.about,
        settings: bridge.settings,
        chrome: bridge.terminal,
        mount: mountResttyTerminalSurface,
        loadFontData: bridge.terminal.fontData,
        surfaceFailureBanner: surfaceFailure,
        createAdapter: (configurationId, workingDirectoryOf) =>
          createElectronTerminalAdapter(
            bridge.terminal,
            configurationId,
            workingDirectoryOf,
          ),
        subscribeToFontZoom: bridge.terminal.onFontZoom,
        subscribeToConfigurationUpdates: bridge.terminal.onConfigurationUpdate,
        userFileErrorBanner: errorBanner,
        subscribeToClipboardActions: bridge.terminal.onClipboardAction,
        droppedFilePathInsertion: bridge.terminal.droppedFilePathInsertion,
        subscribeToTabCommands: bridge.terminal.onTabCommand,
        subscribeToTabBarToggle: bridge.terminal.onTabBarToggle,
        subscribeToFind: bridge.terminal.onFind,
        subscribeToExportRequests: bridge.terminal.onExportRequest,
        saveTerminalExport: bridge.terminal.saveTerminalExport,
        subscribeToTabTitles: bridge.terminal.onTabTitle,
        notifyTabSelection: bridge.terminal.notifyTabSelection,
        syncTabTitle: bridge.terminal.syncTabTitle,
        notifyTabsEmpty: bridge.terminal.notifyTabsEmpty,
        onTitleRequest: bridge.terminal.title,
        onBell: bridge.terminal.bell,
        onExternalLink: bridge.terminal.openExternalLink,
        loadLocalImage: bridge.terminal.loadLocalImage,
        subscribeToLocalImageOpen: bridge.terminal.onLocalImageOpen,
        clipboard: {
          writeText: bridge.terminal.writeClipboardText,
          readText: bridge.terminal.readClipboardText,
          confirmPaste: bridge.terminal.confirmPaste,
          requestContextMenu: bridge.terminal.requestClipboardContextMenu,
        },
        snippets: {
          element: snippetsElement,
          load: bridge.terminal.snippets,
          subscribeToToggle: bridge.terminal.onSnippetsToggle,
        },
      },
    );
    void host.ready.catch((error: unknown) => {
      // Reported Surface failures keep live notice translation until teardown.
      // Unreported host-setup failures still dispose and propagate.
      if (surfaceFailure.hidden) {
        host.dispose();
        throw new Error("Failed to mount the Terminal Surface", {
          cause: error,
        });
      }
    });
  });
}
