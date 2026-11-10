// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyThemes } from "../fixtures/settings-themes";
import {
  createFakeSurface,
  createTabsHarness,
} from "../fixtures/terminal-tabs-harness";
import { base, saved } from "../fixtures/settings-dialog-dom";
import type {
  CapturedLayout,
  InitialLayout,
  TerminalLayoutBridge,
} from "../../src/shared/terminal-layout";

const owners: { dispose(): void }[] = [];
afterEach(() => {
  for (const owner of owners.splice(0)) owner.dispose();
  vi.restoreAllMocks();
  document.body.replaceChildren();
});
const token = (number: number) =>
  `00000000-0000-0000-0000-${String(number).padStart(12, "0")}`;
function plan(): InitialLayout {
  return {
    selected: 1,
    fallbacks: 2,
    tabs: [0, 1].map((tab) => ({
      root: 0,
      focused: 1,
      nodes: [
        { direction: "row", children: [1, 2], weights: [0.3, 0.7] },
        { pane: 0 },
        { pane: 1 },
      ],
      panes: [token(tab * 2 + 1), token(tab * 2 + 2)],
    })),
  };
}
function captureBridge() {
  let capture!: () => CapturedLayout;
  const remove = vi.fn();
  const bridge: TerminalLayoutBridge = {
    initial: async () => null,
    onCapture(listener) {
      capture = listener;
      return remove;
    },
    cancel: vi.fn(),
  };
  return { bridge, capture: () => capture(), remove };
}

describe("initial saved-window layout ownership", () => {
  it("allocates every restored pane, prioritizes selected focus, bounds concurrency and readies independently", async () => {
    const releases: (() => void)[] = [];
    const captured = captureBridge();
    const h = createTabsHarness({
      beforeStart: () => new Promise<void>((resolve) => releases.push(resolve)),
      tabsOptions: { initialLayout: plan(), layout: captured.bridge },
    });
    owners.push(h.tabs);
    expect(h.createAdapter).toHaveBeenCalledTimes(4);
    expect(h.createAdapter.mock.calls).toEqual(
      plan().tabs.flatMap((tab) =>
        tab.panes.map((token) => [undefined, undefined, token]),
      ),
    );
    expect(h.container.querySelectorAll(".terminal-surface")).toHaveLength(4);
    expect(h.container.children).toHaveLength(2);
    expect(h.mount).toHaveBeenCalledTimes(2);
    const panes = h.container.querySelectorAll(".terminal-surface");
    expect(h.mount.mock.calls[0]![0]).toBe(panes[3]);
    expect(captured.capture().tabs.map((tab) => tab.panes)).toEqual([
      [null, null],
      [null, null],
    ]);
    releases[0]!();
    await h.tabs.ready;
    expect(h.mount).toHaveBeenCalledTimes(3);
    expect(h.surfaces).toHaveLength(1);
    expect(
      document
        .querySelector(".terminal-layout-status")
        ?.getAttribute("data-phase"),
    ).toBe("initializing");
    releases[1]!();
    await vi.waitFor(() => expect(h.mount).toHaveBeenCalledTimes(4));
    releases[2]!();
    releases[3]!();
    await vi.waitFor(() =>
      expect(
        document
          .querySelector(".terminal-layout-status")
          ?.getAttribute("data-phase"),
      ).toBe("completed"),
    );
    expect(
      document.querySelector(".terminal-layout-status")?.textContent,
    ).toContain("2 folder fallbacks");
    expect(captured.capture().selected).toBe(1);
    expect(captured.capture().tabs[1]!.focused).toBe(1);
  });

  it("closes pending owners without starting queued panes and observes late mounts", async () => {
    const releases: (() => void)[] = [];
    const h = createTabsHarness({
      beforeStart: () => new Promise<void>((resolve) => releases.push(resolve)),
      tabsOptions: { initialLayout: plan() },
    });
    owners.push(h.tabs);
    // Selected tab owns the two in-flight mounts; closing the other tab cancels
    // both queued owners, not just the currently mounted one.
    h.tabs.handleCommand({ action: "previous" });
    h.tabs.handleCommand({ action: "close" });
    expect(h.adapters[0]!.close).toHaveBeenCalledOnce();
    expect(h.adapters[1]!.close).toHaveBeenCalledOnce();
    releases[0]!();
    releases[1]!();
    await h.tabs.ready;
    await vi.waitFor(() =>
      expect(
        document
          .querySelector(".terminal-layout-status")
          ?.getAttribute("data-phase"),
      ).toBe("partial"),
    );
    expect(h.mount).toHaveBeenCalledTimes(2);
    expect(h.adapters[0]!.start).not.toHaveBeenCalled();
    expect(h.adapters[1]!.start).not.toHaveBeenCalled();
  });

  it("keeps successful siblings and truthful status when the first selected pane fails", async () => {
    const h = createTabsHarness({
      failMountAt: 1,
      tabsOptions: { initialLayout: plan() },
    });
    owners.push(h.tabs);
    await expect(h.tabs.ready).rejects.toThrow();
    await vi.waitFor(() =>
      expect(
        document
          .querySelector(".terminal-layout-status")
          ?.getAttribute("data-phase"),
      ).toBe("partial"),
    );
    expect(h.createAdapter).toHaveBeenCalledTimes(4);
    expect(h.surfaces).toHaveLength(3);
    expect(h.adapters[3]!.close).toHaveBeenCalledOnce();
    for (const surface of h.surfaces)
      expect(surface.dispose).not.toHaveBeenCalled();
  });

  it("does not mistake an early shell exit for an empty restored window", async () => {
    let first = true;
    const empty = vi.fn();
    const h = createTabsHarness({
      tabsOptions: {
        initialLayout: plan(),
        notifyEmpty: empty,
        async mount(_container, adapter) {
          const early = first;
          first = false;
          await adapter.start({ onOutput: vi.fn(), onExit: vi.fn() });
          if (early)
            h.adapters[3]!.handlers!.onExit({ exitCode: 0, signal: 0 });
          return createFakeSurface();
        },
      },
    });
    owners.push(h.tabs);
    await h.tabs.ready;
    await vi.waitFor(() =>
      expect(
        document
          .querySelector(".terminal-layout-status")
          ?.getAttribute("data-phase"),
      ).toBe("partial"),
    );
    expect(empty).not.toHaveBeenCalled();
    expect(h.container.children).toHaveLength(2);
    expect(h.container.querySelectorAll(".terminal-surface")).toHaveLength(3);
  });

  it("remembers the last surviving terminal selection behind a retained graphical tab", async () => {
    const captured = captureBridge();
    const h = createTabsHarness({
      tabsOptions: {
        layout: captured.bridge,
        settings: {
          themes: vi.fn(async () => emptyThemes),
          snapshot: vi.fn(async () => base),
          change: vi.fn(async () => saved(base)),
          saveText: vi.fn(async () => saved(base)),
          changeKeybind: vi.fn(),
          captureShortcut: vi.fn(() => () => {}),
          onOpen: () => () => {},
        },
      },
    });
    owners.push(h.tabs);
    await h.tabs.ready;
    h.tabs.handleCommand({ action: "new" });
    h.tabs.handleCommand({ action: "new" });
    await vi.waitFor(() => expect(h.surfaces).toHaveLength(3));
    h.tabs.openSettings();
    expect(captured.capture()).toMatchObject({ selected: 2, omitted: 1 });
    h.tabs.handleCommand({ action: "close-session", sessionId: "s3" });
    expect(captured.capture()).toMatchObject({ selected: 1, omitted: 1 });
    expect(captured.capture().tabs.map((tab) => tab.panes)).toEqual([
      ["s1"],
      ["s2"],
    ]);
    h.tabs.dispose();
    expect(captured.remove).toHaveBeenCalledOnce();
  });
});
