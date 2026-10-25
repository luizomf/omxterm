import { startTerminalWindow } from "../../src/renderer/start-terminal-window";
import { observeHostTabCommands } from "./host-tab-command-readiness";

const bridge = window.omxterm;
const host = observeHostTabCommands(bridge.terminal.onTabCommand);
Object.defineProperty(globalThis, "__omxtermStartupTitlesHost", {
  value: { isReady: () => host.ready, wait: host.wait },
});
window.addEventListener("pagehide", host.dispose, { once: true });
startTerminalWindow({
  ...bridge,
  terminal: { ...bridge.terminal, onTabCommand: host.subscribe },
});
