import type { App } from "electron";

export function configureApplicationAbout(
  app: Pick<App, "getVersion" | "setAboutPanelOptions">,
  iconPath: string,
  platform: string = process.platform,
): void {
  if (platform !== "linux") return;
  // Linux's native About panel has no metadata defaults. Leave the other
  // platforms' native panels unchanged instead of overriding their defaults.
  app.setAboutPanelOptions({
    applicationName: "OMXTerm",
    applicationVersion: app.getVersion(),
    copyright: "Copyright © 2026 Luiz Otávio Miranda",
    iconPath,
  });
}
