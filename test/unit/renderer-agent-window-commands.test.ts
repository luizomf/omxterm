// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { createTabsHarness } from "../fixtures/terminal-tabs-harness";

// An agent's window shortcuts (ADR 0052, #1052), run by the window once the
// pane they name is focused.
it("copies, selects and toggles the bars for an agent on the pane it names", async () => {
  let titleBar = true;
  const harness = createTabsHarness({
    tabsOptions: {
      showTabBar: true,
      toggleTitleBar: () => {
        titleBar = !titleBar;
        return true;
      },
    },
  });
  await harness.tabs.ready;
  harness.tabs.handleCommand({ action: "new" });
  await vi.waitFor(() => expect(harness.surfaces).toHaveLength(2));

  // s1 is in the hidden first tab: Copy takes its selection, not s2's.
  await expect(
    harness.tabs.runSessionCommand("one", "s1", { action: "copy" }),
  ).resolves.toEqual({ id: "one" });
  expect(harness.surfaces[0]!.copy).toHaveBeenCalledOnce();
  expect(harness.surfaces[1]!.copy).not.toHaveBeenCalled();
  await harness.tabs.runSessionCommand("two", "s2", {
    action: "select-all",
  });
  expect(harness.surfaces[1]!.selectAll).toHaveBeenCalledOnce();

  expect(harness.strip.hidden).toBe(false);
  await harness.tabs.runSessionCommand("three", "s2", {
    action: "toggle-tab-bar",
  });
  expect(harness.strip.hidden).toBe(true);
  await harness.tabs.runSessionCommand("four", "s2", {
    action: "toggle-title-bar",
  });
  expect(titleBar).toBe(false);
  harness.tabs.dispose();
});

it("answers unavailable when the title bar can't change", async () => {
  const harness = createTabsHarness({
    tabsOptions: { toggleTitleBar: () => false },
  });
  await harness.tabs.ready;
  await expect(
    harness.tabs.runSessionCommand("one", "s1", {
      action: "toggle-title-bar",
    }),
  ).resolves.toEqual({ id: "one", error: "unavailable" });
  harness.tabs.dispose();
});
