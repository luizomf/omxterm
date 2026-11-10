// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { mountTerminalWindowPage } from "../../src/renderer/terminal-window-host";
import { createSemanticInputDelivery } from "../../src/terminal-surface/semantic-input-delivery";
import { resttyClipboardActions } from "../../src/terminal-surface/restty-host-services";
import type { TerminalClipboardAction } from "../../src/shared/terminal-contract";

const disposals: Array<() => void> = [];
afterEach(() => {
  for (const dispose of disposals.splice(0)) dispose();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

async function openOverlay(kind: "image" | "about" | "picker") {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function () {
    this.open = false;
  };
  Object.defineProperty(HTMLImageElement.prototype, "decode", {
    configurable: true,
    value: async () => {},
  });
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:overlay");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  const content = document.createElement("div");
  const panel = document.createElement("aside");
  const tabsContainer = document.createElement("main");
  const tabStrip = document.createElement("nav");
  content.append(tabsContainer, panel);
  document.body.append(tabStrip, content);
  vi.spyOn(content, "getBoundingClientRect").mockReturnValue({
    width: 1000,
  } as DOMRect);
  let clipboardAction!: (action: TerminalClipboardAction) => void;
  let toggle!: () => void;
  let openImage!: () => void;
  let openAbout!: () => void;
  let finishPicker!: (value: null) => void;
  const sink: string[] = [];
  let paste = Promise.resolve();
  const clipboard = {
    readText: vi.fn(async () => "remapped"),
    writeText: vi.fn(async () => {}),
    confirmPaste: vi.fn(async () => false),
    requestContextMenu: vi.fn(),
  };
  const delivery = createSemanticInputDelivery({
    isLive: () => true,
    isBracketedPasteEnabled: () => false,
    write: (text) => sink.push(text),
  });
  const actions = resttyClipboardActions(
    delivery,
    { clipboard },
    () => undefined,
  );
  const surfacePaste = vi.fn(() => (paste = actions.paste()));
  const input = document.createElement("textarea");
  const host = mountTerminalWindowPage(
    { tabStrip, tabsContainer, auxiliaryPanel: panel },
    {
      page: window,
      createAdapter: () => ({
        sessionId: () => "s1",
        start: async () => {},
        write() {},
        resize() {},
        close() {},
      }),
      mount: async (container) => {
        container.append(input);
        return {
          geometry: () => undefined,
          ...actions,
          dispose() {},
          focus() {
            input.focus();
          },
          applyTheme() {},
          applyConfiguration() {},
          zoom() {},
          find() {},
          paste: surfacePaste,
        };
      },
      clipboard,
      snippets: {
        load: async () => ({ snippets: [] }),
        subscribeToToggle(listener) {
          toggle = listener;
          return () => {};
        },
      },
      subscribeToClipboardActions(listener) {
        clipboardAction = listener;
        return () => {};
      },
      about: {
        info: async () => ({ name: "OMXTerm", version: "1", copyright: "MIT" }),
        openLink: async () => {},
        onOpen(listener) {
          openAbout = listener;
          return () => {};
        },
      },
      loadLocalImage: async () =>
        kind === "picker"
          ? new Promise<null>((resolve) => {
              finishPicker = resolve;
            })
          : {
              name: "overlay.png",
              mime: "image/png",
              width: 1,
              height: 1,
              data: new Uint8Array([1]),
            },
      subscribeToLocalImageOpen(listener) {
        openImage = listener;
        return () => {};
      },
    },
  );
  disposals.push(host.dispose, delivery.dispose);
  await host.ready;
  toggle(); // Show the panel so a swallowed toggle is observable.
  if (kind === "about") openAbout();
  else openImage();
  if (kind === "image")
    await vi.waitFor(() =>
      expect(
        document.querySelector<HTMLDialogElement>(".local-image-preview")?.open,
      ).toBe(true),
    );
  return {
    panel,
    sink,
    surfacePaste,
    readText: clipboard.readText,
    toggle: () => toggle(),
    paste: () => clipboardAction("paste"),
    settled: () => paste,
    dismiss() {
      if (kind === "about")
        document.querySelector<HTMLButtonElement>(".about-close")!.click();
      else if (kind === "picker") finishPicker(null);
      else
        document.querySelector(".local-image-preview")!.dispatchEvent(
          new KeyboardEvent("keydown", {
            key: "Escape",
            bubbles: true,
            cancelable: true,
          }),
        );
    },
  };
}

it.each(["image", "about", "picker"] as const)(
  "swallows Snippets toggle and Paste under the %s overlay, then accepts a fresh Paste",
  async (kind) => {
    const overlay = await openOverlay(kind);
    expect(overlay.panel.inert).toBe(true);

    overlay.toggle();
    overlay.paste();
    expect(overlay.panel.hidden).toBe(false);
    expect(overlay.surfacePaste).not.toHaveBeenCalled();
    expect(overlay.readText).not.toHaveBeenCalled();

    overlay.dismiss();
    await vi.waitFor(() => expect(overlay.panel.inert).toBe(false));
    await overlay.settled();
    expect(overlay.panel.hidden).toBe(false);
    expect(overlay.sink).toEqual([]);

    overlay.paste();
    await overlay.settled();
    expect(overlay.surfacePaste).toHaveBeenCalledOnce();
    expect(overlay.sink).toEqual(["remapped"]);
  },
);
