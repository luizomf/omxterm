import { describe, expect, it, vi } from "vitest";
import {
  startTerminalApplication,
  type NativeTerminalWindow,
  type TerminalWindowLifecycle,
} from "../../src/main/terminal-application";

function createWindowHarness(lifecycle: TerminalWindowLifecycle) {
  let destroyed = false;
  let fullScreen = false;
  let alwaysOnTop = false;
  // Sessions count as Busy by default so confirmation tests exercise dialogs.
  const busy = { selected: true, any: true };
  // Busy sessions by id, for an agent's close of named panes.
  const busySessions = new Set<string>();
  const closeSession = vi.fn();
  const setFullScreen = vi.fn((value: boolean) => {
    fullScreen = value;
  });
  const setAlwaysOnTop = vi.fn((value: boolean, _level: "floating") => {
    alwaysOnTop = value;
  });

  const window: NativeTerminalWindow = {
    isDestroyed: () => destroyed,
    close: vi.fn(() => {
      if (destroyed) return;
      destroyed = true;
      closeSession();
      lifecycle.onWindowClosed();
    }),
    isFullScreen: () => fullScreen,
    setFullScreen,
    isAlwaysOnTop: () => alwaysOnTop,
    setAlwaysOnTop,
  };

  return {
    window,
    lifecycle,
    closeSession,
    setFullScreen,
    setAlwaysOnTop,
    sessionActivity: {
      hasBusySelectedSession: () => busy.selected,
      hasBusySession: () => busy.any,
      hasBusySessionAmong: (ids: readonly string[]) =>
        ids.some((id) => busySessions.has(id)),
    },
    busySessions,
    setBusy(value: boolean) {
      busy.selected = value;
      busy.any = value;
    },
  };
}

function deferred<Value>() {
  let resolve: (value: Value) => void = () => {};
  const promise = new Promise<Value>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}

function createApplicationHarness(
  overrides: Partial<
    Parameters<typeof startTerminalApplication<NativeTerminalWindow>>[0]
  > = {},
) {
  const windows: ReturnType<typeof createWindowHarness>[] = [];
  let selected: NativeTerminalWindow | undefined;
  const showQuitConfirmation = vi.fn(async () => true);
  const showCloseWindowConfirmation = vi.fn(async () => true);
  const showCloseTabConfirmation = vi.fn(async () => true);
  const showSessionFailure = vi.fn(async () => {});
  const sendFontZoom = vi.fn();
  const sendClipboardAction = vi.fn();
  const sendSnippetsToggle = vi.fn();
  const sendTabBarToggle = vi.fn();
  const sendAuxiliaryPanelToggle = vi.fn();
  const sendAuxiliaryPanelSideToggle = vi.fn();
  const sendFind = vi.fn();
  const sendTitleBarToggle = vi.fn();
  const sendLocalImageOpen = vi.fn();
  const toggleDeveloperTools = vi.fn();
  const sendTabCommand = vi.fn();
  const quit = vi.fn();
  const application = startTerminalApplication({
    createWindow(lifecycle) {
      const harness = createWindowHarness(lifecycle);
      windows.push(harness);
      return {
        window: harness.window,
        sessionActivity: harness.sessionActivity,
        load: vi.fn(async () => {}),
      };
    },
    getSelectedWindow: () => selected,
    showQuitConfirmation,
    showCloseWindowConfirmation,
    showCloseTabConfirmation,
    showSessionFailure,
    sendFontZoom,
    sendClipboardAction,
    sendSnippetsToggle,
    sendTabBarToggle,
    sendAuxiliaryPanelToggle,
    sendAuxiliaryPanelSideToggle,
    sendFind,
    sendTitleBarToggle,
    sendLocalImageOpen,
    toggleDeveloperTools,
    sendTabCommand,
    quit,
    ...overrides,
  });

  return {
    application,
    windows,
    showQuitConfirmation,
    showCloseWindowConfirmation,
    showCloseTabConfirmation,
    showSessionFailure,
    sendFontZoom,
    sendClipboardAction,
    sendSnippetsToggle,
    sendTabBarToggle,
    sendAuxiliaryPanelToggle,
    sendAuxiliaryPanelSideToggle,
    sendFind,
    sendTitleBarToggle,
    sendLocalImageOpen,
    toggleDeveloperTools,
    sendTabCommand,
    quit,
    select(window: NativeTerminalWindow | undefined) {
      selected = window;
    },
  };
}

type ApplicationHarness = ReturnType<typeof createApplicationHarness>;

describe("selected Terminal Window actions", () => {
  it.each<{
    name: string;
    act(application: ApplicationHarness["application"]): void;
    sent(harness: ApplicationHarness): ReturnType<typeof vi.fn>;
    args: unknown[];
  }>([
    {
      name: "Tab Bar toggle",
      act: (a) => a.toggleSelectedTabBar(),
      sent: (h) => h.sendTabBarToggle,
      args: [],
    },
    {
      name: "Title Bar toggle",
      act: (a) => a.toggleSelectedTitleBar(),
      sent: (h) => h.sendTitleBarToggle,
      args: [],
    },
    {
      name: "Auxiliary Panel toggle",
      act: (a) => a.toggleSelectedAuxiliaryPanel(),
      sent: (h) => h.sendAuxiliaryPanelToggle,
      args: [],
    },
    {
      name: "Auxiliary Panel side",
      act: (a) => a.moveSelectedAuxiliaryPanel(),
      sent: (h) => h.sendAuxiliaryPanelSideToggle,
      args: [],
    },
    {
      name: "Snippets toggle",
      act: (a) => a.toggleSelectedSnippets(),
      sent: (h) => h.sendSnippetsToggle,
      args: [],
    },
    {
      name: "Find",
      act: (a) => a.findInSelectedWindow(),
      sent: (h) => h.sendFind,
      args: [],
    },
    {
      name: "local image picker",
      act: (a) => a.openLocalImageInSelectedWindow(),
      sent: (h) => h.sendLocalImageOpen,
      args: [],
    },
    {
      name: "Developer Tools",
      act: (a) => a.toggleSelectedDevTools(),
      sent: (h) => h.toggleDeveloperTools,
      args: [],
    },
    {
      name: "clipboard action",
      act: (a) => a.clipboardSelectedWindow("paste"),
      sent: (h) => h.sendClipboardAction,
      args: ["paste"],
    },
    {
      name: "Window Font Zoom",
      act: (a) => a.zoomSelectedWindow("out"),
      sent: (h) => h.sendFontZoom,
      args: ["out"],
    },
    {
      name: "new tab",
      act: (a) => a.newTabInSelectedWindow(),
      sent: (h) => h.sendTabCommand,
      args: [{ action: "new" }],
    },
    {
      name: "next tab",
      act: (a) => a.selectNextTab(),
      sent: (h) => h.sendTabCommand,
      args: [{ action: "next" }],
    },
    {
      name: "previous tab",
      act: (a) => a.selectPreviousTab(),
      sent: (h) => h.sendTabCommand,
      args: [{ action: "previous" }],
    },
    {
      name: "tab position",
      act: (a) => a.selectTabInSelectedWindow(3),
      sent: (h) => h.sendTabCommand,
      args: [{ action: "select", position: 3 }],
    },
  ])(
    "sends $name only to the selected live window",
    async ({ act, sent, args }) => {
      const harness = createApplicationHarness();
      await harness.application.newWindow();
      await harness.application.newWindow();
      act(harness.application);
      expect(sent(harness)).not.toHaveBeenCalled();

      harness.select(harness.windows[1]!.window);
      act(harness.application);
      expect(sent(harness)).toHaveBeenCalledExactlyOnceWith(
        harness.windows[1]!.window,
        ...args,
      );

      harness.application.forceCloseWindow(harness.windows[1]!.window);
      act(harness.application);
      expect(sent(harness)).toHaveBeenCalledOnce();
      expect(harness.windows[0]!.closeSession).not.toHaveBeenCalled();
    },
  );
});

function lastSessionEnd(sessionId = "s1") {
  return {
    sessionId,
    launchKind: "default-shell" as const,
    closeRequested: false,
    liveSessions: 0,
  };
}

describe("Terminal application lifecycle", () => {
  it("retains a rendering failure until acknowledgement after last-session cleanup", async () => {
    const acknowledgement = deferred<void>();
    const showSessionFailure = vi.fn(() => acknowledgement.promise);
    const harness = createApplicationHarness({ showSessionFailure });
    await harness.application.newWindow();
    const owner = harness.windows[0]!;
    const context = {
      ...lastSessionEnd(),
      closeRequested: true,
      closeReason: "rendering-failure" as const,
    };
    owner.lifecycle.onSessionExit({ exitCode: 0, signal: 0 }, context);
    expect(showSessionFailure).toHaveBeenCalledWith(owner.window, {
      reason: "rendering",
      launchKind: "default-shell",
    });
    expect(owner.window.close).not.toHaveBeenCalled();
    expect(harness.quit).not.toHaveBeenCalled();
    acknowledgement.resolve();
    await acknowledgement.promise;
    await Promise.resolve();
    expect(harness.sendTabCommand).toHaveBeenCalledExactlyOnceWith(
      owner.window,
      {
        action: "close-session",
        sessionId: "s1",
      },
    );
    owner.lifecycle.onTabsEmpty();
    expect(owner.window.close).toHaveBeenCalledOnce();
    expect(harness.quit).toHaveBeenCalledOnce();
  });

  it("owns one independent session per window and closes only the selected window", async () => {
    const harness = createApplicationHarness();

    await harness.application.newWindow();
    await harness.application.newWindow();
    harness.select(harness.windows[1]!.window);
    await harness.application.closeSelectedWindow();

    expect(harness.windows).toHaveLength(2);
    expect(harness.windows[0]!.closeSession).not.toHaveBeenCalled();
    expect(harness.windows[1]!.closeSession).toHaveBeenCalledOnce();
    expect(harness.quit).not.toHaveBeenCalled();
  });

  it("quits exactly once after the last window closes", async () => {
    const harness = createApplicationHarness();
    await harness.application.newWindow();
    harness.select(harness.windows[0]!.window);

    await harness.application.closeSelectedWindow();
    await harness.application.closeSelectedWindow();

    expect(harness.windows[0]!.closeSession).toHaveBeenCalledOnce();
    expect(harness.quit).toHaveBeenCalledOnce();
  });

  it("asks once before quit by default and cancellation preserves every window", async () => {
    const answer = deferred<boolean>();
    const showQuitConfirmation = vi.fn(() => answer.promise);
    const harness = createApplicationHarness({ showQuitConfirmation });
    await harness.application.newWindow();
    await harness.application.newWindow();
    harness.select(harness.windows[1]!.window);

    const firstRequest = harness.application.requestQuit();
    const secondRequest = harness.application.requestQuit();
    expect(showQuitConfirmation).toHaveBeenCalledOnce();
    expect(showQuitConfirmation).toHaveBeenCalledWith(
      harness.windows[1]!.window,
    );
    expect(
      harness.windows.every(
        ({ closeSession }) => !closeSession.mock.calls.length,
      ),
    ).toBe(true);

    answer.resolve(false);
    await Promise.all([firstRequest, secondRequest]);

    expect(harness.quit).not.toHaveBeenCalled();
    expect(
      harness.windows.every(
        ({ closeSession }) => !closeSession.mock.calls.length,
      ),
    ).toBe(true);
  });

  it("can bypass quit confirmation through the supplied default", async () => {
    const harness = createApplicationHarness({ confirmClose: false });
    await harness.application.newWindow();

    await harness.application.requestQuit();

    expect(harness.showQuitConfirmation).not.toHaveBeenCalled();
    expect(harness.quit).toHaveBeenCalledOnce();
  });

  it("ends every independent session after one confirmed quit", async () => {
    const harness: ApplicationHarness = createApplicationHarness({
      getSelectedWindow: () => harness.windows[0]?.window,
      quit: vi.fn(() => {
        for (const { window } of harness.windows) window.close();
      }),
    });
    await harness.application.newWindow();
    await harness.application.newWindow();

    await harness.application.requestQuit();

    expect(harness.showQuitConfirmation).toHaveBeenCalledOnce();
    expect(harness.windows[0]!.closeSession).toHaveBeenCalledOnce();
    expect(harness.windows[1]!.closeSession).toHaveBeenCalledOnce();
  });

  it.each([0, 1, 37])(
    "closes an ordinarily exited shell with code %i without a failure dialog or quit confirmation",
    async (exitCode) => {
      const harness = createApplicationHarness();
      await harness.application.newWindow();

      harness.windows[0]!.lifecycle.onSessionExit(
        { exitCode, signal: 0 },
        lastSessionEnd(),
      );
      expect(harness.windows[0]!.closeSession).not.toHaveBeenCalled();
      harness.windows[0]!.lifecycle.onTabsEmpty();

      expect(harness.showSessionFailure).not.toHaveBeenCalled();
      expect(harness.showQuitConfirmation).not.toHaveBeenCalled();
      expect(harness.showCloseWindowConfirmation).not.toHaveBeenCalled();
      expect(harness.windows[0]!.closeSession).toHaveBeenCalledOnce();
      expect(harness.quit).toHaveBeenCalledOnce();
    },
  );

  it("closes only the window whose shell exits and quits after the last ordinary exit", async () => {
    const harness = createApplicationHarness();
    await harness.application.newWindow();
    await harness.application.newWindow();

    harness.windows[0]!.lifecycle.onSessionExit(
      { exitCode: 1, signal: 0 },
      lastSessionEnd(),
    );
    expect(harness.windows[0]!.closeSession).not.toHaveBeenCalled();
    harness.windows[0]!.lifecycle.onTabsEmpty();

    expect(harness.windows[0]!.closeSession).toHaveBeenCalledOnce();
    expect(harness.windows[1]!.closeSession).not.toHaveBeenCalled();
    expect(harness.quit).not.toHaveBeenCalled();

    harness.windows[1]!.lifecycle.onSessionExit(
      { exitCode: 7, signal: 0 },
      lastSessionEnd(),
    );
    expect(harness.windows[1]!.closeSession).not.toHaveBeenCalled();
    harness.windows[1]!.lifecycle.onTabsEmpty();

    expect(harness.windows[1]!.closeSession).toHaveBeenCalledOnce();
    expect(harness.quit).toHaveBeenCalledOnce();
  });

  it.each([
    {
      label: "spawn failure",
      emit(lifecycle: TerminalWindowLifecycle, terminalPayloadCanary: string) {
        void terminalPayloadCanary;
        lifecycle.onSessionStartError({
          launchKind: "default-shell",
          liveSessions: 0,
        });
      },
      expected: { reason: "spawn", launchKind: "default-shell" },
    },
    {
      label: "unexpected signal",
      emit(lifecycle: TerminalWindowLifecycle, terminalPayloadCanary: string) {
        lifecycle.onSessionExit(
          {
            exitCode: 0,
            signal: 15,
            terminalPayloadCanary,
          } as never,
          lastSessionEnd(),
        );
      },
      expected: {
        reason: "signal",
        launchKind: "default-shell",
        signal: 15,
      },
    },
  ])(
    "keeps the window open for $label acknowledgement and excludes Terminal Payload",
    async ({ emit, expected }) => {
      const acknowledgement = deferred<void>();
      const showSessionFailure = vi.fn(() => acknowledgement.promise);
      const harness = createApplicationHarness({ showSessionFailure });
      await harness.application.newWindow();
      const terminalPayloadCanary = "OMXTERM_TERMINAL_PAYLOAD_MUST_NOT_APPEAR";

      emit(harness.windows[0]!.lifecycle, terminalPayloadCanary);

      expect(showSessionFailure).toHaveBeenCalledWith(
        harness.windows[0]!.window,
        expected,
      );
      expect(JSON.stringify(showSessionFailure.mock.calls)).not.toContain(
        terminalPayloadCanary,
      );
      expect(harness.windows[0]!.closeSession).not.toHaveBeenCalled();

      acknowledgement.resolve();
      await acknowledgement.promise;
      await Promise.resolve();

      // Native counts are not tab ownership: the renderer commits empty
      // after spawn rejection or the acknowledged close-session command.
      harness.windows[0]!.lifecycle.onTabsEmpty();
      expect(harness.windows[0]!.closeSession).toHaveBeenCalledOnce();
    },
  );

  it("consumes a rejected failure dialog and closes and tears down exactly once", async () => {
    const showSessionFailure = vi.fn(async () => {
      throw new Error("native dialog unavailable");
    });
    const harness = createApplicationHarness({ showSessionFailure });
    await harness.application.newWindow();

    harness.windows[0]!.lifecycle.onSessionStartError({
      launchKind: "default-shell",
      liveSessions: 0,
    });
    harness.windows[0]!.lifecycle.onSessionStartError({
      launchKind: "default-shell",
      liveSessions: 0,
    });

    harness.windows[0]!.lifecycle.onTabsEmpty();
    await vi.waitFor(() => {
      expect(harness.windows[0]!.closeSession).toHaveBeenCalledOnce();
    });
    // Separate failed starts each own an acknowledgement, including rejection.
    expect(showSessionFailure).toHaveBeenCalledTimes(2);
    expect(harness.windows[0]!.window.close).toHaveBeenCalledOnce();
    expect(harness.quit).toHaveBeenCalledOnce();
  });
});

describe("Terminal application window actions", () => {
  it("targets fullscreen and ordinary floating always-on-top at the selected window", async () => {
    const harness = createApplicationHarness();
    await harness.application.newWindow();
    await harness.application.newWindow();
    harness.select(harness.windows[0]!.window);

    harness.application.toggleSelectedFullScreen();
    harness.application.toggleSelectedAlwaysOnTop();

    expect(harness.windows[0]!.setFullScreen).toHaveBeenCalledWith(true);
    expect(harness.windows[1]!.setFullScreen).not.toHaveBeenCalled();
    expect(harness.windows[0]!.setAlwaysOnTop).toHaveBeenLastCalledWith(
      true,
      "floating",
    );
    expect(harness.windows[1]!.setAlwaysOnTop).toHaveBeenCalledTimes(1);
  });

  it("updates close policy and only the future-window always-on-top default", async () => {
    const harness = createApplicationHarness();
    await harness.application.newWindow();
    harness.select(harness.windows[0]!.window);
    harness.application.toggleSelectedAlwaysOnTop();

    harness.application.applyConfiguration({
      confirmClose: false,
      alwaysOnTopDefault: false,
    });
    expect(harness.windows[0]!.window.isAlwaysOnTop()).toBe(true);
    expect(harness.application.mayCloseWindow(harness.windows[0]!.window)).toBe(
      true,
    );

    await harness.application.newWindow();
    expect(harness.windows[1]!.setAlwaysOnTop).toHaveBeenCalledExactlyOnceWith(
      false,
      "floating",
    );
    expect(harness.windows[0]!.setAlwaysOnTop).toHaveBeenCalledTimes(2);
  });

  it("applies the supplied always-on-top default independently to each new window", async () => {
    const harness = createApplicationHarness({ alwaysOnTopDefault: true });
    await harness.application.newWindow();
    harness.select(harness.windows[0]!.window);
    harness.application.toggleSelectedAlwaysOnTop();
    await harness.application.newWindow();

    expect(harness.windows[0]!.setAlwaysOnTop).toHaveBeenNthCalledWith(
      1,
      true,
      "floating",
    );
    expect(harness.windows[0]!.setAlwaysOnTop).toHaveBeenNthCalledWith(
      2,
      false,
      "floating",
    );
    expect(harness.windows[1]!.setAlwaysOnTop).toHaveBeenCalledOnce();
    expect(harness.windows[1]!.setAlwaysOnTop).toHaveBeenCalledWith(
      true,
      "floating",
    );
  });

  it("asks once before closing the selected tab and sends the close command only on confirmation", async () => {
    const answer = deferred<boolean>();
    const showCloseTabConfirmation = vi.fn(() => answer.promise);
    const harness = createApplicationHarness({ showCloseTabConfirmation });
    await harness.application.newWindow();
    harness.select(harness.windows[0]!.window);

    const firstRequest = harness.application.closeSelectedTab();
    const secondRequest = harness.application.closeSelectedTab();
    expect(showCloseTabConfirmation).toHaveBeenCalledOnce();
    expect(harness.sendTabCommand).toHaveBeenCalledExactlyOnceWith(
      harness.windows[0]!.window,
      { action: "prepare-close" },
    );

    answer.resolve(true);
    await Promise.all([firstRequest, secondRequest]);

    expect(harness.sendTabCommand.mock.calls).toEqual([
      [harness.windows[0]!.window, { action: "prepare-close" }],
      [
        harness.windows[0]!.window,
        { action: "resolve-close", confirmed: true },
      ],
    ]);
  });

  it("keeps the selected tab when its close confirmation is cancelled", async () => {
    const showCloseTabConfirmation = vi.fn(async () => false);
    const harness = createApplicationHarness({ showCloseTabConfirmation });
    await harness.application.newWindow();
    harness.select(harness.windows[0]!.window);

    await harness.application.closeSelectedTab();

    expect(showCloseTabConfirmation).toHaveBeenCalledOnce();
    expect(harness.sendTabCommand.mock.calls).toEqual([
      [harness.windows[0]!.window, { action: "prepare-close" }],
      [
        harness.windows[0]!.window,
        { action: "resolve-close", confirmed: false },
      ],
    ]);
    expect(harness.windows[0]!.closeSession).not.toHaveBeenCalled();
  });

  it("closes the selected tab without a dialog when confirmClose is false", async () => {
    const harness = createApplicationHarness({ confirmClose: false });
    await harness.application.newWindow();
    harness.select(harness.windows[0]!.window);

    await harness.application.closeSelectedTab();

    expect(harness.showCloseTabConfirmation).not.toHaveBeenCalled();
    expect(harness.sendTabCommand).toHaveBeenCalledExactlyOnceWith(
      harness.windows[0]!.window,
      { action: "close" },
    );
  });

  it("asks once before closing a window and cancellation keeps it open", async () => {
    const answer = deferred<boolean>();
    const showCloseWindowConfirmation = vi.fn(() => answer.promise);
    const harness = createApplicationHarness({ showCloseWindowConfirmation });
    await harness.application.newWindow();
    harness.select(harness.windows[0]!.window);

    const firstRequest = harness.application.closeSelectedWindow();
    const secondRequest = harness.application.closeSelectedWindow();
    expect(showCloseWindowConfirmation).toHaveBeenCalledOnce();
    expect(harness.application.mayCloseWindow(harness.windows[0]!.window)).toBe(
      false,
    );

    answer.resolve(false);
    await Promise.all([firstRequest, secondRequest]);

    expect(harness.windows[0]!.closeSession).not.toHaveBeenCalled();
    expect(harness.quit).not.toHaveBeenCalled();
  });

  it("closes a window without a dialog when confirmClose is false", async () => {
    const harness = createApplicationHarness({ confirmClose: false });
    await harness.application.newWindow();
    harness.select(harness.windows[0]!.window);

    expect(harness.application.mayCloseWindow(harness.windows[0]!.window)).toBe(
      true,
    );
    await harness.application.closeSelectedWindow();

    expect(harness.showCloseWindowConfirmation).not.toHaveBeenCalled();
    expect(harness.windows[0]!.closeSession).toHaveBeenCalledOnce();
  });

  it("keeps the window open when a tab's shell exits with sessions remaining", async () => {
    const harness = createApplicationHarness();
    await harness.application.newWindow();

    harness.windows[0]!.lifecycle.onSessionExit(
      { exitCode: 0, signal: 0 },
      {
        sessionId: "s1",
        launchKind: "default-shell",
        closeRequested: false,
        liveSessions: 1,
      },
    );

    expect(harness.showSessionFailure).not.toHaveBeenCalled();
    expect(harness.windows[0]!.closeSession).not.toHaveBeenCalled();
    expect(harness.sendTabCommand).not.toHaveBeenCalled();
    expect(harness.quit).not.toHaveBeenCalled();
  });

  it("treats a requested kill signal as an ordinary tab end", async () => {
    const harness = createApplicationHarness();
    await harness.application.newWindow();

    harness.windows[0]!.lifecycle.onSessionExit(
      { exitCode: 0, signal: 1 },
      {
        sessionId: "s2",
        launchKind: "default-shell",
        closeRequested: true,
        liveSessions: 1,
      },
    );
    expect(harness.showSessionFailure).not.toHaveBeenCalled();
    expect(harness.windows[0]!.closeSession).not.toHaveBeenCalled();

    harness.windows[0]!.lifecycle.onSessionExit(
      { exitCode: 0, signal: 1 },
      {
        sessionId: "s1",
        launchKind: "default-shell",
        closeRequested: true,
        liveSessions: 0,
      },
    );
    expect(harness.windows[0]!.closeSession).not.toHaveBeenCalled();
    harness.windows[0]!.lifecycle.onTabsEmpty();
    expect(harness.showSessionFailure).not.toHaveBeenCalled();
    expect(harness.windows[0]!.closeSession).toHaveBeenCalledOnce();
  });

  it("acknowledges a non-last unexpected signal and only then orders the dead tab closed", async () => {
    const acknowledgement = deferred<void>();
    const showSessionFailure = vi.fn(() => acknowledgement.promise);
    const harness = createApplicationHarness({ showSessionFailure });
    await harness.application.newWindow();

    harness.windows[0]!.lifecycle.onSessionExit(
      { exitCode: 0, signal: 9 },
      {
        sessionId: "s2",
        launchKind: "default-shell",
        closeRequested: false,
        liveSessions: 1,
      },
    );

    expect(showSessionFailure).toHaveBeenCalledExactlyOnceWith(
      harness.windows[0]!.window,
      { reason: "signal", launchKind: "default-shell", signal: 9 },
    );
    expect(harness.sendTabCommand).not.toHaveBeenCalled();

    acknowledgement.resolve();
    await acknowledgement.promise;
    await Promise.resolve();
    await Promise.resolve();

    expect(harness.sendTabCommand).toHaveBeenCalledExactlyOnceWith(
      harness.windows[0]!.window,
      { action: "close-session", sessionId: "s2" },
    );
    expect(harness.windows[0]!.closeSession).not.toHaveBeenCalled();
    expect(harness.quit).not.toHaveBeenCalled();
  });

  it("keeps the window open when an additional tab spawn fails", async () => {
    const harness = createApplicationHarness();
    await harness.application.newWindow();

    harness.windows[0]!.lifecycle.onSessionStartError({
      launchKind: "default-shell",
      liveSessions: 1,
    });
    await Promise.resolve();

    expect(harness.showSessionFailure).toHaveBeenCalledExactlyOnceWith(
      harness.windows[0]!.window,
      { reason: "spawn", launchKind: "default-shell" },
    );
    expect(harness.windows[0]!.closeSession).not.toHaveBeenCalled();
    expect(harness.quit).not.toHaveBeenCalled();
  });

  it("closes an idle tab without any confirmation dialog", async () => {
    const harness = createApplicationHarness();
    await harness.application.newWindow();
    harness.select(harness.windows[0]!.window);
    harness.windows[0]!.setBusy(false);

    await harness.application.closeSelectedTab();

    expect(harness.showCloseTabConfirmation).not.toHaveBeenCalled();
    expect(harness.sendTabCommand).toHaveBeenCalledExactlyOnceWith(
      harness.windows[0]!.window,
      { action: "close" },
    );
  });

  it("closes a window of idle sessions without any confirmation dialog", async () => {
    const harness = createApplicationHarness();
    await harness.application.newWindow();
    harness.select(harness.windows[0]!.window);
    harness.windows[0]!.setBusy(false);

    expect(harness.application.mayCloseWindow(harness.windows[0]!.window)).toBe(
      true,
    );
    await harness.application.closeSelectedWindow();

    expect(harness.showCloseWindowConfirmation).not.toHaveBeenCalled();
    expect(harness.windows[0]!.closeSession).toHaveBeenCalledOnce();
  });

  it("quits without a confirmation when every open session is idle", async () => {
    const harness = createApplicationHarness();
    await harness.application.newWindow();
    await harness.application.newWindow();
    harness.windows[0]!.setBusy(false);
    harness.windows[1]!.setBusy(false);

    await harness.application.requestQuit();

    expect(harness.showQuitConfirmation).not.toHaveBeenCalled();
    expect(harness.quit).toHaveBeenCalledOnce();
  });

  it("still asks before quitting while any window holds a Busy Session", async () => {
    const harness = createApplicationHarness();
    await harness.application.newWindow();
    await harness.application.newWindow();
    harness.windows[0]!.setBusy(false);

    await harness.application.requestQuit();

    expect(harness.showQuitConfirmation).toHaveBeenCalledOnce();
    expect(harness.quit).toHaveBeenCalledOnce();
  });

  it("leaves an agent's close of a Busy Session, or one under confirmation, to the user", async () => {
    const harness = createApplicationHarness();
    await harness.application.newWindow();
    const { window, busySessions } = harness.windows[0]!;
    busySessions.add("s2");
    const needsUser = (...ids: `s${number}`[]) =>
      harness.application.agentCloseNeedsUser(window, ids);

    // Only the named panes count, wherever the user's focus is.
    expect(needsUser("s1")).toBe(false);
    expect(needsUser("s1", "s2")).toBe(true);

    // A Close Tab the user is confirming keeps every agent close waiting.
    const confirmation = deferred<boolean>();
    harness.showCloseTabConfirmation.mockReturnValueOnce(confirmation.promise);
    harness.select(window);
    const closing = harness.application.closeSelectedTab();
    expect(needsUser("s1")).toBe(true);
    confirmation.resolve(false);
    await closing;
    expect(needsUser("s1")).toBe(false);

    // With confirmClose off, a Busy Session closes as the user's press would.
    harness.application.applyConfiguration({
      confirmClose: false,
      alwaysOnTopDefault: false,
    });
    expect(needsUser("s2")).toBe(false);
  });
});
