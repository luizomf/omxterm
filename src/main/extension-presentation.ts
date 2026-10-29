import type { PackageManifest } from "../installed-packages/installed-packages";

// Presentation policy for the existing companion tools. This selects layout,
// not publisher identity or capabilities; ordinary package trust still applies.
export function extensionPresentation(
  manifest: Pick<PackageManifest, "id" | "view">,
): "panel" | undefined {
  return (manifest.id === "omxterm.files" || manifest.id === "omxterm.ssh") &&
    manifest.view?.action === `${manifest.id}.open`
    ? "panel"
    : undefined;
}
