import { startTerminalWindow } from "../../src/renderer/start-terminal-window";
import { observeTabRemovalCommands } from "./tab-removal-surface-control";

const bridge = window.omxterm;
startTerminalWindow({
  ...bridge,
  terminal: { ...bridge.terminal, onTabCommand: observeTabRemovalCommands },
});
