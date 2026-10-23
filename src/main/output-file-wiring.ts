import { writeFile } from "node:fs/promises";
import path from "node:path";
import {
  app,
  BrowserWindow,
  dialog,
  type IpcMain,
  type WebContents,
} from "electron";
import { terminalIpc } from "../shared/terminal-ipc";
import type { OperationalEventLog } from "./operational-events";
import type { IpcEvent, IpcMainPort } from "./terminal-ipc-types";
import { registerTrustedHandlers } from "./trusted-ipc";
import { mainTranslator } from "./main-translator";

export const MAX_SAVED_OUTPUT_LENGTH = 64 * 1024 * 1024;

// "Save Output to File…": the renderer sends a pane's text; main asks where
// to save it in a native dialog and writes a private (0600) file. Nothing is
// saved without that choice.
export function startOutputFiles(options: {
  readonly ipcMain: IpcMain;
  readonly isTrustedSender: (event: IpcEvent) => boolean;
  readonly operationalEvents: Pick<OperationalEventLog, "write">;
}): () => void {
  return registerTrustedHandlers(
    options.ipcMain as unknown as IpcMainPort,
    options.isTrustedSender,
    {
      [terminalIpc.saveOutput]: async (event, payload) => {
        if (
          typeof payload !== "string" ||
          payload.length === 0 ||
          payload.length > MAX_SAVED_OUTPUT_LENGTH
        )
          throw new TypeError("Invalid terminal output");
        const stamp = new Date()
          .toISOString()
          .replace(/[-:]/gu, "")
          .replace("T", "-")
          .slice(0, 15);
        const settings = {
          defaultPath: path.join(
            app.getPath("documents"),
            `omxterm-output-${stamp}.txt`,
          ),
          filters: [
            {
              name: mainTranslator().t("dialog.textFilter"),
              extensions: ["txt", "log"],
            },
          ],
        };
        const window = BrowserWindow.fromWebContents(
          event.sender as unknown as WebContents,
        );
        const choice = await (window
          ? dialog.showSaveDialog(window, settings)
          : dialog.showSaveDialog(settings));
        if (choice.canceled || !choice.filePath) return null;
        await writeFile(choice.filePath, `${payload}\n`, { mode: 0o600 });
        return path.basename(choice.filePath);
      },
    },
    () =>
      options.operationalEvents.write({
        name: "boundary.rejected",
        boundary: "ipc",
        reason: "untrusted-sender",
      }),
  );
}
