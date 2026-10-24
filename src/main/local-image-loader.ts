import { dialog, nativeImage, type BrowserWindow } from "electron";
import type { LocalImageData, LocalImageRequest } from "../shared/local-image";
import {
  DEFAULT_LANGUAGE,
  translatorFor,
  type Translator,
} from "../shared/i18n";
import {
  loadLocalImageRequest,
  readLocalImage,
  UnsupportedLocalImageFormatError,
} from "./local-image";

export async function loadLocalImageForWindow(
  window: BrowserWindow,
  request: LocalImageRequest,
  abortSignal: AbortSignal,
  { t }: Translator = translatorFor(DEFAULT_LANGUAGE),
): Promise<LocalImageData | null> {
  try {
    return await loadLocalImageRequest(request, {
      platform: process.platform,
      abortSignal,
      async chooseDirectory(homeDirectory) {
        const result = await dialog.showOpenDialog(window, {
          title: t("dialog.imageBaseFolder"),
          defaultPath: homeDirectory,
          properties: ["openDirectory", "dontAddToRecent"],
        });
        return result.canceled || result.filePaths.length !== 1
          ? null
          : result.filePaths[0]!;
      },
      async chooseFile() {
        const result = await dialog.showOpenDialog(window, {
          title: t("dialog.openLocalImage"),
          properties: ["openFile", "dontAddToRecent"],
          filters: [
            {
              name: t("dialog.imageFilter"),
              extensions: ["png", "jpg", "jpeg"],
            },
            { name: t("dialog.allFiles"), extensions: ["*"] },
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
  } catch (error) {
    if (abortSignal.aborted)
      throw new Error("Local image request was superseded");
    if (error instanceof UnsupportedLocalImageFormatError) throw error;
    // Native filesystem errors often include the selected path. Keep that
    // private value out of the renderer-facing IPC rejection.
    throw new Error("The local image could not be loaded");
  }
}
