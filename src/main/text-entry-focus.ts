import { terminalIpc } from "../shared/terminal-ipc";
import type { IpcListener, TrustedWebContents } from "./terminal-ipc-types";

// Whether the window's page has a text field focused, as its renderer reports
// it. A reload starts over with the terminal focused.
export function trackTextEntryFocus(
  webContents: TrustedWebContents & {
    on(event: "did-start-loading" | "destroyed", listener: () => void): unknown;
  },
  ipc: {
    on(channel: string, listener: IpcListener): void;
    removeListener(channel: string, listener: IpcListener): void;
  },
): { readonly editing: () => boolean } {
  let editing = false;
  const receive: IpcListener = (event, value) => {
    if (
      event.sender !== webContents ||
      event.senderFrame !== webContents.mainFrame ||
      typeof value !== "boolean"
    )
      return;
    editing = value;
  };
  ipc.on(terminalIpc.textEntryFocus, receive);
  webContents.on("did-start-loading", () => {
    editing = false;
  });
  webContents.on("destroyed", () =>
    ipc.removeListener(terminalIpc.textEntryFocus, receive),
  );
  return { editing: () => editing };
}
