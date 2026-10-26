// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { mountTerminalWindowPage } from "../../src/renderer/terminal-window-host";
import type { TerminalContextMenuTarget } from "../../src/shared/terminal-contract";
import type {
  SettingsChange,
  SettingsResult,
  SettingsSnapshot,
} from "../../src/shared/settings";

const snapshot: SettingsSnapshot = {
  configurationPath: "/synthetic/omxterm/config.json",
  platform: "linux",
  revision: "absent",
  text: null,
  values: { "font.family": "" },
};

it("owns selected graphical input, allows tab creation and restores Settings below About", async () => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  const hasFocus = vi.spyOn(document, "hasFocus").mockReturnValue(true);
  let openSettings!: () => void;
  let openAbout!: () => void;
  let clipboardAction!: (
    action: "copy" | "paste" | "select-all",
    target?: TerminalContextMenuTarget,
  ) => void;
  const readClipboard = vi.fn(async () => "Installed Mono");
  let find!: () => void;
  let tabCommand!: (command: { action: "new" }) => void;
  const createAdapter = vi.fn(() => ({
    sessionId: () => "s1",
    start: async () => {},
    write: vi.fn(),
    resize: vi.fn(),
    close: vi.fn(),
  }));
  const surface = {
    geometry: () => undefined,
    dispose: vi.fn(),
    focus: vi.fn(),
    applyTheme: vi.fn(),
    applyConfiguration: vi.fn(),
    inject: vi.fn(async () => {}),
    zoom: vi.fn(),
    copy: vi.fn(async () => {}),
    paste: vi.fn(async () => {}),
    selectAll: vi.fn(),
    find: vi.fn(),
  };
  const change = vi.fn(
    async (change: SettingsChange): Promise<SettingsResult> => ({
      status: "saved",
      snapshot: {
        ...snapshot,
        revision: "saved",
        values: { ...snapshot.values, [change.path]: change.value },
      },
      application: { applied: true, notices: [] },
      lifetimes: ["restart"],
    }),
  );
  const tabStrip = document.createElement("nav");
  const tabsContainer = document.createElement("main");
  document.body.replaceChildren(tabStrip, tabsContainer);
  const host = mountTerminalWindowPage(
    { tabStrip, tabsContainer },
    {
      page: window,
      createAdapter,
      mount: async () => surface,
      clipboard: {
        readText: readClipboard,
        writeText: vi.fn(async () => {}),
        confirmPaste: vi.fn(async () => true),
        requestContextMenu: vi.fn(),
      },
      settings: {
        snapshot: vi.fn(async () => snapshot),
        change,
        saveText: vi.fn(),
        changeKeybind: vi.fn(),
        captureShortcut: vi.fn(() => () => {}),
        onOpen: (listener) => {
          openSettings = listener;
          return () => {};
        },
      },
      about: {
        info: async () => ({ name: "OMXTerm", version: "1", copyright: "MIT" }),
        openLink: async () => {},
        onOpen: (listener) => {
          openAbout = listener;
          return () => {};
        },
      },
      subscribeToClipboardActions: (listener) => {
        clipboardAction = listener;
        return () => {};
      },
      subscribeToFind: (listener) => {
        find = listener;
        return () => {};
      },
      subscribeToTabCommands: (listener) => {
        tabCommand = listener;
        return () => {};
      },
    },
  );
  try {
    await host.ready;
    surface.focus.mockClear();
    openSettings();
    await vi.waitFor(() =>
      expect(document.querySelector('[role="tab"]')).not.toBeNull(),
    );
    openAbout();
    expect(document.querySelector(".about-dialog")).not.toBeNull();
    expect(tabsContainer.inert).toBe(true);
    document.querySelector<HTMLButtonElement>(".about-close")!.click();
    expect(tabsContainer.inert).toBe(false);
    document
      .querySelector<HTMLButtonElement>("#settings-tab-appearance")!
      .click();

    const family = [...document.querySelectorAll("label")]
      .find((row) => row.textContent?.startsWith("Font family"))!
      .querySelector("input")!;
    family.focus();
    // A retained terminal popup must not migrate into a modal's text field.
    clipboardAction("paste", { sessionId: "s1", menuId: 1 });
    await Promise.resolve();
    expect(readClipboard).not.toHaveBeenCalled();
    expect(family.value).toBe("");
    clipboardAction("paste");
    find();
    await vi.waitFor(() => expect(family.value).toBe("Installed Mono"));
    expect(change).toHaveBeenCalledExactlyOnceWith({
      path: "font.family",
      value: "Installed Mono",
    });
    expect(surface.paste).not.toHaveBeenCalled();
    expect(surface.find).not.toHaveBeenCalled();
    tabCommand({ action: "new" });
    await vi.waitFor(() => expect(createAdapter).toHaveBeenCalledTimes(2));
    openSettings();
    family.focus();
    surface.focus.mockClear();
    window.dispatchEvent(new Event("focus"));
    expect(surface.focus).not.toHaveBeenCalled();

    document.querySelector<HTMLButtonElement>(".settings-close")!.click();
    expect(surface.focus).toHaveBeenCalledOnce();
    clipboardAction("paste");
    expect(surface.paste).toHaveBeenCalledOnce();
  } finally {
    host.dispose();
    hasFocus.mockRestore();
  }
  expect(document.querySelector(".settings-dialog")).toBeNull();
});
