import { mountFilesPage } from "../../extensions/files/page.js";
import { mountHostedAppearance } from "../../extensions/shared/appearance.js";
import type { SupportedLanguage } from "../../src/shared/i18n.js";

let setLanguage!: (language: SupportedLanguage) => void;
let setAppearance!: (appearance: {
  background: string;
  foreground: string;
  opacity: number;
}) => void;
let homeFailure = false;
let dotfiles = false;
const requests: { operation: string; path?: string }[] = [];
const bridge = {
  async request(value: unknown) {
    const request = value as { operation: string; path?: string };
    requests.push(request);
    if (request.operation === "home") {
      if (homeFailure) {
        homeFailure = false;
        return { ok: false, error: "permission" };
      }
      return { ok: true, directory: "/root" };
    }
    if (request.operation === "list")
      return {
        ok: true,
        directory: request.path!,
        rows: dotfiles
          ? request.path === "/root/.config"
            ? [
                { name: ".private", kind: "file", size: 1 },
                { name: "settings", kind: "file", size: 1 },
              ]
            : [
                { name: ".config", kind: "directory", size: 0 },
                { name: ".profile", kind: "file", size: 1 },
                { name: "visible", kind: "file", size: 1 },
              ]
          : Array.from({ length: 40 }, (_, index) => ({
              name:
                request.path === "/other" ? `other-${index}` : `item-${index}`,
              kind: "file",
              size: 1,
            })),
      };
    return { ok: true };
  },
  onLanguage(listener: typeof setLanguage) {
    setLanguage = listener;
    listener("en-US");
    return () => {};
  },
  onAppearance(listener: typeof setAppearance) {
    setAppearance = listener;
    listener({ background: "#101218", foreground: "#f4f4f4", opacity: 1 });
    return () => {};
  },
};
mountHostedAppearance(document, bridge);
const page = mountFilesPage(document, bridge);
Object.assign(window, {
  filesFixture: {
    ready: page.ready,
    setLanguage,
    setAppearance,
    requests,
    useDotfiles() {
      dotfiles = true;
      document
        .querySelector<HTMLButtonElement>(
          '[aria-describedby="files-toolbar-refresh-tooltip"]',
        )!
        .click();
    },
    failNextHome() {
      homeFailure = true;
    },
  },
});
