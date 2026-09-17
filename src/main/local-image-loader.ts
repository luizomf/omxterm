import { dialog, nativeImage, type BrowserWindow } from "electron";
import type { LocalImageData, LocalImageRequest } from "../shared/local-image";
import { loadLocalImageRequest, readLocalImage } from "./local-image";

export async function loadLocalImageForWindow(
  window: BrowserWindow,
  request: LocalImageRequest,
  abortSignal: AbortSignal,
): Promise<LocalImageData | null> {
  try {
    return await loadLocalImageRequest(request, {
      platform: process.platform,
      abortSignal,
      async chooseFile() {
        const result = await dialog.showOpenDialog(window, {
          title: "Open Local Image",
          properties: ["openFile", "dontAddToRecent"],
          filters: [
            {
              name: "PNG and JPEG Images",
              extensions: ["png", "jpg", "jpeg"],
            },
            { name: "All Files", extensions: ["*"] },
          ],
        });
        return result.canceled || result.filePaths.length !== 1
          ? null
          : result.filePaths[0]!;
      },
      read: (filePath) =>
        readLocalImage(filePath, {
          platform: process.platform,
          validateDecodedImage(bytes, expected) {
            const decoded = nativeImage.createFromBuffer(
              Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength),
            );
            const size = decoded.getSize();
            return (
              !decoded.isEmpty() &&
              size.width === expected.width &&
              size.height === expected.height
            );
          },
        }),
    });
  } catch {
    if (abortSignal.aborted)
      throw new Error("Local image request was superseded");
    // Native filesystem errors often include the selected path. Keep that
    // private value out of the renderer-facing IPC rejection.
    throw new Error("The local image could not be loaded");
  }
}
