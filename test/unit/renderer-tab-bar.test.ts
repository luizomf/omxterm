// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { DEFAULT_TERMINAL_THEME } from "../../src/shared/terminal-theme";
import {
  createTabsHarness,
  visibleContainers,
  selectedStates,
  dragTabTo,
} from "../fixtures/terminal-tabs-harness";

describe("window-local tab bar visibility", () => {
  it("remembers disabling with one tab and restores the same selected Surface", async () => {
    const harness = createTabsHarness();
    await harness.tabs.ready;
    harness.tabs.toggleTabBar();
    expect(harness.strip.hidden).toBe(true);
    harness.tabs.handleCommand({ action: "new" });
    await vi.waitFor(() => expect(harness.surfaces).toHaveLength(2));
    expect(harness.strip.hidden).toBe(true);
    expect(document.body.classList.contains("tabs-visible")).toBe(false);
    const containers = [...harness.container.children];
    harness.surfaces.forEach((surface) => surface.focus.mockClear());
    harness.tabs.toggleTabBar();
    expect(harness.strip.hidden).toBe(false);
    expect(document.body.classList.contains("tabs-visible")).toBe(true);
    expect(selectedStates(harness.strip)).toEqual(["1:false", "2:true"]);
    expect([...harness.container.children]).toEqual(containers);
    expect(harness.surfaces[1]!.focus).toHaveBeenCalledOnce();
    expect(harness.surfaces[0]!.focus).not.toHaveBeenCalled();
    expect(harness.mount).toHaveBeenCalledTimes(2);
    for (const adapter of harness.adapters) {
      expect(adapter.resize).not.toHaveBeenCalled();
      expect(adapter.close).not.toHaveBeenCalled();
    }
    for (const surface of harness.surfaces)
      expect(surface.dispose).not.toHaveBeenCalled();
    harness.tabs.dispose();
  });

  it("enabling with one tab stays hidden and each new window starts enabled", async () => {
    const first = createTabsHarness();
    await first.tabs.ready;
    first.tabs.toggleTabBar();
    first.tabs.toggleTabBar();
    expect(first.strip.hidden).toBe(true);
    first.tabs.toggleTabBar();
    first.tabs.handleCommand({ action: "new" });
    await vi.waitFor(() => expect(first.surfaces).toHaveLength(2));
    const second = createTabsHarness();
    await second.tabs.ready;
    second.tabs.handleCommand({ action: "new" });
    await vi.waitFor(() => expect(second.surfaces).toHaveLength(2));
    expect(first.strip.hidden).toBe(true);
    expect(second.strip.hidden).toBe(false);
    first.tabs.toggleTabBar();
    expect(first.strip.hidden).toBe(false);
    expect(second.strip.hidden).toBe(false);
    first.tabs.dispose();
    second.tabs.dispose();
  });

  it("preserves hidden-strip navigation, titles, order and configuration", async () => {
    const harness = createTabsHarness();
    await harness.tabs.ready;
    harness.tabs.handleCommand({ action: "new" });
    await vi.waitFor(() => expect(harness.surfaces).toHaveLength(2));
    dragTabTo(harness.strip, 0, 175);
    harness.tabs.toggleTabBar();
    harness.tabs.setSessionTitle("s1", "updated");
    harness.tabs.setSessionTitle("s2", "🔔 background");
    harness.tabs.applyConfiguration({
      appearance: { fontSize: 20, lineHeight: 1, ligatures: true },
      padding: { top: 7, right: 8, bottom: 8, left: 8 },
      scrollbackLines: 100,
      optionKeyMode: "none",
      theme: DEFAULT_TERMINAL_THEME,
    });
    harness.tabs.handleCommand({ action: "next" });
    expect(visibleContainers(harness.container)).toEqual([0, -1]);
    harness.tabs.handleCommand({ action: "previous" });
    expect(visibleContainers(harness.container)).toEqual([-1, 1]);
    harness.tabs.handleCommand({ action: "select", position: 2 });
    expect(visibleContainers(harness.container)).toEqual([0, -1]);
    harness.tabs.handleCommand({ action: "new" });
    await vi.waitFor(() => expect(harness.surfaces).toHaveLength(3));
    expect(harness.strip.hidden).toBe(true);
    harness.tabs.handleCommand({ action: "close" });
    expect(harness.strip.hidden).toBe(true);
    harness.tabs.toggleTabBar();
    expect(selectedStates(harness.strip)).toEqual([
      "🔔 background:false",
      "updated:true",
    ]);
    expect(harness.mount).toHaveBeenCalledTimes(3);
    expect(harness.surfaces[0]!.dispose).not.toHaveBeenCalled();
    expect(harness.surfaces[1]!.dispose).not.toHaveBeenCalled();
    harness.strip.querySelector<HTMLButtonElement>("button")!.click();
    expect(visibleContainers(harness.container)).toEqual([-1, 1]);
    dragTabTo(harness.strip, 0, 175);
    expect(selectedStates(harness.strip)).toEqual([
      "updated:false",
      "🔔 background:true",
    ]);
    harness.tabs.dispose();
  });
});
