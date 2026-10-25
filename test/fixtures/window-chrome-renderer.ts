import { startTerminalWindow } from "../../src/renderer/start-terminal-window";
import { createOverlayActionConsumption } from "./overlay-action-consumption";

const consumption = createOverlayActionConsumption(crypto.randomUUID());
Object.defineProperty(window, "__overlayConsumptionFixture", {
  value: () => consumption.snapshot(),
});
const bridge = window.omxterm;
startTerminalWindow({
  ...bridge,
  terminal: {
    ...bridge.terminal,
    onClipboardAction: consumption.clipboard(bridge.terminal.onClipboardAction),
    onSnippetsToggle: consumption.toggle(bridge.terminal.onSnippetsToggle),
  },
});
