import { nativeImage, type IpcMain } from "electron";
import { homedir } from "node:os";
import { isFilePath } from "../shared/file-browser";
import { filePeekIpc } from "../shared/file-peek";
import { peekFile } from "./file-peek";
import type { OperationalEventLog } from "./operational-events";
import type { IpcEvent, IpcMainPort } from "./terminal-ipc-types";
import { registerTrustedHandlers } from "./trusted-ipc";

// Hover previews of files named in the terminal. The window sends a local
// absolute path it resolved against the pane's folder; main reads a bounded
// sample and never runs the file.
export function startFilePeek(options: {
  readonly ipcMain: IpcMain;
  readonly isTrustedSender: (event: IpcEvent) => boolean;
  readonly operationalEvents: Pick<OperationalEventLog, "write">;
}): void {
  const dependencies = {
    platform: process.platform,
    environment: process.env,
    homeDirectory: homedir(),
    decodeImage(bytes: Uint8Array, side: number) {
      const image = nativeImage.createFromBuffer(Buffer.from(bytes));
      if (image.isEmpty()) return undefined;
      const { width, height } = image.getSize();
      const scale = Math.min(1, side / Math.max(width, height));
      const scaled =
        scale < 1
          ? image.resize({
              width: Math.max(1, Math.round(width * scale)),
              height: Math.max(1, Math.round(height * scale)),
              quality: "good",
            })
          : image;
      return { width, height, png: new Uint8Array(scaled.toPNG()) };
    },
    ...(process.platform === "darwin" || process.platform === "win32"
      ? {
          async systemThumbnail(filePath: string, side: number) {
            const image = await nativeImage.createThumbnailFromPath(filePath, {
              width: side,
              height: side,
            });
            return image.isEmpty() ? undefined : new Uint8Array(image.toPNG());
          },
        }
      : {}),
  };
  registerTrustedHandlers(
    options.ipcMain as unknown as IpcMainPort,
    options.isTrustedSender,
    {
      [filePeekIpc.peek]: async (_event, payload) => {
        if (!isFilePath(payload)) throw new TypeError("Invalid file path");
        return (await peekFile(payload, dependencies)) ?? null;
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
