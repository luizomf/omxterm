import "@xterm/xterm/css/xterm.css";
import "./terminal-window.css";
import { createElectronTerminalAdapter } from "./electron-terminal-adapter";
import { mountTerminalWindowPage } from "./terminal-window-host";
import { renderUserFileErrorBanner } from "./user-file-error-banner";

const container = document.querySelector<HTMLElement>("#terminal-surface");
if (!container) throw new Error("Terminal Surface container is missing");
const errorBanner = document.querySelector<HTMLElement>("#user-file-errors");
if (!errorBanner) throw new Error("User File Error banner is missing");

void window.omxterm.terminal.configuration().then((configuration) => {
  // Render before mounting so the Terminal Surface measures the space the
  // banner leaves, instead of resizing right after it appears.
  renderUserFileErrorBanner(errorBanner, configuration.userFileErrors);
  const adapter = createElectronTerminalAdapter(window.omxterm.terminal);
  const host = mountTerminalWindowPage(container, adapter, {
    configuration,
    subscribeToFontZoom: window.omxterm.terminal.onFontZoom,
    subscribeToClipboardActions: window.omxterm.terminal.onClipboardAction,
    onTitleRequest: window.omxterm.terminal.title,
    onBell: window.omxterm.terminal.bell,
    onExternalLink: window.omxterm.terminal.openExternalLink,
    clipboard: {
      writeText: window.omxterm.terminal.writeClipboardText,
      readText: window.omxterm.terminal.readClipboardText,
      confirmPaste: window.omxterm.terminal.confirmPaste,
      requestContextMenu: window.omxterm.terminal.requestClipboardContextMenu,
    },
  });
  void host.ready.catch((error: unknown) => {
    host.dispose();
    throw new Error("Failed to mount the Terminal Surface", { cause: error });
  });
});
