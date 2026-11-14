import { onWindowClosed } from "./window-closed";
import { BrowserWindow, ipcMain } from "electron";
import { terminalIpc } from "../shared/terminal-ipc";
import type { IpcEvent } from "./terminal-ipc-types";
import { createSshTerminalLaunch, findSsh } from "./ssh-terminal-launch";

/** Production actual-main-frame adapter for the core-owned launch module. */
export function registerSshTerminalLaunch(
  isTrusted: (event: IpcEvent) => boolean,
  isQuitting: () => boolean,
) {
  const launch = createSshTerminalLaunch<BrowserWindow>({
    lookup: () => findSsh(process.env),
    alive: (window) =>
      !window.isDestroyed() &&
      !window.webContents.isDestroyed() &&
      !isQuitting(),
    notify: (window, message) =>
      window.webContents.send(terminalIpc.tabCommand, message),
  });
  ipcMain.on("terminal:ssh-pane", (event, value: unknown) => {
    if (
      !isTrusted(event) ||
      event.senderFrame !== event.sender.mainFrame ||
      !value ||
      typeof value !== "object" ||
      Array.isArray(value)
    )
      return;
    const request = value as Record<string, unknown>;
    const window = BrowserWindow.fromWebContents(event.sender);
    if (
      !window ||
      typeof request.token !== "string" ||
      Object.keys(request).sort().join() !== "accepted,token"
    )
      return;
    if (typeof request.accepted === "boolean")
      launch.acknowledge(window, request.token, request.accepted);
    else if (request.accepted === null) launch.cancel(window, request.token);
  });
  return {
    ...launch,
    register(window: BrowserWindow) {
      onWindowClosed(window, () => launch.cancel(window));
      window.webContents.on("render-process-gone", () => launch.cancel(window));
      window.webContents.on(
        "did-start-navigation",
        (_event, _url, _inPlace, mainFrame) => {
          if (mainFrame) launch.cancel(window);
        },
      );
    },
  };
}
