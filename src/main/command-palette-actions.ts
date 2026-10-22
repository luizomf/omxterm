import type { IpcMain } from "electron";
import {
  TERMINAL_ACTION_NAMES,
  type TerminalActionName,
} from "../shared/terminal-keybinds";
import { terminalIpc } from "../shared/terminal-ipc";
import type { IpcEvent, IpcMainPort } from "./terminal-ipc-types";

// The command palette runs application actions by name, exactly as their
// keyboard shortcuts do: the renderer gains nothing a key press could not do.
export function registerCommandPaletteActions(
  ipcMain: IpcMain,
  isTrustedSender: (event: IpcEvent) => boolean,
  invocations: Readonly<Record<TerminalActionName, () => void>>,
): () => void {
  const port = ipcMain as unknown as IpcMainPort;
  const listener = (event: IpcEvent, payload?: unknown) => {
    if (
      event.senderFrame !== event.sender.mainFrame ||
      !isTrustedSender(event) ||
      !(TERMINAL_ACTION_NAMES as readonly unknown[]).includes(payload)
    )
      return;
    invocations[payload as TerminalActionName]();
  };
  port.on(terminalIpc.runAction, listener);
  return () => port.removeListener(terminalIpc.runAction, listener);
}
