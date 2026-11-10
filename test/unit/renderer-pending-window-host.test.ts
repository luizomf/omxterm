// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { mountTerminalWindowPage } from "../../src/renderer/terminal-window-host";
import { createElectronTerminalAdapter } from "../../src/renderer/electron-terminal-adapter";
import { cancellationBridge } from "../fixtures/initialization-cancellation-harness";
import type { TerminalSurface } from "../../src/terminal-surface/terminal-surface";

function createPageElements() {
  const tabStrip = document.createElement("nav");
  tabStrip.hidden = true;
  const tabsContainer = document.createElement("div");
  document.body.replaceChildren(tabStrip, tabsContainer);
  return { tabStrip, tabsContainer };
}
function createAdapterFactory() {
  const { bridge } = cancellationBridge();
  return () => createElectronTerminalAdapter(bridge);
}
function createSurface() {
  return {
    dispose: vi.fn(),
    geometry: () => undefined,
    focus: vi.fn(),
    applyTheme: vi.fn(),
    applyConfiguration: vi.fn(),
    inject: vi.fn(),
    zoom: vi.fn(),
    copy: vi.fn(),
    paste: vi.fn(),
    selectAll: vi.fn(),
    find: vi.fn(),
    exportText: vi.fn(() => "first mounted source"),
  };
}

it.each([true, false])(
  "receives related actions during first mount and cleans early subscriptions (settle before pagehide: %s)",
  async (settleBeforeHide) => {
    type Options = Parameters<typeof mountTerminalWindowPage>[1];
    const removals = Array.from({ length: 7 }, () => vi.fn());
    const zoom = vi.fn<NonNullable<Options["subscribeToFontZoom"]>>(
      () => removals[0]!,
    );
    const clipboard = vi.fn<
      NonNullable<Options["subscribeToClipboardActions"]>
    >(() => removals[1]!);
    const tabbar = vi.fn<NonNullable<Options["subscribeToTabBarToggle"]>>(
      () => removals[2]!,
    );
    const find = vi.fn<NonNullable<Options["subscribeToFind"]>>(
      () => removals[3]!,
    );
    const commands = vi.fn<NonNullable<Options["subscribeToTabCommands"]>>(
      () => removals[4]!,
    );
    const snippets = vi.fn<
      NonNullable<NonNullable<Options["snippets"]>["subscribeToToggle"]>
    >(() => removals[5]!);
    const exports = vi.fn<NonNullable<Options["subscribeToExportRequests"]>>(
      () => removals[6]!,
    );
    const save = vi.fn<NonNullable<Options["saveTerminalExport"]>>(
      async () => {},
    );
    const clipboardHost = {
      readText: async () => "",
      writeText: async () => {},
      confirmPaste: async () => false,
      requestContextMenu:
        vi.fn<NonNullable<Options["clipboard"]>["requestContextMenu"]>(),
    };
    const elements = createPageElements();
    const aside = document.createElement("aside");
    aside.hidden = true;
    document.body.append(aside);
    const bounds = vi
      .spyOn(document.body, "getBoundingClientRect")
      .mockReturnValue({ width: 1000 } as DOMRect);
    const active = vi.spyOn(document, "hasFocus").mockReturnValue(true);
    const surface = createSurface();
    let release!: (surface: TerminalSurface) => void;
    const pending = new Promise<TerminalSurface>((resolve) => {
      release = resolve;
    });
    const load = vi.fn(async () => ({ snippets: [] }));
    const mount = vi.fn<NonNullable<Options["mount"]>>(
      async (_container, adapter) => {
        await adapter.start({ onOutput() {}, onExit() {} });
        return pending;
      },
    );
    const host = mountTerminalWindowPage(
      { ...elements, auxiliaryPanel: aside },
      {
        createAdapter: createAdapterFactory(),
        mount,
        subscribeToFontZoom: zoom,
        subscribeToClipboardActions: clipboard,
        subscribeToTabBarToggle: tabbar,
        subscribeToFind: find,
        subscribeToExportRequests: exports,
        saveTerminalExport: save,
        clipboard: clipboardHost,
        subscribeToTabCommands: commands,
        snippets: { load, subscribeToToggle: snippets },
      },
    );
    try {
      let ready = false;
      void host.ready.then(() => {
        ready = true;
      });
      expect(exports).toHaveBeenCalledOnce();
      const earlyExport = {
        kind: "content",
        target: { sessionId: "s1", menuId: 1 },
      } as const;
      mount.mock.calls[0]![2].clipboard!.requestContextMenu({
        target: "terminal",
        hasSelection: false,
      });
      expect(clipboardHost.requestContextMenu).not.toHaveBeenCalled();
      exports.mock.calls[0]![0](earlyExport);
      zoom.mock.calls[0]![0]("in");
      clipboard.mock.calls[0]![0]("paste");
      find.mock.calls[0]![0]();
      tabbar.mock.calls[0]![0]();
      snippets.mock.calls[0]![0]();
      const search = aside.querySelector("input")!;
      expect(document.activeElement).toBe(search);
      await vi.waitFor(() => expect(load).toHaveBeenCalledOnce());
      expect(ready).toBe(false); // Subscription is not mount readiness.
      if (!settleBeforeHide) {
        window.dispatchEvent(new Event("pagehide"));
        for (const remove of removals) expect(remove).toHaveBeenCalledOnce();
      }
      release(surface);
      await host.ready;
      expect(surface.find).not.toHaveBeenCalled();
      expect(surface.paste).not.toHaveBeenCalled();
      expect(surface.focus).not.toHaveBeenCalled();
      expect(surface.exportText).not.toHaveBeenCalled();
      expect(save).not.toHaveBeenCalled();
      // No queued export is replayed on mount settlement.
      if (settleBeforeHide) {
        mount.mock.calls[0]![2].clipboard!.requestContextMenu({
          target: "terminal",
          hasSelection: false,
        });
        const target = clipboardHost.requestContextMenu.mock.calls.at(-1)![0]!;
        const context = { kind: "content", target } as const;
        exports.mock.calls[0]![0](context);
        exports.mock.calls[0]![0](context);
        expect(save).toHaveBeenCalledExactlyOnceWith({
          kind: "content",
          text: "first mounted source",
        });
        expect(surface.exportText).toHaveBeenCalledExactlyOnceWith("content");
        expect(surface.zoom).toHaveBeenCalledExactlyOnceWith("in");
        expect(document.activeElement).toBe(search);
        mount.mockImplementation(async () => createSurface());
        commands.mock.calls[0]![0]({ action: "new" });
        expect(elements.tabsContainer.children).toHaveLength(2);
        expect(elements.tabStrip.hidden).toBe(true); // Early toggle retained.
        window.dispatchEvent(new Event("pagehide"));
      }
      host.dispose();
      const reads = surface.exportText.mock.calls.length;
      exports.mock.calls[0]![0](earlyExport);
      expect(surface.exportText).toHaveBeenCalledTimes(reads);
      for (const remove of removals) expect(remove).toHaveBeenCalledOnce();
      expect(surface.dispose).toHaveBeenCalledOnce();
    } finally {
      release(surface);
      host.dispose();
      bounds.mockRestore();
      active.mockRestore();
    }
  },
);

// Window actions and Snippets each roll back their own partial registration.
it.each(["tabs", "snippets"] as const)(
  "removes every completed subscription and aborts the mount when %s registration throws",
  async (failureAt) => {
    const elements = createPageElements();
    const aside = document.createElement("aside");
    document.body.append(aside);
    const removals: Array<ReturnType<typeof vi.fn>> = [];
    const subscribe = (_listener: unknown) => {
      const remove = vi.fn();
      removals.push(remove);
      return remove;
    };
    const failure = new Error("registration failed");
    let finish!: (surface: TerminalSurface) => void;
    const pending = new Promise<TerminalSurface>((resolve) => {
      finish = resolve;
    });
    const surface = createSurface();
    const mount = vi.fn<
      NonNullable<Parameters<typeof mountTerminalWindowPage>[1]["mount"]>
    >(() => pending);
    expect(() =>
      mountTerminalWindowPage(
        { ...elements, auxiliaryPanel: aside },
        {
          createAdapter: createAdapterFactory(),
          mount,
          subscribeToConfigurationUpdates: subscribe,
          subscribeToFontZoom: subscribe,
          subscribeToClipboardActions: subscribe,
          subscribeToTabBarToggle: subscribe,
          subscribeToFind: subscribe,
          subscribeToExportRequests: subscribe,
          subscribeToTabCommands: (listener) => {
            if (failureAt === "tabs") throw failure;
            return subscribe(listener);
          },
          snippets: {
            load: async () => ({ snippets: [] }),
            subscribeToToggle: (listener) => {
              if (failureAt === "snippets") throw failure;
              return subscribe(listener);
            },
          },
        },
      ),
    ).toThrow(failure);
    expect(removals.length).toBeGreaterThan(0);
    for (const remove of removals) expect(remove).toHaveBeenCalledOnce();
    expect(mount.mock.calls[0]![2].abortSignal?.aborted).toBe(true);
    finish(surface);
    await vi.waitFor(() => expect(surface.dispose).toHaveBeenCalledOnce());
    window.dispatchEvent(new Event("pagehide"));
    for (const remove of removals) expect(remove).toHaveBeenCalledOnce();
  },
);

it("preserves a live owner's genuine mount rejection", async () => {
  const failure = new Error("genuine mount failure");
  const remove = vi.fn();
  const host = mountTerminalWindowPage(createPageElements(), {
    createAdapter: createAdapterFactory(),
    mount: async () => {
      throw failure;
    },
    subscribeToTabCommands: () => remove,
  });
  await expect(host.ready).rejects.toBe(failure);
  host.dispose();
  expect(remove).toHaveBeenCalledOnce();
});
