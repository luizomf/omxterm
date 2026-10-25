import { startTerminalWindow } from "../../src/renderer/start-terminal-window";
import { createOverlayActionConsumption } from "./overlay-action-consumption";
import { observeHostTabCommands } from "./host-tab-command-readiness";

const consumption = createOverlayActionConsumption(crypto.randomUUID());
Object.defineProperty(window, "__overlayConsumptionFixture", {
  value: () => consumption.snapshot(),
});
const bridge = window.omxterm;
const host = observeHostTabCommands(bridge.terminal.onTabCommand);
Object.defineProperty(window, "__windowChromeHostReady", { value: host.wait });
window.addEventListener("pagehide", host.dispose, { once: true });
startTerminalWindow({
  ...bridge,
  terminal: {
    ...bridge.terminal,
    onTabCommand: host.subscribe,
    onClipboardAction: consumption.clipboard(bridge.terminal.onClipboardAction),
    onSnippetsToggle: consumption.toggle(bridge.terminal.onSnippetsToggle),
  },
});
