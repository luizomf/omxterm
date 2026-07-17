import "@xterm/xterm/css/xterm.css";
import "./terminal-window.css";
import { createElectronTerminalAdapter } from "./electron-terminal-adapter";
import { mountTerminalWindowPage } from "./terminal-window-host";

const container = document.querySelector<HTMLElement>("#terminal-surface");
if (!container) throw new Error("Terminal Surface container is missing");

const adapter = createElectronTerminalAdapter(window.omxterm.terminal);
const host = mountTerminalWindowPage(container, adapter, {
  subscribeToFontZoom: window.omxterm.terminal.onFontZoom,
});
void host.ready.catch((error: unknown) => {
  host.dispose();
  throw new Error("Failed to mount the Terminal Surface", { cause: error });
});
