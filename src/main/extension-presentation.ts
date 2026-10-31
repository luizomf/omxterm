import type { CompanionToolAction } from "../shared/terminal-keybinds";
import type { PackageManifest } from "../installed-packages/installed-packages";

export function companionToolShortcut(
  manifest: Pick<PackageManifest, "id" | "view">,
): CompanionToolAction | undefined {
  if (manifest.view?.action !== `${manifest.id}.open`) return undefined;
  if (manifest.id === "omxterm.files") return "toggleFiles";
  if (manifest.id === "omxterm.ssh") return "toggleSshConnect";
  return undefined;
}

// Presentation policy for the existing companion tools. This selects layout,
// not publisher identity or capabilities; ordinary package trust still applies.
export function extensionPresentation(
  manifest: Pick<PackageManifest, "id" | "view">,
): "panel" | undefined {
  return ["omxterm.files", "omxterm.ssh", "omxterm.snippets"].includes(
    manifest.id,
  ) && manifest.view?.action === `${manifest.id}.open`
    ? "panel"
    : undefined;
}
