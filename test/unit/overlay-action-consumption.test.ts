// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { mountTerminalWindowPage } from "../../src/renderer/terminal-window-host";
import { createSemanticInputDelivery } from "../../src/terminal-surface/semantic-input-delivery";
import { resttyClipboardActions } from "../../src/terminal-surface/restty-host-services";
import type { TerminalClipboardAction } from "../../src/shared/terminal-contract";
import {
  createOverlayActionConsumption,
  overlayActionsConsumed,
  type OverlayAction,
} from "../fixtures/overlay-action-consumption";

const disposals: Array<() => void> = [];
afterEach(() => {
  for (const dispose of disposals.splice(0)) dispose();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

async function fixture(
  kind: "image" | "about" | "picker" = "image",
  leak = false,
) {
  const owner = "window-a";
  const consumption = createOverlayActionConsumption(owner);
  const removeClipboard = vi.fn(),
    removeToggle = vi.fn();
  const notifications = vi.fn();
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
  vi.spyOn(URL, "createObjectURL").mockReturnValue("blob:fixture");
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => {});
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  const content = document.createElement("div");
  const panel = document.createElement("aside");
  panel.id = "snippets-sidebar";
  const tabsContainer = document.createElement("main");
  const tabStrip = document.createElement("nav");
  content.append(tabsContainer, panel);
  document.body.append(tabStrip, content);
  vi.spyOn(content, "getBoundingClientRect").mockReturnValue({
    width: 1000,
  } as DOMRect);
  let clipboardListener!: (action: TerminalClipboardAction) => void;
  let toggleListener!: () => void;
  let imageListener!: () => void;
  let aboutListener!: () => void;
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
        subscribeToToggle: consumption.toggle((listener) => {
          toggleListener = listener;
          return removeToggle;
        }),
      },
      subscribeToClipboardActions: consumption.clipboard((listener) => {
        clipboardListener = (action) => {
          listener(action);
          // Deliberately broken transport control: completion is not an ignored
          // verdict and must never conceal a second route leaking to the sink.
          if (leak && action === "paste") void surfacePaste();
        };
        return removeClipboard;
      }),
      about: {
        info: async () => ({ name: "OMXTerm", version: "1", copyright: "MIT" }),
        openLink: async () => {},
        onOpen(listener) {
          aboutListener = listener;
          return () => {};
        },
      },
      loadLocalImage: async () =>
        kind === "picker"
          ? new Promise<null>((resolve) => {
              finishPicker = resolve;
            })
          : {
              name: "fixture.png",
              mime: "image/png",
              width: 1,
              height: 1,
              data: new Uint8Array([1]),
            },
      subscribeToLocalImageOpen(listener) {
        imageListener = listener;
        return () => {};
      },
    },
  );
  disposals.push(host.dispose, delivery.dispose);
  await host.ready;
  toggleListener();
  if (kind === "about") aboutListener();
  else imageListener();
  if (kind === "image")
    await vi.waitFor(() =>
      expect(
        document.querySelector<HTMLDialogElement>(".local-image-preview")?.open,
      ).toBe(true),
    );
  const dismiss = () => {
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
  };
  return {
    sink,
    clipboard,
    panel,
    owner,
    consumption,
    host,
    surfacePaste,
    removeClipboard,
    removeToggle,
    queueToggle: () => {
      notifications("toggle");
      const callback = toggleListener;
      return () => callback();
    },
    queuePaste: () => {
      notifications("clipboard", "paste");
      const callback = clipboardListener;
      return () => callback("paste");
    },
    notifications,
    toggle: () => toggleListener(),
    pasteAction: () => clipboardListener("paste"),
    copyAction: () => clipboardListener("copy"),
    dismiss,
    settled: () => paste,
  };
}

it.each(["toggle", "paste"] as const)(
  "keeps the strict overlay oracle empty with independently held callbacks (%s first)",
  async (first) => {
    const f = await fixture();
    const expected: OverlayAction[] = [
      { channel: "toggle", ordinal: 2, kind: "toggle" },
      { channel: "clipboard", ordinal: 1, kind: "paste" },
    ];
    const ready = () =>
      overlayActionsConsumed(f.consumption.snapshot(), f.owner, expected);
    let release!: () => void;
    const dismissed = vi.fn(f.dismiss);
    const transition = new Promise<void>((resolve) => {
      release = resolve;
    }).then(dismissed);
    const check = () => {
      if (ready()) release();
    };
    const deliverToggle = f.queueToggle();
    const deliverPaste = f.queuePaste();
    // Both send calls and independent receipt-only notifications have completed.
    expect(f.notifications).toHaveBeenCalledTimes(2);
    check();
    await Promise.resolve();
    expect(dismissed).not.toHaveBeenCalled();
    (first === "toggle" ? deliverToggle : deliverPaste)();
    check();
    await Promise.resolve();
    expect(dismissed).not.toHaveBeenCalled(); // Neither channel acknowledges the other.
    (first === "toggle" ? deliverPaste : deliverToggle)();
    expect(ready()).toBe(true);
    expect(
      document.querySelector<HTMLDialogElement>(".local-image-preview")!.open,
    ).toBe(true);
    expect(f.surfacePaste).not.toHaveBeenCalled();
    expect(f.clipboard.readText).not.toHaveBeenCalled();
    check();
    await transition;
    expect(dismissed).toHaveBeenCalledOnce();
    await f.settled();
    expect(f.panel.hidden).toBe(false);
    expect(f.sink).toEqual([]);

    // A fresh ordinary action after dismissal must not be blanket-suppressed.
    f.pasteAction();
    await f.settled();
    expect(f.surfacePaste).toHaveBeenCalledOnce();
    expect(f.sink).toEqual(["remapped"]);
  },
);

it.each(["about", "picker"] as const)(
  "fences actual %s callbacks before closing or finishing the overlay",
  async (kind) => {
    const f = await fixture(kind);
    const expected: OverlayAction[] = [
      { channel: "toggle", ordinal: 2, kind: "toggle" },
      ...(kind === "about"
        ? [
            {
              channel: "clipboard" as const,
              ordinal: 1,
              kind: "paste" as const,
            },
          ]
        : []),
    ];
    expect(f.panel.inert).toBe(true);
    expect(
      overlayActionsConsumed(f.consumption.snapshot(), f.owner, expected),
    ).toBe(false);
    f.toggle();
    if (kind === "about") {
      expect(
        overlayActionsConsumed(f.consumption.snapshot(), f.owner, expected),
      ).toBe(false);
      f.pasteAction();
    }
    expect(
      overlayActionsConsumed(f.consumption.snapshot(), f.owner, expected),
    ).toBe(true);
    expect(f.panel.inert).toBe(true);
    expect(f.panel.hidden).toBe(false);
    expect(f.surfacePaste).not.toHaveBeenCalled();
    expect(f.clipboard.readText).not.toHaveBeenCalled();
    f.dismiss();
    await vi.waitFor(() => expect(f.panel.inert).toBe(false));
    expect(f.sink).toEqual([]);
  },
);

it("detects deliberately after-dismiss Paste with the original strict empty oracle", async () => {
  const f = await fixture();
  const deliverToggle = f.queueToggle();
  const deliverPaste = f.queuePaste();
  deliverToggle(); // Toggle arrived during the modal; Paste is still queued.
  f.dismiss();
  deliverPaste();
  await f.settled();
  expect(f.panel.hidden).toBe(false);
  expect(f.surfacePaste).toHaveBeenCalledOnce();
  expect(f.sink).toEqual(["remapped"]);
  expect(() => expect(f.sink).toEqual([])).toThrow();
});

it("does not let a completion receipt mask a broken transport leaking to the selected Surface", async () => {
  const f = await fixture("image", true);
  f.pasteAction();
  expect(
    overlayActionsConsumed(f.consumption.snapshot(), f.owner, [
      { channel: "clipboard", ordinal: 1, kind: "paste" },
    ]),
  ).toBe(true);
  expect(
    document.querySelector<HTMLDialogElement>(".local-image-preview")!.open,
  ).toBe(true);
  await f.settled();
  expect(f.surfacePaste).toHaveBeenCalledOnce();
  expect(() => expect(f.sink).toEqual([])).toThrow();
});

it("refuses wrong-window, stale, unrelated, wrong-kind and duplicate receipts", async () => {
  const f = await fixture();
  const first: OverlayAction[] = [
    { channel: "clipboard", ordinal: 1, kind: "paste" },
  ];
  const stale = f.consumption.snapshot();
  f.copyAction();
  expect(() =>
    overlayActionsConsumed(f.consumption.snapshot(), f.owner, first),
  ).toThrow("action changed");
  const next: OverlayAction[] = [
    { channel: "clipboard", ordinal: 2, kind: "paste" },
  ];
  f.toggle();
  expect(overlayActionsConsumed(f.consumption.snapshot(), f.owner, next)).toBe(
    false,
  );
  f.pasteAction();
  expect(overlayActionsConsumed(stale, f.owner, next)).toBe(false);
  const current = f.consumption.snapshot();
  expect(overlayActionsConsumed(current, f.owner, next)).toBe(true);
  expect(() => overlayActionsConsumed(current, "other-window", next)).toThrow(
    "window changed",
  );
  expect(() =>
    overlayActionsConsumed(
      { ...current, receipts: [...current.receipts, current.receipts.at(-1)!] },
      f.owner,
      next,
    ),
  ).toThrow("duplicate");
  expect(() => overlayActionsConsumed(current, f.owner, [])).toThrow(
    "No overlay action",
  );
});

it("bounds fixture storage and reports registration errors without a completion", () => {
  const failed = createOverlayActionConsumption("failed-window");
  const error = new Error("subscription failed");
  expect(() =>
    failed.toggle(() => {
      throw error;
    })(() => {}),
  ).toThrow(error);
  expect(failed.snapshot()).toMatchObject({ state: "failed", receipts: [] });
  const argumentsOnly = createOverlayActionConsumption("arguments-window");
  let toggle!: () => void;
  let clipboard!: (action: TerminalClipboardAction) => void;
  const onToggle = vi.fn(),
    onClipboard = vi.fn();
  argumentsOnly.toggle((listener) => {
    toggle = listener;
    return () => {};
  })(onToggle);
  argumentsOnly.clipboard((listener) => {
    clipboard = listener;
    return () => {};
  })(onClipboard);
  toggle();
  clipboard("paste");
  expect(onToggle).toHaveBeenCalledExactlyOnceWith();
  expect(onClipboard).toHaveBeenCalledExactlyOnceWith("paste");
  const bounded = createOverlayActionConsumption("bounded-window");
  let callback!: (action: TerminalClipboardAction) => void;
  bounded.toggle(() => () => {})(() => {});
  bounded.clipboard((listener) => {
    callback = listener;
    return () => {};
  })(() => {});
  for (let i = 0; i < 128; i += 1) callback("copy");
  expect(bounded.snapshot().receipts).toHaveLength(128);
  expect(() => callback("copy")).toThrow("capacity");
  expect(bounded.snapshot()).toMatchObject({ state: "failed" });
  expect(bounded.snapshot().receipts).toHaveLength(128);
});

it("records only normal callback return and preserves real unsubscribe ownership", async () => {
  const f = await fixture();
  f.dismiss();
  const error = new Error("actual listener failed");
  f.surfacePaste.mockImplementationOnce(() => {
    throw error;
  });
  expect(() => f.pasteAction()).toThrow(error);
  expect(
    f.consumption.snapshot().receipts.filter((r) => r.channel === "clipboard"),
  ).toEqual([]);
  expect(() =>
    overlayActionsConsumed(f.consumption.snapshot(), f.owner, [
      { channel: "clipboard", ordinal: 1, kind: "paste" },
    ]),
  ).toThrow("failed");
  const alreadyQueued = f.queuePaste();
  f.host.dispose();
  f.host.dispose();
  expect(f.removeClipboard).toHaveBeenCalledOnce();
  expect(f.removeToggle).toHaveBeenCalledOnce();
  const before = f.consumption.snapshot();
  alreadyQueued(); // Already queued transport callback after real unsubscribe.
  expect(f.consumption.snapshot()).toEqual(before);
  const other = await fixture();
  other.host.dispose();
  expect(() =>
    overlayActionsConsumed(other.consumption.snapshot(), other.owner, [
      { channel: "toggle", ordinal: 1, kind: "toggle" },
    ]),
  ).toThrow("disposed");
});
