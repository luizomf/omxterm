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
let moveFixture = false;
let setVisibility!: (visible: boolean) => void;
let focusIntent!: (intent: "search" | "restore") => void;
let holdList = false;
let releaseList: (() => void) | undefined;
let fillEmpty = false;
let holdDelete = false;
let releaseDelete: (() => void) | undefined;
let holdMove = false;
let releaseMove: (() => void) | undefined;
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
    if (request.operation === "list") {
      if (holdList) {
        holdList = false;
        await new Promise<void>((resolve) => {
          releaseList = resolve;
        });
      }
      if (request.path === "/error") return { ok: false, error: "permission" };
      return {
        ok: true,
        directory: request.path!,
        rows: moveFixture
          ? request.path === "/root"
            ? [
                { name: "source", kind: "file", size: 1 },
                { name: "folder", kind: "directory", size: 0 },
                { name: "container", kind: "directory", size: 0 },
                { name: "alias", kind: "link", size: 0 },
                { name: `long-${"x".repeat(200)}`, kind: "directory", size: 0 },
              ]
            : request.path === "/root/container"
              ? [{ name: "child", kind: "directory", size: 0 }]
              : []
          : request.path === "/empty"
            ? fillEmpty
              ? [{ name: "arrived", kind: "file", size: 1 }]
              : []
            : dotfiles
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
                    request.path === "/other"
                      ? `other-${index}`
                      : `item-${index}`,
                  kind: "file",
                  size: 1,
                })),
      };
    }
    if (request.operation === "prepare-move-into") {
      const move = value as { path: string; directory: string };
      if (holdMove) {
        holdMove = false;
        await new Promise<void>((resolve) => {
          releaseMove = resolve;
        });
      }
      return {
        ok: true,
        path: move.path,
        directory: move.directory,
        token: "fixture-move-token",
      };
    }
    if (request.operation === "prepare-delete") {
      if (request.path === undefined) throw new Error("Missing fixture path");
      if (holdDelete) {
        holdDelete = false;
        await new Promise<void>((resolve) => {
          releaseDelete = resolve;
        });
      }
      return { ok: true, path: request.path, token: "fixture-token" };
    }
    return { ok: true };
  },
  onVisibility(listener: typeof setVisibility) {
    setVisibility = listener;
    listener(true);
    return () => {};
  },
  onFocusIntent(listener: typeof focusIntent) {
    focusIntent = listener;
    return () => {};
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
    setVisibility,
    focusIntent,
    requests,
    holdNextList() {
      releaseList = undefined;
      holdList = true;
    },
    listHeld() {
      return !!releaseList;
    },
    releaseList() {
      const release = releaseList;
      releaseList = undefined;
      release?.();
    },
    fillEmptyOnRefresh() {
      fillEmpty = true;
      releaseList = undefined;
      holdList = true;
      document
        .querySelector<HTMLButtonElement>(
          '[aria-describedby="files-toolbar-refresh-tooltip"]',
        )!
        .click();
    },
    holdNextMove() {
      releaseMove = undefined;
      holdMove = true;
    },
    moveHeld() {
      return !!releaseMove;
    },
    releaseMove() {
      const release = releaseMove;
      releaseMove = undefined;
      release?.();
    },
    holdNextDelete() {
      releaseDelete = undefined;
      holdDelete = true;
    },
    deleteHeld() {
      return !!releaseDelete;
    },
    releaseDelete() {
      const release = releaseDelete;
      releaseDelete = undefined;
      release?.();
    },
    useMoveFixture() {
      moveFixture = true;
      document
        .querySelector<HTMLButtonElement>(
          '[aria-describedby="files-toolbar-refresh-tooltip"]',
        )!
        .click();
    },
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
