// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { createTabsHarness } from "../fixtures/terminal-tabs-harness";
import { createTabSelection } from "../../src/main/terminal-tab-selection";
import { startTerminalApplication } from "../../src/main/terminal-application";

afterEach(() => vi.restoreAllMocks());

it("reports a retained dead focused pane without borrowing another tab's busy decision", async () => {
  const snapshots: unknown[] = [];
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
  const harness = createTabsHarness({
    tabsOptions: {
      notifySelection(sessionId, tabSessionIds) {
        snapshots.push({ sessionId, tabSessionIds });
        selection.tabSelected({ sessionId, tabSessionIds });
      },
    },
  });
  await harness.tabs.ready;
  harness.tabs.handleCommand({ action: "new" });
  await vi.waitFor(() => expect(harness.surfaces).toHaveLength(2));
  harness.sessionAdapters[1]!.resize({ cols: 120, rows: 40 });
  harness.tabs.handleCommand({ action: "split", direction: "right" });
  await vi.waitFor(() => expect(harness.surfaces).toHaveLength(3));
  sessions.delete("s3");
  harness.adapters[2]!.handlers!.onExit({ exitCode: 0, signal: 9 });
  harness.tabs.handleCommand({ action: "previous" });
  harness.tabs.handleCommand({ action: "next" });
  expect(snapshots.at(-1)).toEqual({ sessionId: null, tabSessionIds: ["s2"] });
  expect(selection.hasBusySelectedSession()).toBe(true);
  expect(selection.hasBusyFocusedSession()).toBe(false);
  sessions.delete("s2");
  harness.adapters[1]!.handlers!.onExit({ exitCode: 0, signal: 0 });
  expect(snapshots.at(-1)).toEqual({ sessionId: null, tabSessionIds: [] });
  expect(selection.hasBusySelectedSession()).toBe(false);
  expect(selection.hasBusyFocusedSession()).toBe(false);
  harness.tabs.dispose();
});

it("Close Tab confirms the busy sibling while its focused pane is still mounting", async () => {
  let finish!: () => void;
  const pending = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const sessions = new Map([
    ["s1", false],
    ["s2", true],
  ]);
  const selection = createTabSelection({
    routed: (id) =>
      sessions.has(id) ? { busy: sessions.get(id)! } : undefined,
    current: (id) =>
      sessions.has(id) ? { busy: sessions.get(id)! } : undefined,
    isBusy: (state) => state.busy,
    hasBusySession: () => true,
    reject: () => {
      throw new Error("Invalid selection");
    },
    onSessionSelected: vi.fn(),
  });
  const harness = createTabsHarness({
    beforeStart: async (index) => {
      if (index === 3) await pending;
    },
    tabsOptions: {
      notifySelection: (sessionId, tabSessionIds) =>
        selection.tabSelected({ sessionId, tabSessionIds }),
    },
  });
  await harness.tabs.ready;
  harness.tabs.handleCommand({ action: "new" });
  await vi.waitFor(() => expect(harness.surfaces).toHaveLength(2));
  harness.sessionAdapters[1]!.resize({ cols: 120, rows: 40 });
  harness.tabs.handleCommand({ action: "split", direction: "right" });
  harness.tabs.handleCommand({ action: "previous" });
  expect(selection.hasBusySelectedSession()).toBe(false);
  harness.tabs.handleCommand({ action: "next" });
  expect(selection.hasBusySelectedSession()).toBe(true);
  expect(selection.hasBusyFocusedSession()).toBe(false);

  const window = {
    isDestroyed: () => false,
    close: vi.fn(),
    isFullScreen: () => false,
    setFullScreen: vi.fn(),
    isAlwaysOnTop: () => false,
    setAlwaysOnTop: vi.fn(),
  };
  let answer!: (confirmed: boolean) => void;
  const confirm = vi.fn(
    () =>
      new Promise<boolean>((resolve) => {
        answer = resolve;
      }),
  );
  const app = startTerminalApplication({
    createWindow: () => ({
      window,
      sessionActivity: { ...selection, hasBusySession: () => true },
      load: async () => {},
    }),
    getSelectedWindow: () => window,
    showQuitConfirmation: async () => true,
    showCloseWindowConfirmation: async () => true,
    showCloseTabConfirmation: confirm,
    showSessionFailure: async () => {},
    sendFontZoom: vi.fn(),
    sendClipboardAction: vi.fn(),
    sendSnippetsToggle: vi.fn(),
    sendTabBarToggle: vi.fn(),
    sendFind: vi.fn(),
    sendTitleBarToggle: vi.fn(),
    sendLocalImageOpen: vi.fn(),
    toggleDeveloperTools: vi.fn(),
    quit: vi.fn(),
    sendTabCommand: (_, command) => harness.tabs.handleCommand(command),
  });
  await app.newWindow();
  const closing = app.closeSelectedTab();
  expect(confirm).toHaveBeenCalledOnce();
  expect(harness.surfaces[1]!.dispose).not.toHaveBeenCalled();
  // The decision stays with B even after selecting A.
  harness.tabs.handleCommand({ action: "previous" });
  answer(true);
  await closing;
  finish();
  await vi.waitFor(() => expect(harness.surfaces).toHaveLength(3));
  expect(harness.surfaces[0]!.dispose).not.toHaveBeenCalled();
  expect(harness.surfaces[1]!.dispose).toHaveBeenCalledOnce();
  expect(harness.surfaces[2]!.dispose).toHaveBeenCalledOnce();
  harness.tabs.dispose();
});
