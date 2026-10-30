import "./terminal-window.css";
import "./command-palette.css";
import "./window-chrome.css";
import "./about/about-dialog.css";
import "./ui-tokens.css";
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
  const auxiliaryPanel =
    document.querySelector<HTMLElement>("#snippets-sidebar");
  if (!auxiliaryPanel) throw new Error("Auxiliary Panel container is missing");
  const surfaceFailure = document.querySelector<HTMLElement>(
    "#terminal-surface-failure",
  );
  if (!surfaceFailure)
    throw new Error("Terminal Surface failure banner is missing");

  let retired = false;
  const retireStartup = () => {
    retired = true;
  };
  window.addEventListener("pagehide", retireStartup, { once: true });
  void bridge.terminal
    .configuration()
    .then(async (configuration) => {
      const layout = bridge.terminal.layout;
      const initialLayout = layout ? await layout.initial() : null;
      window.removeEventListener("pagehide", retireStartup);
      if (retired) {
        for (const tab of initialLayout?.tabs ?? [])
          for (const token of tab.panes) layout?.cancel(token);
        return;
      }
      // Render before mounting so the Terminal Surface measures the space the
      // banner leaves, instead of resizing right after it appears.
      renderUserFileErrorBanner(errorBanner, configuration.userFileErrors);
      const host = mountTerminalWindowPage(
        { tabStrip, tabsContainer, auxiliaryPanel },
        {
          configuration,
          ...(layout ? { layout } : {}),
          ...(bridge.terminal.semanticInput
            ? { semanticInput: bridge.terminal.semanticInput }
            : {}),
          ...(initialLayout ? { initialLayout } : {}),
          about: bridge.about,
          ...(bridge.terminal.palette
            ? { palette: bridge.terminal.palette }
            : {}),
          settings: bridge.settings,
          ...(bridge.extensions ? { extensions: bridge.extensions } : {}),
          ...(bridge.terminal.hostedContent
            ? { hostedContent: bridge.terminal.hostedContent }
            : {}),
          ...(bridge.terminal.mirrorTyping
            ? { mirrorTyping: bridge.terminal.mirrorTyping }
            : {}),
          chrome: bridge.terminal,
          mount: mountResttyTerminalSurface,
          loadFontData: bridge.terminal.fontData,
          surfaceFailureBanner: surfaceFailure,
          ...(bridge.terminal.sshPane
            ? { sshPane: bridge.terminal.sshPane }
            : {}),
          createAdapter: (
            configurationId,
            workingDirectoryOf,
            launchToken,
            restoreToken,
          ) =>
            createElectronTerminalAdapter(
              bridge.terminal,
              configurationId,
              workingDirectoryOf,
              launchToken,
              restoreToken,
            ),
          subscribeToFontZoom: bridge.terminal.onFontZoom,
          subscribeToConfigurationUpdates:
            bridge.terminal.onConfigurationUpdate,
          userFileErrorBanner: errorBanner,
          subscribeToClipboardActions: bridge.terminal.onClipboardAction,
          droppedFilePathInsertion: bridge.terminal.droppedFilePathInsertion,
          subscribeToTabCommands: bridge.terminal.onTabCommand,
          subscribeToTabBarToggle: bridge.terminal.onTabBarToggle,
          subscribeToFind: bridge.terminal.onFind,
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
            load: bridge.terminal.snippets,
            subscribeToToggle: bridge.terminal.onSnippetsToggle,
          },
        },
      );
      // Pane initialization owns its failure/empty notification. A rejected first
      // mount is not host-setup failure: Settings or another tab may survive.
      // Synchronous setup and initial-plan failures instead retire this empty host.
      void host.ready.catch(() => {});
    })
    .catch(() => {
      window.removeEventListener("pagehide", retireStartup);
      if (!retired) bridge.terminal.notifyTabsEmpty("rendering-failure");
    });
}
