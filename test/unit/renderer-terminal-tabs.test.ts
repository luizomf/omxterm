// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createTerminalTabs } from "../../src/renderer/terminal-tabs";
import type { ElectronTerminalAdapter } from "../../src/renderer/electron-terminal-adapter";
import type { TerminalSurface } from "../../src/terminal-surface/terminal-surface";
import {
  createFakeSurface,
  createTabsHarness,
  visibleContainers,
  selectedStates,
  dragTabTo,
} from "../fixtures/terminal-tabs-harness";

describe("renderer retained Close Tab target", () => {
  it("consumes a prepared close once and never falls back to selection", async () => {
    const harness = createTabsHarness();
    await harness.tabs.ready;
    harness.tabs.handleCommand({ action: "resolve-close", confirmed: true });
    expect(harness.surfaces[0]!.dispose).not.toHaveBeenCalled();
    harness.tabs.handleCommand({ action: "new" });
    await vi.waitFor(() => expect(harness.surfaces).toHaveLength(2));
    harness.tabs.handleCommand({ action: "prepare-close" });
    harness.tabs.handleCommand({ action: "previous" });
    harness.tabs.handleCommand({ action: "resolve-close", confirmed: true });
    harness.tabs.handleCommand({ action: "resolve-close", confirmed: true });
    expect(harness.surfaces[1]!.dispose).toHaveBeenCalledOnce();
    expect(harness.surfaces[0]!.dispose).not.toHaveBeenCalled();
    expect(harness.container.children).toHaveLength(1);
    harness.tabs.dispose();
  });

  it("captures a mounting tab before it has a session id", async () => {
    const strip = document.createElement("nav");
    const container = document.createElement("div");
    let finishMount!: (surface: TerminalSurface) => void;
    const adapter: ElectronTerminalAdapter = {
      sessionId: () => undefined,
      start: async () => {},
      write() {},
      resize() {},
      close: vi.fn(),
    };
    const tabs = createTerminalTabs(
      { strip, container },
      {
        createAdapter: () => adapter,
        surfaceOptions: {},
        mount: () =>
          new Promise((resolve) => {
            finishMount = resolve;
          }),
      },
    );
    tabs.handleCommand({ action: "prepare-close" });
    tabs.handleCommand({ action: "resolve-close", confirmed: true });
    expect(adapter.close).toHaveBeenCalledOnce();
    expect(container.children).toHaveLength(0);
    const surface = createFakeSurface();
    finishMount(surface);
    await tabs.ready;
    expect(surface.dispose).toHaveBeenCalledOnce();
    tabs.dispose();
  });
});

describe("renderer Terminal Tabs", () => {
  it("renders a single tab without a strip, exactly like the pre-tab contract", async () => {
    const harness = createTabsHarness();
    await harness.tabs.ready;

    expect(harness.container.children).toHaveLength(1);
    expect((harness.container.children[0] as HTMLElement).hidden).toBe(false);
    expect(harness.strip.hidden).toBe(true);
    expect(document.body.classList.contains("tabs-visible")).toBe(false);
    expect(harness.strip.querySelectorAll("button")).toHaveLength(0);
  });

  it("shows the strip with two tabs and selects the newly created tab", async () => {
    const harness = createTabsHarness();
    await harness.tabs.ready;

    harness.tabs.handleCommand({ action: "new" });
    await vi.waitFor(() => expect(harness.surfaces).toHaveLength(2));

    expect(harness.strip.hidden).toBe(false);
    expect(document.body.classList.contains("tabs-visible")).toBe(true);
    expect(selectedStates(harness.strip)).toEqual(["1:false", "2:true"]);
    expect(visibleContainers(harness.container)).toEqual([-1, 1]);
    await vi.waitFor(() =>
      expect(harness.surfaces[1]!.focus).toHaveBeenCalled(),
    );
  });

  it("reorders existing tabs by horizontal drag while preserving selection and sessions", async () => {
    const harness = createTabsHarness();
    await harness.tabs.ready;
    harness.tabs.handleCommand({ action: "new" });
    harness.tabs.handleCommand({ action: "new" });
    await vi.waitFor(() => expect(harness.surfaces).toHaveLength(3));
    harness.tabs.setSessionTitle("s1", "one");
    harness.tabs.setSessionTitle("s2", "two");
    harness.tabs.setSessionTitle("s3", "three");

    dragTabTo(harness.strip, 0, 275);

    expect(selectedStates(harness.strip)).toEqual([
      "two:false",
      "three:true",
      "one:false",
    ]);
    expect(visibleContainers(harness.container)).toEqual([-1, -1, 2]);
    expect(harness.mount).toHaveBeenCalledTimes(3);

    dragTabTo(harness.strip, 2, 25);
    expect(selectedStates(harness.strip)).toEqual([
      "one:false",
      "two:false",
      "three:true",
    ]);
    expect(visibleContainers(harness.container)).toEqual([-1, -1, 2]);

    for (const adapter of harness.adapters)
      expect(adapter.close).not.toHaveBeenCalled();
    for (const surface of harness.surfaces)
      expect(surface.dispose).not.toHaveBeenCalled();
  });

  it("uses reordered positions for cycling and literal selection", async () => {
    const harness = createTabsHarness();
    await harness.tabs.ready;
    harness.tabs.handleCommand({ action: "new" });
    harness.tabs.handleCommand({ action: "new" });
    await vi.waitFor(() => expect(harness.surfaces).toHaveLength(3));
    harness.tabs.setSessionTitle("s1", "one");
    harness.tabs.setSessionTitle("s2", "two");
    harness.tabs.setSessionTitle("s3", "three");
    dragTabTo(harness.strip, 0, 275);

    harness.tabs.handleCommand({ action: "next" });
    expect(selectedStates(harness.strip)).toEqual([
      "two:false",
      "three:false",
      "one:true",
    ]);
    harness.tabs.handleCommand({ action: "select", position: 1 });
    expect(selectedStates(harness.strip)).toEqual([
      "two:true",
      "three:false",
      "one:false",
    ]);
    expect(visibleContainers(harness.container)).toEqual([-1, 1, -1]);
  });

  it("clicking a tab selects it and gives its Surface terminal focus", async () => {
    const harness = createTabsHarness();
    await harness.tabs.ready;
    harness.tabs.handleCommand({ action: "new" });
    await vi.waitFor(() => expect(harness.surfaces).toHaveLength(2));
    harness.surfaces[0]!.focus.mockClear();
    harness.notifySelection.mockClear();

    harness.strip.querySelectorAll("button")[0]!.click();

    expect(selectedStates(harness.strip)).toEqual(["1:true", "2:false"]);
    expect(visibleContainers(harness.container)).toEqual([0, -1]);
    expect(harness.surfaces[0]!.focus).toHaveBeenCalledOnce();
    expect(harness.notifySelection).toHaveBeenCalledExactlyOnceWith("s1");
  });

  it("reports the selected session to main across creation, switching, and closing", async () => {
    const harness = createTabsHarness();
    await harness.tabs.ready;
    expect(harness.notifySelection).toHaveBeenLastCalledWith("s1");

    harness.tabs.handleCommand({ action: "new" });
    await vi.waitFor(() => expect(harness.surfaces).toHaveLength(2));
    expect(harness.notifySelection).toHaveBeenLastCalledWith("s2");

    harness.tabs.handleCommand({ action: "close" });
    expect(harness.notifySelection).toHaveBeenLastCalledWith("s1");
  });

  it("cycles the selection with wraparound in both directions", async () => {
    const harness = createTabsHarness();
    await harness.tabs.ready;
    harness.tabs.handleCommand({ action: "new" });
    await vi.waitFor(() => expect(harness.surfaces).toHaveLength(2));
    harness.tabs.handleCommand({ action: "new" });
    await vi.waitFor(() => expect(harness.surfaces).toHaveLength(3));

    harness.tabs.handleCommand({ action: "next" });
    expect(selectedStates(harness.strip)).toEqual([
      "1:true",
      "2:false",
      "3:false",
    ]);
    harness.tabs.handleCommand({ action: "previous" });
    expect(selectedStates(harness.strip)).toEqual([
      "1:false",
      "2:false",
      "3:true",
    ]);
    harness.tabs.handleCommand({ action: "previous" });
    expect(selectedStates(harness.strip)).toEqual([
      "1:false",
      "2:true",
      "3:false",
    ]);
  });

  it("selects literal positions and ignores positions beyond the open tabs", async () => {
    const harness = createTabsHarness();
    await harness.tabs.ready;
    harness.tabs.handleCommand({ action: "new" });
    await vi.waitFor(() => expect(harness.surfaces).toHaveLength(2));

    harness.tabs.handleCommand({ action: "select", position: 1 });
    expect(selectedStates(harness.strip)).toEqual(["1:true", "2:false"]);

    harness.tabs.handleCommand({ action: "select", position: 9 });
    expect(selectedStates(harness.strip)).toEqual(["1:true", "2:false"]);
  });

  it("closes only the selected tab and returns to the single-tab contract", async () => {
    const harness = createTabsHarness();
    await harness.tabs.ready;
    harness.tabs.handleCommand({ action: "new" });
    await vi.waitFor(() => expect(harness.surfaces).toHaveLength(2));

    harness.tabs.handleCommand({ action: "close" });

    expect(harness.surfaces[1]!.dispose).toHaveBeenCalledOnce();
    expect(harness.surfaces[0]!.dispose).not.toHaveBeenCalled();
    expect(harness.container.children).toHaveLength(1);
    expect(harness.strip.hidden).toBe(true);
    expect(document.body.classList.contains("tabs-visible")).toBe(false);
    expect(harness.surfaces[0]!.focus).toHaveBeenCalled();
  });

  it("removes only the tab whose shell exited ordinarily", async () => {
    const harness = createTabsHarness();
    await harness.tabs.ready;
    harness.tabs.handleCommand({ action: "new" });
    await vi.waitFor(() => expect(harness.surfaces).toHaveLength(2));

    harness.adapters[0]!.handlers!.onExit({ exitCode: 3, signal: 0 });

    expect(harness.container.children).toHaveLength(1);
    expect(harness.strip.hidden).toBe(true);
    expect(selectedStates(harness.strip)).toEqual([]);
    expect(visibleContainers(harness.container)).toEqual([0]);
  });

  it("keeps a tab dead after an unexpected signal until main orders its removal", async () => {
    const harness = createTabsHarness();
    await harness.tabs.ready;
    harness.tabs.handleCommand({ action: "new" });
    await vi.waitFor(() => expect(harness.surfaces).toHaveLength(2));

    harness.adapters[0]!.handlers!.onExit({ exitCode: 0, signal: 9 });
    expect(harness.container.children).toHaveLength(2);

    harness.tabs.handleCommand({ action: "close-session", sessionId: "s1" });
    expect(harness.container.children).toHaveLength(1);
    expect(harness.strip.hidden).toBe(true);
  });

  it("applies Window Font Zoom to every tab and replays it onto a new tab", async () => {
    const harness = createTabsHarness();
    await harness.tabs.ready;
    harness.tabs.handleCommand({ action: "new" });
    await vi.waitFor(() => expect(harness.surfaces).toHaveLength(2));

    harness.tabs.zoom("in");
    harness.tabs.zoom("in");
    harness.tabs.zoom("out");
    expect(harness.surfaces[0]!.zoom.mock.calls).toEqual([
      ["in"],
      ["in"],
      ["out"],
    ]);
    expect(harness.surfaces[1]!.zoom.mock.calls).toEqual([
      ["in"],
      ["in"],
      ["out"],
    ]);

    harness.tabs.handleCommand({ action: "new" });
    await vi.waitFor(() => expect(harness.surfaces).toHaveLength(3));
    expect(harness.surfaces[2]!.zoom.mock.calls).toEqual([["in"]]);
  });

  it("keeps Window Font Zoom and Actual Size independent between windows", async () => {
    const firstWindow = createTabsHarness();
    const secondWindow = createTabsHarness();
    await Promise.all([firstWindow.tabs.ready, secondWindow.tabs.ready]);

    firstWindow.tabs.zoom("in");
    firstWindow.tabs.zoom("in");
    secondWindow.tabs.zoom("out");
    firstWindow.tabs.zoom("reset");

    expect(firstWindow.surfaces[0]!.zoom.mock.calls).toEqual([
      ["in"],
      ["in"],
      ["reset"],
    ]);
    expect(secondWindow.surfaces[0]!.zoom.mock.calls).toEqual([["out"]]);
  });

  it("keeps reordered positions independent between Terminal Windows", async () => {
    const firstWindow = createTabsHarness();
    await firstWindow.tabs.ready;
    firstWindow.tabs.handleCommand({ action: "new" });
    await vi.waitFor(() => expect(firstWindow.surfaces).toHaveLength(2));
    firstWindow.tabs.setSessionTitle("s1", "first-one");
    firstWindow.tabs.setSessionTitle("s2", "first-two");

    const secondWindow = createTabsHarness();
    await secondWindow.tabs.ready;
    secondWindow.tabs.handleCommand({ action: "new" });
    await vi.waitFor(() => expect(secondWindow.surfaces).toHaveLength(2));
    secondWindow.tabs.setSessionTitle("s1", "second-one");
    secondWindow.tabs.setSessionTitle("s2", "second-two");

    dragTabTo(firstWindow.strip, 0, 175);

    expect(selectedStates(firstWindow.strip)).toEqual([
      "first-two:true",
      "first-one:false",
    ]);
    expect(selectedStates(secondWindow.strip)).toEqual([
      "second-one:false",
      "second-two:true",
    ]);
  });

  it("routes clipboard actions and snippet injection to the selected tab only", async () => {
    const harness = createTabsHarness();
    await harness.tabs.ready;
    harness.tabs.handleCommand({ action: "new" });
    await vi.waitFor(() => expect(harness.surfaces).toHaveLength(2));

    harness.tabs.clipboardAction("copy");
    harness.tabs.clipboardAction("paste");
    harness.tabs.clipboardAction("select-all");
    harness.tabs.injectSnippet("printf hi", { submit: true });

    expect(harness.surfaces[1]!.copy).toHaveBeenCalledOnce();
    expect(harness.surfaces[1]!.paste).toHaveBeenCalledOnce();
    expect(harness.surfaces[1]!.selectAll).toHaveBeenCalledOnce();
    expect(harness.surfaces[1]!.inject).toHaveBeenCalledExactlyOnceWith(
      "printf hi",
      { submit: true },
    );
    expect(harness.surfaces[0]!.copy).not.toHaveBeenCalled();
    expect(harness.surfaces[0]!.inject).not.toHaveBeenCalled();
  });

  it("drops a tab whose additional spawn failed and restores the previous selection", async () => {
    const harness = createTabsHarness({ failMountAt: 2 });
    await harness.tabs.ready;

    harness.tabs.handleCommand({ action: "new" });
    await vi.waitFor(() => expect(harness.mount).toHaveBeenCalledTimes(2));

    expect(harness.container.children).toHaveLength(1);
    expect(harness.strip.hidden).toBe(true);
    expect(visibleContainers(harness.container)).toEqual([0]);
    expect(document.body.classList.contains("tabs-visible")).toBe(false);
  });

  it("tags title and BEL events with the emitting tab's session id", async () => {
    const harness = createTabsHarness();
    await harness.tabs.ready;
    harness.tabs.handleCommand({ action: "new" });
    await vi.waitFor(() => expect(harness.surfaces).toHaveLength(2));

    harness.mountedSurfaceOptions[0]!.onTitleRequest?.("first directory");
    harness.mountedSurfaceOptions[1]!.onTitleRequest?.("second directory");
    harness.mountedSurfaceOptions[1]!.onBell?.();

    expect(harness.notifyTitle.mock.calls).toEqual([
      ["s1", "first directory"],
      ["s2", "second directory"],
    ]);
    expect(harness.notifyBell).toHaveBeenCalledExactlyOnceWith("s2");
  });

  it("labels tabs with their session's display title pushed by main", async () => {
    const harness = createTabsHarness();
    await harness.tabs.ready;
    harness.tabs.handleCommand({ action: "new" });
    await vi.waitFor(() => expect(harness.surfaces).toHaveLength(2));

    expect(selectedStates(harness.strip)).toEqual(["1:false", "2:true"]);

    harness.tabs.setSessionTitle("s1", "vim");
    harness.tabs.setSessionTitle("s2", "🔔ssh m132");
    harness.tabs.setSessionTitle("s9", "unknown session");

    expect(selectedStates(harness.strip)).toEqual([
      "vim:false",
      "🔔ssh m132:true",
    ]);
  });

  it("disposes every tab on window teardown", async () => {
    const harness = createTabsHarness();
    await harness.tabs.ready;
    harness.tabs.handleCommand({ action: "new" });
    await vi.waitFor(() => expect(harness.surfaces).toHaveLength(2));

    harness.tabs.dispose();
    harness.tabs.dispose();

    expect(harness.surfaces[0]!.dispose).toHaveBeenCalledOnce();
    expect(harness.surfaces[1]!.dispose).toHaveBeenCalledOnce();
  });
});

describe("renderer Terminal Tabs pending disposal", () => {
  it("does not resurrect a tab disposed while its Surface is mounting", async () => {
    const strip = document.createElement("nav");
    const container = document.createElement("div");
    document.body.replaceChildren(strip, container);
    let finishMount: ((surface: TerminalSurface) => void) | undefined;
    const pendingMount = new Promise<TerminalSurface>((resolve) => {
      finishMount = resolve;
    });
    const adapter: ElectronTerminalAdapter = {
      sessionId: () => undefined,
      start: vi.fn(async () => undefined),
      write: vi.fn(),
      resize: vi.fn(),
      close: vi.fn(),
    };
    const surface = createFakeSurface();
    const tabs = createTerminalTabs(
      { strip, container },
      {
        createAdapter: () => adapter,
        mount: vi.fn(() => pendingMount),
        surfaceOptions: {},
      },
    );

    tabs.handleCommand({ action: "close" });
    expect(adapter.close).toHaveBeenCalledOnce();
    finishMount!(surface);
    await tabs.ready;

    expect(surface.dispose).toHaveBeenCalledOnce();
    expect(container.children).toHaveLength(0);
    tabs.dispose();
  });
});

describe("renderer Terminal Tabs fatal Surface isolation", () => {
  it("retains a runtime-failed tab until its session acknowledgement, leaving its peer alone", async () => {
    const onFatalError = vi.fn();
    const harness = createTabsHarness({ surfaceOptions: { onFatalError } });
    await harness.tabs.ready;
    harness.tabs.handleCommand({ action: "new" });
    await vi.waitFor(() => expect(harness.surfaces).toHaveLength(2));

    harness.mountedSurfaceOptions[1]!.onFatalError?.("backend lost");

    expect(onFatalError).toHaveBeenCalledExactlyOnceWith("backend lost");
    // Failure disposal belongs to the Surface, preserving its failure reason
    // rather than racing it with ordinary tab-close disposal.
    expect(harness.surfaces[1]!.dispose).not.toHaveBeenCalled();
    expect(harness.adapters[1]!.close).not.toHaveBeenCalled();
    expect(harness.surfaces[0]!.dispose).not.toHaveBeenCalled();
    expect(harness.container.children).toHaveLength(2);
    harness.tabs.handleCommand({ action: "close-session", sessionId: "s2" });
    expect(harness.container.children).toHaveLength(1);
    expect(harness.surfaces[1]!.dispose).toHaveBeenCalledOnce();
    expect(harness.surfaces[0]!.dispose).not.toHaveBeenCalled();
    expect(visibleContainers(harness.container)).toEqual([0]);
  });

  it("ignores title and BEL callbacks after their owning tab or window closes", async () => {
    const tabClosed = createTabsHarness();
    await tabClosed.tabs.ready;
    tabClosed.tabs.handleCommand({ action: "new" });
    await vi.waitFor(() => expect(tabClosed.surfaces).toHaveLength(2));
    const closedCallbacks = tabClosed.mountedSurfaceOptions[1]!;

    tabClosed.tabs.handleCommand({ action: "close" });
    closedCallbacks.onTitleRequest?.("late private title");
    closedCallbacks.onBell?.();

    expect(tabClosed.notifyTitle).not.toHaveBeenCalled();
    expect(tabClosed.notifyBell).not.toHaveBeenCalled();

    const windowClosed = createTabsHarness();
    await windowClosed.tabs.ready;
    const disposedCallbacks = windowClosed.mountedSurfaceOptions[0]!;
    windowClosed.tabs.dispose();
    disposedCallbacks.onTitleRequest?.("late window title");
    disposedCallbacks.onBell?.();

    expect(windowClosed.notifyTitle).not.toHaveBeenCalled();
    expect(windowClosed.notifyBell).not.toHaveBeenCalled();
  });
});

describe("renderer Terminal Tabs runtime configuration", () => {
  it("reconciles an update received while a Surface mount is pending", async () => {
    const { DEFAULT_TERMINAL_THEME } =
      await import("../../src/shared/terminal-theme");
    const strip = document.createElement("nav");
    const container = document.createElement("div");
    document.body.replaceChildren(strip, container);
    let finishMount: ((surface: TerminalSurface) => void) | undefined;
    const pendingMount = new Promise<TerminalSurface>((resolve) => {
      finishMount = resolve;
    });
    const adapter: ElectronTerminalAdapter = {
      sessionId: () => "s1",
      start: vi.fn(async () => undefined),
      write: vi.fn(),
      resize: vi.fn(),
      close: vi.fn(),
    };
    const surface = createFakeSurface();
    const tabs = createTerminalTabs(
      { strip, container },
      {
        createAdapter: () => adapter,
        mount: vi.fn(() => pendingMount),
        surfaceOptions: {
          appearance: { fontSize: 16, lineHeight: 1, ligatures: true },
          padding: { top: 0, right: 8, bottom: 8, left: 8 },
          scrollbackLines: 10_000,
          optionKeyMode: "none",
          theme: DEFAULT_TERMINAL_THEME,
        },
      },
    );
    const update = {
      appearance: { fontSize: 24, lineHeight: 1.25, ligatures: true },
      padding: { top: 1, right: 2, bottom: 3, left: 4 },
      scrollbackLines: 0,
      optionKeyMode: "both" as const,
      theme: DEFAULT_TERMINAL_THEME,
    };

    tabs.applyConfiguration(update);
    finishMount!(surface);
    await tabs.ready;

    expect(surface.applyConfiguration).toHaveBeenCalledExactlyOnceWith(update);
    expect(adapter.close).not.toHaveBeenCalled();
    tabs.dispose();
  });

  it("normalizes saturated zoom so current and future tabs share one delta", async () => {
    const { DEFAULT_TERMINAL_THEME } =
      await import("../../src/shared/terminal-theme");
    const initialConfiguration = {
      appearance: { fontSize: 8, lineHeight: 1, ligatures: true },
      padding: { top: 0, right: 8, bottom: 8, left: 8 },
      scrollbackLines: 10_000,
      optionKeyMode: "none" as const,
      theme: DEFAULT_TERMINAL_THEME,
    };
    const harness = createTabsHarness({
      surfaceOptions: initialConfiguration,
    });
    await harness.tabs.ready;

    for (let index = 0; index < 8; index += 1) harness.tabs.zoom("out");
    harness.tabs.applyConfiguration({
      ...initialConfiguration,
      appearance: { fontSize: 20, lineHeight: 1, ligatures: true },
    });
    harness.tabs.handleCommand({ action: "new" });
    await vi.waitFor(() => expect(harness.surfaces).toHaveLength(2));

    expect(harness.surfaces[1]!.zoom.mock.calls).toEqual(
      Array.from({ length: 7 }, () => ["out"]),
    );
  });

  it("preserves selection, titles, bell state, and sessions", async () => {
    const { DEFAULT_TERMINAL_THEME } =
      await import("../../src/shared/terminal-theme");
    const harness = createTabsHarness();
    await harness.tabs.ready;
    harness.tabs.handleCommand({ action: "new" });
    await vi.waitFor(() => expect(harness.surfaces).toHaveLength(2));
    harness.tabs.setSessionTitle("s1", "vim");
    harness.tabs.setSessionTitle("s2", "🔔ssh");
    harness.strip.querySelectorAll("button")[0]!.click();

    harness.tabs.applyConfiguration({
      appearance: { fontSize: 20, lineHeight: 1.2, ligatures: true },
      padding: { top: 1, right: 2, bottom: 3, left: 4 },
      scrollbackLines: 0,
      optionKeyMode: "both",
      theme: DEFAULT_TERMINAL_THEME,
    });

    expect(selectedStates(harness.strip)).toEqual(["vim:true", "🔔ssh:false"]);
    expect(visibleContainers(harness.container)).toEqual([0, -1]);
    for (const adapter of harness.adapters)
      expect(adapter.close).not.toHaveBeenCalled();
  });
});

describe("Scrollback Search routing", () => {
  it("opens search in the selected tab only", async () => {
    const harness = createTabsHarness();
    await harness.tabs.ready;
    harness.tabs.handleCommand({ action: "new" });
    await vi.waitFor(() => expect(harness.surfaces).toHaveLength(2));

    harness.tabs.find();

    expect(harness.surfaces[1]!.find).toHaveBeenCalledOnce();
    expect(harness.surfaces[0]!.find).not.toHaveBeenCalled();
  });
});

describe("explicit export routing", () => {
  it("reads export text from the selected tab only", async () => {
    const harness = createTabsHarness();
    await harness.tabs.ready;
    harness.tabs.handleCommand({ action: "new" });
    await vi.waitFor(() => expect(harness.surfaces).toHaveLength(2));
    harness.surfaces[1]!.exportText.mockReturnValue("second tab");

    expect(harness.tabs.exportText("content")).toBe("second tab");
    expect(harness.surfaces[1]!.exportText).toHaveBeenCalledExactlyOnceWith(
      "content",
    );
    expect(harness.surfaces[0]!.exportText).not.toHaveBeenCalled();
  });
});
