// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { createTerminalTabs } from "../../src/renderer/terminal-tabs";
import type { ElectronTerminalAdapter } from "../../src/renderer/electron-terminal-adapter";
import type {
  TerminalSessionAdapter,
  TerminalSessionHandlers,
} from "../../src/terminal-surface/terminal-session-adapter";
import type { TerminalSurfaceOptions } from "../../src/terminal-surface/terminal-surface";

function createFakeSurface() {
  return {
    focus: vi.fn(),
    applyTheme: vi.fn(),
    applyConfiguration: vi.fn(),
    zoom: vi.fn(),
    copy: vi.fn(async () => undefined),
    paste: vi.fn(async () => undefined),
    inject: vi.fn(async () => {}),
    selectAll: vi.fn(),
    dispose: vi.fn(),
  };
}

interface FakeAdapter extends ElectronTerminalAdapter {
  handlers: TerminalSessionHandlers | undefined;
}

function createTabsHarness(options: { failMountAt?: number } = {}) {
  document.body.innerHTML = "";
  document.body.className = "";
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  const strip = document.createElement("nav");
  strip.hidden = true;
  const container = document.createElement("div");
  document.body.append(strip, container);

  const adapters: FakeAdapter[] = [];
  const surfaces: ReturnType<typeof createFakeSurface>[] = [];
  let nextSession = 1;
  const createAdapter = vi.fn((): ElectronTerminalAdapter => {
    const sessionId = `s${nextSession}`;
    nextSession += 1;
    const adapter: FakeAdapter = {
      handlers: undefined,
      sessionId: () => sessionId,
      start: vi.fn(async (handlers: TerminalSessionHandlers) => {
        adapter.handlers = handlers;
      }),
      write: vi.fn(),
      resize: vi.fn(),
      close: vi.fn(),
    };
    adapters.push(adapter);
    return adapter;
  });
  let mountCount = 0;
  const mountedSurfaceOptions: TerminalSurfaceOptions[] = [];
  const mount = vi.fn(
    async (
      _container: HTMLElement,
      adapter: TerminalSessionAdapter,
      surfaceOptions: TerminalSurfaceOptions,
    ) => {
      mountCount += 1;
      if (mountCount === options.failMountAt)
        throw new Error("The Default Shell could not be started");
      mountedSurfaceOptions.push(surfaceOptions);
      await adapter.start({ onOutput: vi.fn(), onExit: vi.fn() });
      const surface = createFakeSurface();
      surfaces.push(surface);
      return surface;
    },
  );

  const notifySelection = vi.fn();
  const notifyTitle = vi.fn();
  const notifyBell = vi.fn();
  const tabs = createTerminalTabs(
    { strip, container },
    {
      createAdapter,
      mount,
      surfaceOptions: {},
      notifySelection,
      notifyTitle,
      notifyBell,
    },
  );
  return {
    tabs,
    strip,
    container,
    adapters,
    surfaces,
    mount,
    mountedSurfaceOptions,
    notifySelection,
    notifyTitle,
    notifyBell,
  };
}

function visibleContainers(container: HTMLElement): number[] {
  return [...container.children].map((child, index) =>
    (child as HTMLElement).hidden ? -1 : index,
  );
}

function selectedStates(strip: HTMLElement): string[] {
  return [...strip.querySelectorAll("button")].map(
    (button) => `${button.textContent}:${button.getAttribute("aria-selected")}`,
  );
}

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
