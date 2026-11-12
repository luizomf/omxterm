import type { CompanionToolAction } from "../shared/terminal-keybinds";
import type { HostedPresentationKind } from "../shared/extension-view";
import type { PackageManifest } from "../installed-packages/installed-packages";

export function companionToolShortcut(
  manifest: Pick<PackageManifest, "id" | "view">,
): CompanionToolAction | undefined {
  if (manifest.view?.action !== `${manifest.id}.open`) return undefined;
  if (manifest.id === "omxterm.files") return "toggleFiles";
  if (manifest.id === "omxterm.ssh") return "toggleSshConnect";
  return undefined;
}

// Presentation policy for the official views: companion tools dock in the
// panel and short setup floats as a dialog over the tab. This selects layout,
// not publisher identity or capabilities; ordinary package trust still applies.
export function extensionPresentation(
  manifest: Pick<PackageManifest, "id" | "view">,
): HostedPresentationKind | undefined {
  if (manifest.view?.action !== `${manifest.id}.open`) return undefined;
  if (
    ["omxterm.files", "omxterm.ssh", "omxterm.snippets"].includes(manifest.id)
  )
    return "panel";
  if (manifest.id === "omxterm.mirror-typing") return "dialog";
  return undefined;
}
