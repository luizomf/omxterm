import { dialog, type BrowserWindow } from "electron";
import type { CatalogRelease } from "./extension-catalog";
import type { createExtensionManager } from "./extension-manager";
import { translatorFor, type Translator } from "../shared/i18n";

export async function installExtensionFromDialog(
  window: BrowserWindow,
  manager: ReturnType<typeof createExtensionManager>,
  stopping: () => boolean,
  translator: () => Translator = () => translatorFor("en-US"),
  captured?: Buffer,
  expected?: CatalogRelease,
) {
  const owner = window.webContents;
  const cancelled = () => manager.cancel(owner);
  // Captured bytes come from the link installer, which owns cancellation
  // through acquisition and consent. Only the standalone local chooser needs
  // its own destruction listener; both paths still discard consent in finally.
  if (!captured) owner.once("destroyed", cancelled);
  try {
    const selected = captured
      ? undefined
      : await dialog.showOpenDialog(window, {
          title: translator().t("extensions.chooserTitle"),
          properties: ["openFile"],
          filters: [
            {
              name: translator().t("extensions.chooserType"),
              extensions: ["omxext"],
            },
          ],
        });
    if (selected?.canceled || owner.isDestroyed() || stopping()) return false;
    const preview = await manager.prepare(
      owner,
      captured ?? selected!.filePaths[0]!,
      expected,
    );
    if (owner.isDestroyed() || stopping()) return false;
    // The catalog source (`expected`) is pinned by digest and verified in
    // prepare(), so official installs get a short confirm. File and link
    // installs keep the package id and digest visible: the user is the check.
    const detail = expected
      ? translator().t("extensions.trustOfficialDetail") +
        (preview.catalogAction === "replace"
          ? "\n\n" + translator().t("extensions.catalogReplaceWarning")
          : "")
      : translator().t("extensions.trustDetail", {
          id: preview.manifest.id,
          digest: preview.digest,
        });
    const consent = await dialog.showMessageBox(window, {
      type: expected ? "question" : "warning",
      title: translator().t("extensions.trustTitle"),
      message: translator().t("extensions.trustMessage", {
        name: expected
          ? preview.manifest.name
          : `${preview.manifest.name} ${preview.manifest.version}`,
      }),
      detail,
      buttons: [
        translator().t("common.cancel"),
        translator().t("extensions.trustInstall"),
      ],
      defaultId: 0,
      cancelId: 0,
    });
    if (consent.response !== 1 || owner.isDestroyed() || stopping())
      return false;
    await manager.approve(owner, preview.token);
    return true;
  } finally {
    cancelled();
    if (!captured) owner.removeListener("destroyed", cancelled);
  }
}
