// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountTerminalWindowPage } from "../../src/renderer/terminal-window-host";
import type { TerminalSurfaceOptions } from "../../src/terminal-surface/terminal-surface";
import type { LocalImageData } from "../../src/shared/local-image";
import type { TerminalRendererConfiguration } from "../../src/shared/user-configuration";
import { DEFAULT_TERMINAL_THEME } from "../../src/shared/terminal-theme";
import type {
  TerminalFontZoom,
  TerminalTabCommand,
} from "../../src/shared/terminal-contract";

const image: LocalImageData = {
  name: "fixture.png",
  mime: "image/png",
  width: 1,
  height: 1,
  data: new Uint8Array([1]),
};

afterEach(() => vi.restoreAllMocks());

function mockImageDialog() {
  if (!("decode" in HTMLImageElement.prototype))
    Object.defineProperty(HTMLImageElement.prototype, "decode", {
      configurable: true,
      value: async () => undefined,
    });
  for (const method of ["showModal", "close"])
    if (!(method in HTMLDialogElement.prototype))
      Object.defineProperty(HTMLDialogElement.prototype, method, {
        configurable: true,
        value() {},
      });
  vi.spyOn(HTMLImageElement.prototype, "decode").mockResolvedValue();
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fixture");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(HTMLDialogElement.prototype, "showModal").mockImplementation(
    function (this: HTMLDialogElement) {
      this.open = true;
    },
  );
  vi.spyOn(HTMLDialogElement.prototype, "close").mockImplementation(function (
    this: HTMLDialogElement,
  ) {
    this.open = false;
  });
}

function fileDrop() {
  const event = new Event("drop", { bubbles: true, cancelable: true });
  Object.defineProperty(event, "dataTransfer", {
    value: {
      types: ["Files"],
      files: [new File(["fixture"], "fixture.png")],
    },
  });
  document.dispatchEvent(event);
  expect(event.defaultPrevented).toBe(true);
}

async function setup(
  loadLocalImage: () => Promise<LocalImageData | null>,
  withChrome = false,
) {
  document.body.replaceChildren();
  mockImageDialog();
  const tabStrip = document.createElement("nav");
  const tabsContainer = document.createElement("main");
  document.body.append(tabStrip, tabsContainer);
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
  let openImage!: () => void;
  let openAbout!: () => void;
  let toggleTabBar!: () => void;
  let find!: () => void;
  let toggleTitleBar = () => {};
  const chromeCommand = vi.fn();
  let clipboard!: (action: "copy" | "paste" | "select-all") => void;
  let zoom!: (command: TerminalFontZoom) => void;
  let tabCommand!: (command: TerminalTabCommand) => void;
  let surfaceOptions!: TerminalSurfaceOptions;
  let updateConfiguration!: (value: TerminalRendererConfiguration) => void;
  const host = mountTerminalWindowPage(
    { tabStrip, tabsContainer },
    {
      createAdapter: () => ({
        sessionId: () => "s1",
        start: async () => {},
        write: () => {},
        resize: () => {},
        close: () => {},
      }),
      mount: async (_container, _adapter, options) => {
        surfaceOptions = options;
        return surface;
      },
      page: window,
      about: {
        info: async () => ({ name: "OMXTerm", version: "1", copyright: "MIT" }),
        openLink: async () => {},
        onOpen(listener) {
          openAbout = listener;
          return () => {};
        },
      },
      ...(withChrome
        ? {
            chrome: {
              windowChrome: chromeCommand,
              onTitleBarToggle(listener: () => void) {
                toggleTitleBar = listener;
                return () => {};
              },
              onWindowChrome(
                listener: (
                  state: import("../../src/shared/window-chrome").WindowChromeState,
                ) => void,
              ) {
                listener({
                  style: "native",
                  titleBarVisible: false,
                  fullScreen: false,
                  maximized: false,
                  handleVisible: true,
                  title: "fixture",
                });
                return () => {};
              },
            },
          }
        : {}),
      subscribeToConfigurationUpdates(listener) {
        updateConfiguration = listener;
        return () => {};
      },
      loadLocalImage,
      subscribeToLocalImageOpen(listener) {
        openImage = listener;
        return () => {};
      },
      droppedFilePathInsertion: () => "'fixture.png'",
      subscribeToClipboardActions: (listener) => {
        clipboard = listener;
        return () => {};
      },
      subscribeToFontZoom: (listener) => {
        zoom = listener;
        return () => {};
      },
      subscribeToTabBarToggle(listener) {
        toggleTabBar = listener;
        return () => {};
      },
      subscribeToFind(listener) {
        find = listener;
        return () => {};
      },
      subscribeToTabCommands: (listener) => {
        tabCommand = listener;
        return () => {};
      },
    },
  );
  await host.ready;
  surface.focus.mockClear();
  return {
    host,
    surface,
    clipboard,
    zoom,
    tabCommand,
    surfaceOptions,
    openImage,
    openAbout,
    toggleTabBar,
    find: () => find(),
    toggleTitleBar: () => toggleTitleBar(),
    chromeCommand,
    tabStrip,
    updateConfiguration,
  };
}

describe("local image preview through the Terminal Window host", () => {
  it("does not stack About on an asynchronous image picker or image on About", async () => {
    let finish!: (image: LocalImageData | null) => void;
    const load = vi.fn(
      () =>
        new Promise<LocalImageData | null>((resolve) => {
          finish = resolve;
        }),
    );
    const page = await setup(load, true);
    page.openImage();
    page.openAbout();
    expect(document.querySelector(".about-dialog")).toBeNull();
    finish(null);
    await vi.waitFor(() => expect(page.surface.focus).toHaveBeenCalled());
    page.surface.focus.mockClear();
    page.openAbout();
    page.openImage();
    page.toggleTitleBar();
    page.toggleTabBar();
    page.clipboard("paste");
    page.zoom("in");
    fileDrop();
    expect(load).toHaveBeenCalledOnce();
    expect(page.surface.focus).not.toHaveBeenCalled();
    expect(page.surface.paste).not.toHaveBeenCalled();
    expect(page.surface.zoom).not.toHaveBeenCalled();
    expect(page.surface.inject).not.toHaveBeenCalled();
    page.host.dispose();
  });
  it.each(["menu", "destination"])(
    "disables hover throughout %s preview activity",
    async (route) => {
      let finish!: (value: LocalImageData | null) => void;
      const view = await setup(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
      const availability = view.surfaceOptions.linkHoverAvailability!;
      const changed = vi.fn();
      const unsubscribe = availability.subscribe(changed);
      try {
        expect(availability.isEnabled()).toBe(true);
        if (route === "menu") view.openImage();
        else
          view.surfaceOptions.onLocalImageActivation!({
            source: "native-path",
            path: "/tmp/a.png",
          });
        expect(changed).toHaveBeenCalledOnce();
        expect(availability.isEnabled()).toBe(false);
        finish(image);
        await vi.waitFor(() =>
          expect(document.querySelector("dialog")!.open).toBe(true),
        );
        expect(availability.isEnabled()).toBe(false);
        document.querySelector<HTMLButtonElement>("dialog button")!.click();
        expect(availability.isEnabled()).toBe(true);
      } finally {
        unsubscribe();
        view.host.dispose();
      }
    },
  );
  it.each(["picker", "source"])(
    "ignores tab bar toggles throughout %s choosing/loading/showing",
    async (route) => {
      let finish!: (value: LocalImageData | null) => void;
      const view = await setup(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
      );
      let decoded!: () => void;
      vi.spyOn(HTMLImageElement.prototype, "decode").mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            decoded = resolve;
          }),
      );
      try {
        view.tabCommand({ action: "new" });
        await vi.waitFor(() => expect(view.tabStrip.hidden).toBe(false));
        if (route === "picker") view.openImage();
        else
          view.surfaceOptions.onLocalImageActivation!({
            source: "native-path",
            path: "/tmp/fixture.png",
          });
        view.surface.focus.mockClear();
        view.toggleTabBar();
        expect(view.tabStrip.hidden).toBe(false);
        finish(image);
        await vi.waitFor(() => expect(decoded).toBeDefined());
        view.toggleTabBar();
        expect(view.tabStrip.hidden).toBe(false);
        decoded();
        await vi.waitFor(() =>
          expect(document.querySelector("dialog")!.open).toBe(true),
        );
        view.toggleTabBar();
        expect(view.tabStrip.hidden).toBe(false);
        expect(view.surface.focus).not.toHaveBeenCalled();
        document.querySelector<HTMLButtonElement>("dialog button")!.click();
        view.toggleTabBar();
        expect(view.tabStrip.hidden).toBe(true);
        view.toggleTabBar();
        expect(view.tabStrip.hidden).toBe(false);
      } finally {
        view.host.dispose();
      }
    },
  );

  it.each(["picker", "source"])(
    "suppresses title toggle and handle through %s choosing/loading/showing",
    async (route) => {
      let finish!: (value: LocalImageData | null) => void;
      const view = await setup(
        () =>
          new Promise((resolve) => {
            finish = resolve;
          }),
        true,
      );
      let decoded!: () => void;
      vi.spyOn(HTMLImageElement.prototype, "decode").mockImplementation(
        () =>
          new Promise<void>((resolve) => {
            decoded = resolve;
          }),
      );
      const handle = document.querySelector<HTMLElement>(
        ".window-drag-handle",
      )!;
      try {
        expect(handle.hidden).toBe(false);
        if (route === "picker") view.openImage();
        else
          view.surfaceOptions.onLocalImageActivation!({
            source: "native-path",
            path: "/tmp/fixture.png",
          });
        view.surface.focus.mockClear();
        const suppressed = () => {
          view.toggleTitleBar();
          expect(handle.hidden).toBe(true);
          expect(view.chromeCommand).not.toHaveBeenCalledWith(
            "toggle-title-bar",
          );
          expect(view.surface.focus).not.toHaveBeenCalled();
        };
        suppressed();
        expect(view.chromeCommand).toHaveBeenLastCalledWith("preview-active");
        finish(image);
        await vi.waitFor(() => expect(decoded).toBeDefined());
        suppressed();
        decoded();
        await vi.waitFor(() =>
          expect(document.querySelector("dialog")!.open).toBe(true),
        );
        suppressed();
        document.querySelector<HTMLButtonElement>("dialog button")!.click();
        expect(view.chromeCommand).toHaveBeenLastCalledWith("preview-inactive");
        expect(handle.hidden).toBe(false);
        view.toggleTitleBar();
        expect(view.chromeCommand).toHaveBeenLastCalledWith("toggle-title-bar");
      } finally {
        view.host.dispose();
      }
    },
  );

  it("blocks terminal-directed actions while loading/modal and restores them after dismissal", async () => {
    let finish!: (value: LocalImageData) => void;
    const view = await setup(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
    );
    try {
      view.surfaceOptions.onLocalImageActivation!({
        source: "native-path",
        path: "/tmp/fixture.png",
      });
      const interact = () => {
        view.clipboard("paste");
        view.clipboard("copy");
        view.clipboard("select-all");
        view.find();
        view.zoom("in");
        fileDrop();
        window.dispatchEvent(new Event("focus"));
      };
      interact();
      finish(image);
      await vi.waitFor(() =>
        expect(document.querySelector("dialog")!.open).toBe(true),
      );
      interact();
      expect.soft(view.surface.paste).not.toHaveBeenCalled();
      expect.soft(view.surface.copy).not.toHaveBeenCalled();
      expect.soft(view.surface.selectAll).not.toHaveBeenCalled();
      expect.soft(view.surface.find).not.toHaveBeenCalled();
      expect.soft(view.surface.inject).not.toHaveBeenCalled();
      expect.soft(view.surface.zoom).not.toHaveBeenCalled();
      expect.soft(view.surface.focus).not.toHaveBeenCalled();
      document.querySelector<HTMLButtonElement>("dialog button")!.click();
      expect(document.querySelector("dialog")!.open).toBe(false);
      interact();
      expect(view.surface.paste).toHaveBeenCalledOnce();
      expect(view.surface.copy).toHaveBeenCalledOnce();
      expect(view.surface.selectAll).toHaveBeenCalledOnce();
      expect(view.surface.find).toHaveBeenCalledOnce();
      expect(view.surface.inject).toHaveBeenCalledOnce();
      expect(view.surface.zoom).toHaveBeenCalledOnce();
      expect(view.surface.focus).toHaveBeenCalled();
    } finally {
      view.host.dispose();
    }
  });

  it("keeps preview focus through fullscreen inset changes and reload", async () => {
    const view = await setup(async () => image);
    try {
      view.openImage();
      await vi.waitFor(() =>
        expect(document.querySelector("dialog")!.open).toBe(true),
      );
      const focused = document.activeElement;
      for (const nativeTitleInset of [0, 0, 30, 0] as const) {
        view.updateConfiguration({
          fontSize: 18,
          fontLineHeight: 1,
          fontLigatures: true,
          terminalPadding: { top: 7, right: 8, bottom: 8, left: 8 },
          scrollbackLines: 10_000,
          optionKeyMode: "none",
          nativeTitleInset,
          showTabBar: true,
          transparency: 0,
          terminalTheme: DEFAULT_TERMINAL_THEME,
          userFileErrors: [],
        });
        expect(document.activeElement).toBe(focused);
        expect(document.querySelector("dialog")!.open).toBe(true);
        expect(view.surface.focus).not.toHaveBeenCalled();
        expect(
          document.documentElement.style.getPropertyValue(
            "--native-title-inset",
          ),
        ).toBe(`${nativeTitleInset}px`);
      }
    } finally {
      view.host.dispose();
    }
  });

  it("still delivers confirmed session closure while a preview is open", async () => {
    const view = await setup(async () => image);
    try {
      view.surfaceOptions.onLocalImageActivation!({
        source: "file-url",
        url: "file:///tmp/fixture.png",
      });
      await vi.waitFor(() =>
        expect(document.querySelector("dialog")!.open).toBe(true),
      );
      view.tabCommand({ action: "close-session", sessionId: "s1" });
      expect(view.surface.dispose).toHaveBeenCalledOnce();
    } finally {
      view.host.dispose();
    }
  });
});
