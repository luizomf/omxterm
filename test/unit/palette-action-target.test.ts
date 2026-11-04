// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { emptyThemes } from "../fixtures/settings-themes";
import { createTabsHarness } from "../fixtures/terminal-tabs-harness";
import { base } from "../fixtures/settings-dialog-dom";

it("captures retained Settings ownership without requiring a Surface", async () => {
  const h = createTabsHarness({
    tabsOptions: {
      settings: {
        themes: vi.fn(async () => emptyThemes),
        snapshot: async () => base,
        change: vi.fn(),
        saveText: vi.fn(),
        changeKeybind: vi.fn(),
        captureShortcut: () => () => {},
        onOpen: () => () => {},
      },
    },
  });
  await h.tabs.ready;
  h.tabs.openSettings();
  const settings = h.tabs.captureActionTarget();
  expect(settings.isCurrent()).toBe(true);
  h.tabs.handleCommand({ action: "previous" });
  h.tabs.openSettings();
  expect(settings.isCurrent()).toBe(false);
  const retained = h.tabs.captureActionTarget();
  expect(retained.isCurrent()).toBe(true);
  h.tabs.handleCommand({ action: "close" });
  expect(retained.isCurrent()).toBe(false);
  h.tabs.dispose();
});

it("invalidates captured tab ownership monotonically on away/back selection", async () => {
  const h = createTabsHarness();
  await h.tabs.ready;
  const first = h.tabs.captureActionTarget();
  expect(first.isCurrent()).toBe(true);
  h.tabs.handleCommand({ action: "new" });
  await vi.waitFor(() => expect(h.surfaces).toHaveLength(2));
  h.tabs.handleCommand({ action: "previous" });
  expect(first.isCurrent()).toBe(false);
  const second = h.tabs.captureActionTarget();
  expect(second.isCurrent()).toBe(true);
  h.tabs.dispose();
  expect(second.isCurrent()).toBe(false);
});
it("invalidates on focused pane away/back and owner death", async () => {
  const h = createTabsHarness();
  await h.tabs.ready;
  h.sessionAdapters[0]!.resize({ cols: 120, rows: 40 });
  h.tabs.handleCommand({ action: "split", direction: "right" });
  await vi.waitFor(() => expect(h.surfaces).toHaveLength(2));
  const target = h.tabs.captureActionTarget();
  h.tabs.handleCommand({ action: "focus-pane", target: "previous" });
  h.tabs.handleCommand({ action: "focus-pane", target: "next" });
  expect(target.isCurrent()).toBe(false);
  const live = h.tabs.captureActionTarget();
  expect(live.isCurrent()).toBe(true);
  h.adapters[1]!.handlers!.onExit({ exitCode: 1, signal: 9 });
  expect(live.isCurrent()).toBe(false);
  h.tabs.dispose();
});
