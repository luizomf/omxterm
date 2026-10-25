// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { harness } from "../fixtures/restty-surface-harness";
import {
  cancellationBridge,
  deferred,
} from "../fixtures/initialization-cancellation-harness";
import { mountResttyTerminalSurface } from "../../src/terminal-surface/restty-terminal-surface";
import { mountTerminalWindowPage } from "../../src/renderer/terminal-window-host";
import { createElectronTerminalAdapter } from "../../src/renderer/electron-terminal-adapter";
import { createTabSelection } from "../../src/main/terminal-tab-selection";
import type { TerminalTabCommand } from "../../src/shared/terminal-contract";
import { base, installSettingsDom } from "../fixtures/settings-dialog-dom";

afterEach(() => {
  harness.setInitGate(undefined);
  vi.restoreAllMocks();
});

it.each(["cancel", "about", "settings"] as const)(
  "retains pending-pane selection through real async Surface mount, then %s owns its completion",
  async (action) => {
    harness.instances.length = 0;
    harness.setInitError(undefined);
    harness.setInitGate(undefined);
    installSettingsDom();
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    for (const method of ["showModal", "close"]) {
      if (!(method in HTMLDialogElement.prototype))
        Object.defineProperty(HTMLDialogElement.prototype, method, {
          configurable: true,
          value() {},
        });
    }
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
    const { bridge } = cancellationBridge();
    const gate = deferred();
    const sessions = new Map([
      ["s1", false],
      ["s2", true],
      ["s3", false],
    ]);
    const selection = createTabSelection({
      routed: (id) =>
        sessions.has(id) ? { busy: sessions.get(id)! } : undefined,
      current: (id) =>
        sessions.has(id) ? { busy: sessions.get(id)! } : undefined,
      isBusy: (state) => state.busy,
      hasBusySession: () => true,
      reject: vi.fn(),
      onSessionSelected: vi.fn(),
    });
    const tabStrip = document.createElement("nav");
    const tabsContainer = document.createElement("div");
    document.body.replaceChildren(tabStrip, tabsContainer);
    let command!: (value: TerminalTabCommand) => void;
    let openAbout!: () => void;
    let openSettings!: () => void;
    const completed: HTMLElement[] = [];
    const host = mountTerminalWindowPage(
      { tabStrip, tabsContainer },
      {
        createAdapter: () => createElectronTerminalAdapter(bridge),
        mount: async (container, adapter, options) => {
          vi.spyOn(
            container.closest<HTMLElement>(".terminal-tab")!,
            "getBoundingClientRect",
          ).mockReturnValue({ width: 1200, height: 800 } as DOMRect);
          vi.spyOn(container, "getBoundingClientRect").mockReturnValue({
            width: 1200,
            height: 800,
          } as DOMRect);
          const surface = await mountResttyTerminalSurface(
            container,
            adapter,
            options,
          );
          const runtime = harness.instances.find(
            (instance) => instance.options.root === container,
          )!;
          runtime.canvas.width = 1200;
          runtime.canvas.height = 800;
          vi.spyOn(runtime.canvas, "getBoundingClientRect").mockReturnValue({
            width: 1200,
            height: 800,
          } as DOMRect);
          runtime.options.services.ptyTransport.resize(120, 40, {
            widthPx: 1200,
            heightPx: 800,
            cellW: 10,
            cellH: 20,
          });
          completed.push(container);
          return surface;
        },
        subscribeToTabCommands: (listener) => {
          command = listener;
          return () => {};
        },
        notifyTabSelection: (sessionId, tabSessionIds) =>
          selection.tabSelected({ sessionId, tabSessionIds }),
        settings: {
          snapshot: async () => base,
          change: vi.fn(),
          saveText: vi.fn(),
          changeKeybind: vi.fn(),
          captureShortcut: vi.fn(() => () => {}),
          onOpen(listener) {
            openSettings = listener;
            return () => {};
          },
        },
        about: {
          info: async () => ({
            name: "OMXTerm",
            version: "1",
            copyright: "MIT",
          }),
          openLink: async () => {},
          onOpen: (listener) => {
            openAbout = listener;
            return () => {};
          },
        },
      },
    );
    try {
      await host.ready;
      command({ action: "new" });
      await vi.waitFor(() => expect(completed).toHaveLength(2));
      harness.setInitGate(gate.promise);
      command({ action: "split", direction: "right" });
      await vi.waitFor(() => expect(harness.instances).toHaveLength(3));
      expect(bridge.start).toHaveBeenCalledTimes(2);
      command({ action: "previous" });
      expect(selection.hasBusySelectedSession()).toBe(false);
      command({ action: "next" });
      expect(selection.hasBusySelectedSession()).toBe(true);
      expect(selection.hasBusyFocusedSession()).toBe(false);
      const pending = harness.instances[2]!;
      if (action === "cancel") {
        command({ action: "prepare-close-pane" });
        command({ action: "focus-pane", target: "previous" });
        command({ action: "resolve-close-pane", confirmed: true });
      } else if (action === "about") openAbout();
      else {
        openSettings();
        await vi.waitFor(() =>
          expect(
            document.querySelector(".settings-dialog textarea"),
          ).not.toBeNull(),
        );
        document
          .querySelector<HTMLButtonElement>("#settings-tab-config-file")!
          .click();
        const field = document.querySelector<HTMLTextAreaElement>(
          ".settings-dialog textarea",
        )!;
        field.value = "untouched newer draft";
        field.dispatchEvent(new Event("input"));
        field.focus();
        field.setSelectionRange(2, 5);
      }
      const ownedFocus = document.activeElement;
      gate.resolve();
      await vi.waitFor(() => expect(completed).toHaveLength(3));
      expect(pending.focus).not.toHaveBeenCalled();
      if (action === "cancel") {
        expect(bridge.start).toHaveBeenCalledTimes(2);
        expect(pending.destroy).toHaveBeenCalledOnce();
        expect(bridge.close).not.toHaveBeenCalled();
        expect(selection.hasBusyFocusedSession()).toBe(true);
      } else {
        expect(bridge.start).toHaveBeenCalledTimes(3);
        expect(selection.hasBusySelectedSession()).toBe(true);
        expect(selection.hasBusyFocusedSession()).toBe(false);
        expect(document.activeElement).toBe(ownedFocus);
        if (action === "settings") {
          const field = ownedFocus as HTMLTextAreaElement;
          expect([
            field.value,
            field.selectionStart,
            field.selectionEnd,
          ]).toEqual(["untouched newer draft", 2, 5]);
        }
        document
          .querySelector<HTMLButtonElement>(
            action === "about" ? ".about-close" : ".settings-close",
          )!
          .click();
        expect(pending.focus).toHaveBeenCalledOnce();
      }
    } finally {
      gate.resolve();
      host.dispose();
    }
  },
);
