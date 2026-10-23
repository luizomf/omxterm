// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { MAX_PANES_PER_TAB } from "../../src/shared/terminal-contract";
import { createTabsHarness } from "../fixtures/terminal-tabs-harness";

async function splitHarness(
  options: Parameters<typeof createTabsHarness>[0] = {},
) {
  const harness = createTabsHarness(options);
  await harness.tabs.ready;
  harness.tabs.handleCommand({ action: "split", direction: "right" });
  await vi.waitFor(() => expect(harness.surfaces).toHaveLength(2));
  return harness;
}

const panes = (container: HTMLElement) => [
  ...container.querySelectorAll<HTMLElement>("main.terminal-surface"),
];

describe("split Terminal Panes", () => {
  it("splits the focused pane into an independent session and focuses it", async () => {
    const harness = await splitHarness();
    expect(harness.container.children).toHaveLength(1);
    const tab = harness.container.children[0] as HTMLElement;
    expect(tab.classList.contains("split")).toBe(true);
    expect(
      tab.querySelector(".terminal-pane-split")?.getAttribute("data-direction"),
    ).toBe("row");
    expect(tab.querySelectorAll(".terminal-pane-divider")).toHaveLength(1);
    expect(panes(harness.container).map((pane) => pane.hidden)).toEqual([
      false,
      false,
    ]);
    expect(harness.adapters).toHaveLength(2);
    expect(harness.notifySelection).toHaveBeenLastCalledWith("s2", [
      "s1",
      "s2",
    ]);
    expect(harness.surfaces[1]!.focus).toHaveBeenCalled();
    harness.tabs.clipboardAction("paste");
    expect(harness.surfaces[1]!.paste).toHaveBeenCalledOnce();
    expect(harness.surfaces[0]!.paste).not.toHaveBeenCalled();
  });

  it("removes only the pane whose shell exited and returns focus to its neighbor", async () => {
    const harness = await splitHarness();
    harness.adapters[1]!.handlers!.onExit({ exitCode: 0, signal: 0 });
    expect(panes(harness.container)).toHaveLength(1);
    expect(harness.container.children).toHaveLength(1);
    expect(
      (harness.container.children[0] as HTMLElement).classList.contains(
        "split",
      ),
    ).toBe(false);
    expect(harness.notifySelection).toHaveBeenLastCalledWith("s1");
    harness.tabs.injectText("x");
    expect(harness.surfaces[0]!.inject).toHaveBeenCalledWith("x");
  });

  it("opens the first tab with a startup launch that keeps a failed screen and reconnects", async () => {
    const spec = { kind: "quick-ssh", target: "admin@example.com" } as const;
    const harness = createTabsHarness({
      initialLaunch: { spec, label: "admin@example.com", retainOnExit: true },
    });
    await harness.tabs.ready;
    expect(harness.createAdapter).toHaveBeenLastCalledWith(spec);
    expect(harness.mountedSurfaceOptions[0]!.retainOnExit).toBe(true);
    harness.adapters[0]!.handlers!.onExit({ exitCode: 255, signal: 0 });
    const banner = harness.container.querySelector(".pane-ended-banner")!;
    expect(banner).not.toBeNull();
    banner.querySelector("button")!.click();
    await vi.waitFor(() => expect(harness.surfaces).toHaveLength(2));
    expect(harness.createAdapter).toHaveBeenLastCalledWith(spec);
    expect(harness.container.querySelector(".pane-ended-banner")).toBeNull();
  });

  it("opens search in the focused pane only", async () => {
    const harness = await splitHarness();
    harness.tabs.handleCommand({ action: "find" });
    expect(harness.surfaces[1]!.toggleSearch).toHaveBeenCalledOnce();
    expect(harness.surfaces[0]!.toggleSearch).not.toHaveBeenCalled();
  });

  it("keeps a signalled pane until main acknowledges it", async () => {
    const harness = await splitHarness();
    harness.adapters[0]!.handlers!.onExit({ exitCode: 0, signal: 9 });
    expect(panes(harness.container)).toHaveLength(2);
    harness.tabs.handleCommand({ action: "close-session", sessionId: "s1" });
    expect(panes(harness.container)).toHaveLength(1);
    expect(harness.surfaces[0]!.dispose).toHaveBeenCalledOnce();
    expect(harness.surfaces[1]!.dispose).not.toHaveBeenCalled();
  });

  it("closes the focused pane, and the whole tab only with its last pane", async () => {
    const harness = await splitHarness();
    harness.tabs.handleCommand({ action: "close-pane" });
    expect(harness.surfaces[1]!.dispose).toHaveBeenCalledOnce();
    expect(harness.surfaces[0]!.dispose).not.toHaveBeenCalled();
    expect(harness.container.children).toHaveLength(1);
    harness.tabs.handleCommand({ action: "close-pane" });
    expect(harness.surfaces[0]!.dispose).toHaveBeenCalledOnce();
    expect(harness.container.children).toHaveLength(0);
  });

  it("retains a prepared pane close target even after focus moves", async () => {
    const harness = await splitHarness();
    harness.tabs.handleCommand({ action: "prepare-close-pane" });
    harness.tabs.handleCommand({ action: "focus-pane", target: "previous" });
    harness.tabs.handleCommand({ action: "resolve-close", confirmed: true });
    harness.tabs.handleCommand({ action: "resolve-close", confirmed: true });
    expect(harness.surfaces[1]!.dispose).toHaveBeenCalledOnce();
    expect(harness.surfaces[0]!.dispose).not.toHaveBeenCalled();
  });

  it("closes every pane when the tab closes", async () => {
    const harness = await splitHarness();
    harness.tabs.handleCommand({ action: "close" });
    expect(harness.surfaces[0]!.dispose).toHaveBeenCalledOnce();
    expect(harness.surfaces[1]!.dispose).toHaveBeenCalledOnce();
    expect(harness.container.children).toHaveLength(0);
  });

  it("maximizes and restores the focused pane without drawing hidden panes", async () => {
    const harness = await splitHarness();
    harness.tabs.handleCommand({ action: "toggle-maximize-pane" });
    expect(panes(harness.container).map((pane) => pane.hidden)).toEqual([
      true,
      false,
    ]);
    harness.tabs.handleCommand({ action: "toggle-maximize-pane" });
    expect(panes(harness.container).map((pane) => pane.hidden)).toEqual([
      false,
      false,
    ]);
    // Panes of an unselected tab are hidden at the Surface level as well.
    harness.tabs.handleCommand({ action: "new" });
    await vi.waitFor(() => expect(harness.surfaces).toHaveLength(3));
    expect(panes(harness.container).map((pane) => pane.hidden)).toEqual([
      true,
      true,
      false,
    ]);
  });

  it("equalizes resized panes and cycles focus between them", async () => {
    const harness = await splitHarness();
    harness.tabs.handleCommand({ action: "split", direction: "right" });
    await vi.waitFor(() => expect(harness.surfaces).toHaveLength(3));
    harness.tabs.handleCommand({ action: "equalize-panes" });
    expect(panes(harness.container).map((pane) => pane.style.flexGrow)).toEqual(
      Array(3).fill(String(1 / 3)),
    );
    harness.tabs.handleCommand({ action: "focus-pane", target: "next" });
    expect(harness.notifySelection).toHaveBeenLastCalledWith("s1", [
      "s1",
      "s2",
      "s3",
    ]);
    expect(harness.tabs.focusedSessionId()).toBe("s1");
  });

  it("resizes with the keyboard on an accessible divider", async () => {
    const harness = await splitHarness();
    const divider = harness.container.querySelector<HTMLElement>(
      ".terminal-pane-divider",
    )!;
    expect(divider.getAttribute("role")).toBe("separator");
    expect(divider.getAttribute("aria-valuenow")).toBe("50");
    divider.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowRight" }));
    expect(divider.getAttribute("aria-valuenow")).toBe("52");
    expect(harness.container.querySelector(".terminal-pane-divider")).toBe(
      divider,
    );
  });

  it("limits panes per tab", async () => {
    const harness = createTabsHarness();
    await harness.tabs.ready;
    for (let index = 0; index < MAX_PANES_PER_TAB + 3; index += 1)
      harness.tabs.handleCommand({ action: "split", direction: "down" });
    await vi.waitFor(() =>
      expect(harness.surfaces).toHaveLength(MAX_PANES_PER_TAB),
    );
    expect(panes(harness.container)).toHaveLength(MAX_PANES_PER_TAB);
  });

  it("drops a split pane whose mount failed without disturbing its tab", async () => {
    const harness = createTabsHarness({ failMountAt: 2 });
    await harness.tabs.ready;
    harness.tabs.handleCommand({ action: "split", direction: "right" });
    await vi.waitFor(() => expect(panes(harness.container)).toHaveLength(1));
    expect(harness.surfaces[0]!.dispose).not.toHaveBeenCalled();
    expect(harness.tabs.focusedSessionId()).toBe("s1");
  });
});

describe("input broadcasting", () => {
  it("mirrors only the focused pane's keyboard input after confirmation", async () => {
    const confirmBroadcast = vi.fn(async () => true);
    const onBroadcastChange = vi.fn();
    const harness = await splitHarness({ confirmBroadcast, onBroadcastChange });
    harness.tabs.handleCommand({ action: "toggle-broadcast" });
    await vi.waitFor(() => expect(onBroadcastChange).toHaveBeenCalledWith(1));
    expect(confirmBroadcast).toHaveBeenCalledWith(1);
    expect(harness.strip.hidden).toBe(true);

    harness.mountedSurfaceOptions[1]!.onUserInput!("ls\r");
    expect(harness.adapters[0]!.write).toHaveBeenCalledWith("ls\r");
    // Input from an unfocused pane is never mirrored.
    harness.mountedSurfaceOptions[0]!.onUserInput!("pwd\r");
    expect(harness.adapters[1]!.write).not.toHaveBeenCalled();

    harness.tabs.handleCommand({ action: "toggle-broadcast" });
    expect(onBroadcastChange).toHaveBeenLastCalledWith(0);
    harness.mountedSurfaceOptions[1]!.onUserInput!("whoami\r");
    expect(harness.adapters[0]!.write).toHaveBeenCalledTimes(1);
  });

  it("does nothing when declined or with a single pane", async () => {
    const confirmBroadcast = vi.fn(async () => false);
    const harness = await splitHarness({ confirmBroadcast });
    harness.tabs.handleCommand({ action: "toggle-broadcast" });
    await vi.waitFor(() => expect(confirmBroadcast).toHaveBeenCalled());
    await Promise.resolve();
    harness.mountedSurfaceOptions[1]!.onUserInput!("ls\r");
    expect(harness.adapters[0]!.write).not.toHaveBeenCalled();

    const single = createTabsHarness({ confirmBroadcast });
    await single.tabs.ready;
    confirmBroadcast.mockClear();
    single.tabs.handleCommand({ action: "toggle-broadcast" });
    expect(confirmBroadcast).not.toHaveBeenCalled();
  });

  it("stops when the broadcasting tab drops to one pane", async () => {
    const onBroadcastChange = vi.fn();
    const harness = await splitHarness({ onBroadcastChange });
    harness.tabs.handleCommand({ action: "toggle-broadcast" });
    expect(onBroadcastChange).toHaveBeenLastCalledWith(1);
    harness.tabs.handleCommand({ action: "close-pane" });
    expect(onBroadcastChange).toHaveBeenLastCalledWith(0);
  });
});
