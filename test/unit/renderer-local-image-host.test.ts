// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { mountTerminalWindowPage } from "../../src/renderer/terminal-window-host";
import type { TerminalSurfaceOptions } from "../../src/terminal-surface/terminal-surface";
import type { LocalImageData } from "../../src/shared/local-image";
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

async function setup(loadLocalImage: () => Promise<LocalImageData | null>) {
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
  };
  let openImage!: () => void;
  let clipboard!: (action: "copy" | "paste" | "select-all") => void;
  let zoom!: (command: TerminalFontZoom) => void;
  let tabCommand!: (command: TerminalTabCommand) => void;
  let surfaceOptions!: TerminalSurfaceOptions;
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
  };
}

describe("local image preview through the Terminal Window host", () => {
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
      expect.soft(view.surface.inject).not.toHaveBeenCalled();
      expect.soft(view.surface.zoom).not.toHaveBeenCalled();
      expect.soft(view.surface.focus).not.toHaveBeenCalled();
      document.querySelector<HTMLButtonElement>("dialog button")!.click();
      expect(document.querySelector("dialog")!.open).toBe(false);
      interact();
      expect(view.surface.paste).toHaveBeenCalledOnce();
      expect(view.surface.copy).toHaveBeenCalledOnce();
      expect(view.surface.selectAll).toHaveBeenCalledOnce();
      expect(view.surface.inject).toHaveBeenCalledOnce();
      expect(view.surface.zoom).toHaveBeenCalledOnce();
      expect(view.surface.focus).toHaveBeenCalled();
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
