import type { App } from "electron";

export function configureApplicationAbout(
  app: Pick<App, "getVersion" | "setAboutPanelOptions">,
  iconPath: string,
  platform: string = process.platform,
): void {
  if (platform !== "linux" && platform !== "win32") return;
  // Linux has no metadata defaults; Windows otherwise uses executable-resource
  // version text and a generic information icon. Keep macOS bundle defaults.
  app.setAboutPanelOptions({
    applicationName: "OMXTerm",
    applicationVersion: app.getVersion(),
    copyright: "Copyright © 2026 Luiz Otávio Miranda",
    iconPath,
  });
}
