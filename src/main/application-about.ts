import type { App } from "electron";

export const APPLICATION_AUTHORS = [
  "Luiz Otávio Miranda <luizomf@gmail.com>",
  "Rafael Ruscher <rruscher@gmail.com>",
] as const;
export const APPLICATION_WEBSITE = "https://github.com/luizomf/omxterm";
// The reversed C of copyleft (U+1F12F). A display text only: the license is
// still MIT (see LICENSE).
export const APPLICATION_COPYLEFT = "Copyleft 🄯 2026";
export const APPLICATION_ISSUES = "https://github.com/luizomf/omxterm/issues";
export const MIT_LICENSE_URL = "https://opensource.org/license/mit";

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
    copyright: APPLICATION_COPYLEFT,
    iconPath,
    ...(platform === "linux"
      ? { authors: [...APPLICATION_AUTHORS], website: APPLICATION_WEBSITE }
      : { credits: `Contributors: ${APPLICATION_AUTHORS.join(", ")}` }),
  });
}
