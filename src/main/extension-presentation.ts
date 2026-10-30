import type { PackageManifest } from "../installed-packages/installed-packages";

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
