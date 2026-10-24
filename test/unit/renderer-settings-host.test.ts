// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { mountTerminalWindowPage } from "../../src/renderer/terminal-window-host";
import type { SettingsSnapshot } from "../../src/shared/settings";

const snapshot: SettingsSnapshot = {
  configurationPath: "/synthetic/omxterm/config.json",
  platform: "linux",
  revision: "absent",
  text: null,
  values: { "font.family": "" },
};

it("owns input while open: blocks terminal actions and edits its own field", async () => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  const hasFocus = vi.spyOn(document, "hasFocus").mockReturnValue(true);
  let openSettings!: () => void;
  let openAbout!: () => void;
  let clipboardAction!: (action: "copy" | "paste" | "select-all") => void;
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
        readText: vi.fn(async () => "Installed Mono"),
        writeText: vi.fn(async () => {}),
        confirmPaste: vi.fn(async () => true),
        requestContextMenu: vi.fn(),
      },
      settings: {
        snapshot: vi.fn(async () => snapshot),
        change: vi.fn(),
        saveText: vi.fn(),
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
    expect(document.querySelector(".about-dialog")).toBeNull();

    const family = [...document.querySelectorAll("label")]
      .find((row) => row.textContent?.startsWith("Font family"))!
      .querySelector("input")!;
    family.focus();
    clipboardAction("paste");
    find();
    tabCommand({ action: "new" });
    await vi.waitFor(() => expect(family.value).toBe("Installed Mono"));
    expect(surface.paste).not.toHaveBeenCalled();
    expect(surface.find).not.toHaveBeenCalled();
    expect(createAdapter).toHaveBeenCalledOnce();
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
