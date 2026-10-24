// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { mountTerminalWindowPage } from "../../src/renderer/terminal-window-host";
import type { TerminalTabCommand } from "../../src/shared/terminal-contract";
import type { TerminalSurface } from "../../src/terminal-surface/terminal-surface";

it("keeps About focused across startup and menu actions while allowing close and disposal", async () => {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  const hasFocus = vi.spyOn(document, "hasFocus").mockReturnValue(true);
  let opened!: () => void;
  let clipboard!: (action: "copy" | "paste" | "select-all") => void;
  let tabCommand!: (command: TerminalTabCommand) => void;
  let imageOpen!: () => void;
  let find!: () => void;
  let finishMount!: (surface: TerminalSurface) => void;
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
  const adapters = vi.fn(() => ({
    sessionId: () => "s1",
    start: async () => {},
    write: vi.fn(),
    resize: vi.fn(),
    close: vi.fn(),
  }));
  const removeOpen = vi.fn();
  const loadLocalImage = vi.fn(async () => null);
  const tabStrip = document.createElement("nav");
  const tabsContainer = document.createElement("main");
  document.body.replaceChildren(tabStrip, tabsContainer);
  const host = mountTerminalWindowPage(
    { tabStrip, tabsContainer },
    {
      page: window,
      createAdapter: adapters,
      mount: () =>
        new Promise((resolve) => {
          finishMount = resolve;
        }),
      about: {
        info: async () => ({ name: "OMXTerm", version: "1", copyright: "MIT" }),
        openLink: async () => {},
        onOpen: (listener) => {
          opened = listener;
          return removeOpen;
        },
      },
      subscribeToClipboardActions: (listener) => {
        clipboard = listener;
        return () => {};
      },
      subscribeToTabCommands: (listener) => {
        tabCommand = listener;
        return () => {};
      },
      subscribeToFind: (listener) => {
        find = listener;
        return () => {};
      },
      loadLocalImage,
      subscribeToLocalImageOpen: (listener) => {
        imageOpen = listener;
        return () => {};
      },
    },
  );
  try {
    opened();
    finishMount(surface);
    await host.ready;
    expect(surface.focus).not.toHaveBeenCalled();
    window.dispatchEvent(new Event("focus"));
    clipboard("paste");
    find();
    tabCommand({ action: "new" });
    imageOpen();
    expect(surface.focus).not.toHaveBeenCalled();
    expect(surface.paste).not.toHaveBeenCalled();
    expect(surface.find).not.toHaveBeenCalled();
    expect(adapters).toHaveBeenCalledOnce();
    expect(loadLocalImage).not.toHaveBeenCalled();
    document.querySelector<HTMLButtonElement>(".about-close")!.click();
    expect(surface.focus).toHaveBeenCalledOnce();
    find();
    expect(surface.find).toHaveBeenCalledOnce();
    opened();
    tabCommand({ action: "close" });
    expect(surface.dispose).toHaveBeenCalledOnce();
    host.dispose();
    expect(removeOpen).toHaveBeenCalledOnce();
    expect(document.querySelector("dialog")).toBeNull();
  } finally {
    host.dispose();
    hasFocus.mockRestore();
  }
});
