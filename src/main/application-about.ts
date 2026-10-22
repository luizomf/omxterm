import type { App } from "electron";

export const APPLICATION_AUTHORS = [
  "Luiz Otávio Miranda",
  "Rafael Ruscher <rruscher@gmail.com>",
] as const;
export const APPLICATION_WEBSITE = "https://github.com/ruscher/omxterm";

export function configureApplicationAbout(
  app: Pick<App, "getVersion" | "setAboutPanelOptions">,
  iconPath: string,
  platform: string = process.platform,
): void {
  if (platform !== "linux" && platform !== "win32") return;
  // Linux has no metadata defaults; Windows otherwise uses executable-resource
  // version text and a generic information icon. Keep macOS bundle defaults.
  // Electron shows authors and the website on Linux, credits on Windows.
  app.setAboutPanelOptions({
    applicationName: "OMXTerm",
    applicationVersion: app.getVersion(),
    copyright: "Copyright © 2026 Luiz Otávio Miranda",
    iconPath,
    ...(platform === "linux"
      ? { authors: [...APPLICATION_AUTHORS], website: APPLICATION_WEBSITE }
      : { credits: `Contributors: ${APPLICATION_AUTHORS.join(", ")}` }),
  });
}
