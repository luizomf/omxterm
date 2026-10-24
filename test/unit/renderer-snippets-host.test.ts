// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { mountTerminalWindowPage } from "../../src/renderer/terminal-window-host";
import type { TerminalTabCommand } from "../../src/shared/terminal-contract";
import type { TerminalSnippetsResponse } from "../../src/shared/terminal-snippets";
import type { LocalImageData } from "../../src/shared/local-image";

const cleanups: Array<() => void> = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});
async function fixture() {
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open");
  };
  const content = document.createElement("div"),
    root = document.createElement("aside"),
    tabsContainer = document.createElement("main"),
    tabStrip = document.createElement("nav");
  content.append(tabsContainer, root);
  document.body.append(tabStrip, content);
  vi.spyOn(content, "getBoundingClientRect").mockReturnValue({
    width: 1000,
  } as DOMRect);
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  let toggle!: () => void, about!: () => void, image!: () => void;
  let clipboardAction!: (action: "copy" | "paste" | "select-all") => void;
  let tabCommand!: (command: TerminalTabCommand) => void;
  let tabBar!: () => void;
  const clipboard = {
    readText: vi.fn(async () => "pasted\nquery"),
    writeText: vi.fn(async () => {}),
    confirmPaste: vi.fn(async () => false),
    requestContextMenu: vi.fn(),
  };
  const surfaces: ReturnType<typeof surface>[] = [];
  function surface() {
    const input = document.createElement("textarea");
    tabsContainer.append(input);
    return {
      dispose: vi.fn(),
      focus: vi.fn(() => input.focus()),
      applyTheme: vi.fn(),
      applyConfiguration: vi.fn(),
      inject: vi.fn(async () => {}),
      zoom: vi.fn(),
      copy: vi.fn(async () => {}),
      paste: vi.fn(async () => {}),
      selectAll: vi.fn(),
      find: vi.fn(),
    };
  }
  const adapters = vi.fn(() => ({
    sessionId: () => `s${surfaces.length}`,
    start: async () => {},
    write: vi.fn(),
    resize: vi.fn(),
    close: vi.fn(),
  }));
  const load = vi
    .fn<() => Promise<TerminalSnippetsResponse>>()
    .mockResolvedValue({
      snippets: [{ name: "literal", body: " a  b\n$VALUE\n", execute: true }],
    });
  const loadImage = vi
    .fn<() => Promise<LocalImageData | null>>()
    .mockResolvedValue(null);
  const host = mountTerminalWindowPage(
    { tabsContainer, tabStrip },
    {
      page: window,
      createAdapter: adapters,
      mount: async () => {
        const value = surface();
        surfaces.push(value);
        return value;
      },
      clipboard,
      snippets: {
        element: root,
        load,
        subscribeToToggle(listener) {
          toggle = listener;
          return vi.fn();
        },
      },
      subscribeToClipboardActions(listener) {
        clipboardAction = listener;
        return vi.fn();
      },
      subscribeToTabCommands(listener) {
        tabCommand = listener;
        return vi.fn();
      },
      subscribeToTabBarToggle(listener) {
        tabBar = listener;
        return vi.fn();
      },
      about: {
        info: async () => ({ name: "OMXTerm", version: "1", copyright: "MIT" }),
        openLink: async () => {},
        onOpen(listener) {
          about = listener;
          return vi.fn();
        },
      },
      loadLocalImage: loadImage,
      subscribeToLocalImageOpen(listener) {
        image = listener;
        return vi.fn();
      },
    },
  );
  cleanups.push(host.dispose);
  await host.ready;
  return {
    root,
    host,
    toggle,
    about,
    image,
    load,
    loadImage,
    clipboard,
    clipboardAction,
    tabCommand,
    tabBar,
    surfaces,
    adapters,
  };
}

it("routes native action subscriptions to panel text, retains passive focus, and preserves exact selected injection", async () => {
  const f = await fixture();
  f.tabCommand({ action: "new" });
  await vi.waitFor(() => expect(f.surfaces).toHaveLength(2));
  f.toggle();
  const input = f.root.querySelector("input")!;
  expect(document.activeElement).toBe(input);
  window.dispatchEvent(new Event("focus"));
  f.tabBar();
  expect(document.activeElement).toBe(input);
  input.value = "query";
  input.select();
  f.clipboardAction("copy");
  expect(f.clipboard.writeText).toHaveBeenCalledWith("query");
  f.clipboardAction("paste");
  await vi.waitFor(() => expect(input.value).toBe("pasted query"));
  f.clipboardAction("select-all");
  expect(input.selectionEnd).toBe(input.value.length);
  for (const surface of f.surfaces) {
    expect(surface.copy).not.toHaveBeenCalled();
    expect(surface.paste).not.toHaveBeenCalled();
    expect(surface.selectAll).not.toHaveBeenCalled();
    expect(surface.inject).not.toHaveBeenCalled();
  }
  input.value = "";
  input.dispatchEvent(new Event("input"));
  await vi.waitFor(() =>
    expect(f.root.querySelector("li button")).not.toBeNull(),
  );
  f.root.querySelector<HTMLButtonElement>("li button")!.click();
  expect(f.surfaces[1]!.inject).toHaveBeenCalledExactlyOnceWith(
    " a  b\n$VALUE\n",
    { submit: true },
  );
  expect(f.surfaces[0]!.inject).not.toHaveBeenCalled();
  expect(f.adapters).toHaveBeenCalledTimes(2);
  f.clipboardAction("paste");
  expect(f.surfaces[1]!.paste).toHaveBeenCalledOnce();
});

it.each(["About", "image"])(
  "retains loading panel inert under %s and preserves overlay focus/cancellation",
  async (kind) => {
    const f = await fixture();
    let complete!: (value: TerminalSnippetsResponse) => void;
    f.load.mockImplementation(
      () =>
        new Promise((resolve) => {
          complete = resolve;
        }),
    );
    let cancelImage!: (value: null) => void;
    f.loadImage.mockImplementation(
      () =>
        new Promise((resolve) => {
          cancelImage = resolve;
        }),
    );
    f.toggle();
    await vi.waitFor(() => expect(complete).toBeDefined());
    const focusCalls = f.surfaces[0]!.focus.mock.calls.length;
    if (kind === "About") f.about();
    else f.image();
    expect(f.root.inert).toBe(true);
    expect(f.root.hidden).toBe(false);
    complete({ snippets: [{ name: "fresh", body: "fresh", execute: false }] });
    await vi.waitFor(() =>
      expect(f.root.querySelector("li button")).not.toBeNull(),
    );
    f.root.querySelector<HTMLButtonElement>("li button")!.click();
    f.root.querySelector<HTMLButtonElement>("header button")!.click();
    f.toggle();
    f.clipboardAction("paste");
    window.dispatchEvent(new Event("focus"));
    expect(f.root.hidden).toBe(false);
    expect(f.surfaces[0]!.inject).not.toHaveBeenCalled();
    expect(f.surfaces[0]!.paste).not.toHaveBeenCalled();
    expect(f.surfaces[0]!.focus).toHaveBeenCalledTimes(focusCalls);
    if (kind === "About")
      document.querySelector<HTMLButtonElement>(".about-close")!.click();
    else cancelImage(null);
    await vi.waitFor(() => expect(f.root.inert).toBe(false));
    expect(f.surfaces[0]!.focus).toHaveBeenCalledTimes(focusCalls + 1);
    expect(f.load).toHaveBeenCalledOnce();
  },
);
