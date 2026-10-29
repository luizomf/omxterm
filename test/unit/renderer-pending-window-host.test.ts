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
  };
}

it.each([true, false])(
  "receives related actions during first mount and cleans early subscriptions (settle before pagehide: %s)",
  async (settleBeforeHide) => {
    type Options = Parameters<typeof mountTerminalWindowPage>[1];
    const removals = Array.from({ length: 6 }, () => vi.fn());
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
    const mount = vi.fn<NonNullable<Options["mount"]>>(() => pending);
    const host = mountTerminalWindowPage(
      { ...elements, auxiliaryPanel: aside },
      {
        createAdapter: createAdapterFactory(),
        mount,
        subscribeToFontZoom: zoom,
        subscribeToClipboardActions: clipboard,
        subscribeToTabBarToggle: tabbar,
        subscribeToFind: find,
        subscribeToTabCommands: commands,
        snippets: { load, subscribeToToggle: snippets },
      },
    );
    try {
      let ready = false;
      void host.ready.then(() => {
        ready = true;
      });
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
      if (settleBeforeHide) {
        expect(surface.zoom).toHaveBeenCalledExactlyOnceWith("in");
        expect(document.activeElement).toBe(search);
        mount.mockImplementation(async () => createSurface());
        commands.mock.calls[0]![0]({ action: "new" });
        expect(elements.tabsContainer.children).toHaveLength(2);
        expect(elements.tabStrip.hidden).toBe(true); // Early toggle retained.
        window.dispatchEvent(new Event("pagehide"));
      }
      host.dispose();
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

it.each(["clipboard", "tabs", "snippets"] as const)(
  "cleans partial synchronous setup when %s registration throws",
  async (failureAt) => {
    const elements = createPageElements();
    const aside = document.createElement("aside");
    document.body.append(aside);
    const removeZoom = vi.fn();
    const removeClipboard = vi.fn();
    const removeTabs = vi.fn();
    const removeConfiguration = vi.fn();
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
          subscribeToConfigurationUpdates: () => removeConfiguration,
          subscribeToFontZoom: () => removeZoom,
          subscribeToClipboardActions() {
            if (failureAt === "clipboard") throw failure;
            return removeClipboard;
          },
          subscribeToTabCommands() {
            if (failureAt === "tabs") throw failure;
            return removeTabs;
          },
          snippets: {
            load: async () => ({ snippets: [] }),
            subscribeToToggle() {
              throw failure;
            },
          },
        },
      ),
    ).toThrow(failure);
    expect(removeZoom).toHaveBeenCalledOnce();
    expect(removeConfiguration).toHaveBeenCalledOnce();
    expect(removeClipboard).toHaveBeenCalledTimes(
      failureAt === "clipboard" ? 0 : 1,
    );
    expect(removeTabs).toHaveBeenCalledTimes(failureAt === "snippets" ? 1 : 0);
    expect(mount.mock.calls[0]![2].abortSignal?.aborted).toBe(true);
    finish(surface);
    await vi.waitFor(() => expect(surface.dispose).toHaveBeenCalledOnce());
    window.dispatchEvent(new Event("pagehide"));
    expect(removeZoom).toHaveBeenCalledOnce();
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
