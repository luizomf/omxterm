import "@xterm/xterm/css/xterm.css";
import "./terminal-window.css";
import { createElectronTerminalAdapter } from "./electron-terminal-adapter";
import { mountTerminalWindowPage } from "./terminal-window-host";
import { renderUserFileErrorBanner } from "./user-file-error-banner";

const tabStrip = document.querySelector<HTMLElement>("#tab-strip");
if (!tabStrip) throw new Error("Terminal Tab strip container is missing");
const tabsContainer = document.querySelector<HTMLElement>("#terminal-tabs");
if (!tabsContainer) throw new Error("Terminal Tabs container is missing");
const errorBanner = document.querySelector<HTMLElement>("#user-file-errors");
if (!errorBanner) throw new Error("User File Error banner is missing");
const snippetsElement =
  document.querySelector<HTMLElement>("#snippets-sidebar");
if (!snippetsElement) throw new Error("Snippets Sidebar container is missing");

void window.omxterm.terminal.configuration().then((configuration) => {
  // Render before mounting so the Terminal Surface measures the space the
  // banner leaves, instead of resizing right after it appears.
  renderUserFileErrorBanner(errorBanner, configuration.userFileErrors);
  const host = mountTerminalWindowPage(
    { tabStrip, tabsContainer },
    {
      configuration,
      createAdapter: () =>
        createElectronTerminalAdapter(window.omxterm.terminal),
      subscribeToFontZoom: window.omxterm.terminal.onFontZoom,
      subscribeToClipboardActions: window.omxterm.terminal.onClipboardAction,
      subscribeToTabCommands: window.omxterm.terminal.onTabCommand,
      subscribeToTabTitles: window.omxterm.terminal.onTabTitle,
      notifyTabSelection: window.omxterm.terminal.notifyTabSelection,
      onTitleRequest: window.omxterm.terminal.title,
      onBell: window.omxterm.terminal.bell,
      onExternalLink: window.omxterm.terminal.openExternalLink,
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
