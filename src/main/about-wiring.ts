import { app, BrowserWindow, shell, type IpcMain } from "electron";
import { aboutIpc, isAboutLink, type AboutInfo } from "../shared/about";
import {
  APPLICATION_AUTHORS,
  APPLICATION_COPYLEFT,
  APPLICATION_ISSUES,
  APPLICATION_WEBSITE,
  MIT_LICENSE_URL,
} from "./application-about";
import type { OperationalEventLog } from "./operational-events";
import type { IpcEvent, IpcMainPort } from "./terminal-ipc-types";
import { registerTrustedHandlers } from "./trusted-ipc";

const LINKS = {
  website: APPLICATION_WEBSITE,
  issues: APPLICATION_ISSUES,
  license: MIT_LICENSE_URL,
} as const;

// The About dialog drawn by the window: main supplies the application facts
// and opens only its own fixed links, never an address from the renderer.
export function startAbout(options: {
  readonly ipcMain: IpcMain;
  readonly isTrustedSender: (event: IpcEvent) => boolean;
  readonly operationalEvents: Pick<OperationalEventLog, "write">;
}) {
  registerTrustedHandlers(
    options.ipcMain as unknown as IpcMainPort,
    options.isTrustedSender,
    {
      [aboutIpc.info]: (): AboutInfo => ({
        name: "OMXTerm",
        version: app.getVersion(),
        authors: [...APPLICATION_AUTHORS],
        copyleft: APPLICATION_COPYLEFT,
        website: APPLICATION_WEBSITE,
      }),
      [aboutIpc.openLink]: async (_event, payload) => {
        if (!isAboutLink(payload)) throw new TypeError("Invalid link");
        await shell.openExternal(LINKS[payload]);
      },
    },
    () =>
      options.operationalEvents.write({
        name: "boundary.rejected",
        boundary: "ipc",
        reason: "untrusted-sender",
      }),
  );
  return {
    show() {
      const window =
        BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0];
      if (window && !window.webContents.isDestroyed())
        window.webContents.send(aboutIpc.open);
    },
  };
}
