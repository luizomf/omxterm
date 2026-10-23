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
    },
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

describe("Window Chrome application actions", () => {
  it.each(["TabBar", "TitleBar"] as const)(
    "toggles %s only in the selected Terminal Window",
    async (bar) => {
      const harness = createApplicationHarness();
      await harness.application.newWindow();
      await harness.application.newWindow();
      harness.application[`toggleSelected${bar}`]();
      expect(harness[`send${bar}Toggle`]).not.toHaveBeenCalled();
      harness.select(harness.windows[1]!.window);
      harness.application[`toggleSelected${bar}`]();
      expect(harness[`send${bar}Toggle`]).toHaveBeenCalledExactlyOnceWith(
        harness.windows[1]!.window,
      );
      expect(harness.windows[0]!.closeSession).not.toHaveBeenCalled();
      expect(harness.windows[1]!.closeSession).not.toHaveBeenCalled();
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

  it("sends the Snippets toggle only to the selected Terminal Window", async () => {
    const harness = createApplicationHarness();
    await harness.application.newWindow();
    await harness.application.newWindow();

    harness.select(undefined);
    harness.application.toggleSelectedSnippets();
    expect(harness.sendSnippetsToggle).not.toHaveBeenCalled();

    harness.select(harness.windows[1]!.window);
    harness.application.toggleSelectedSnippets();
    expect(harness.sendSnippetsToggle).toHaveBeenCalledExactlyOnceWith(
      harness.windows[1]!.window,
    );
  });

  it("sends Find only to the selected Terminal Window", async () => {
    const harness = createApplicationHarness();
    await harness.application.newWindow();
    await harness.application.newWindow();

    harness.select(undefined);
    harness.application.findInSelectedWindow();
    expect(harness.sendFind).not.toHaveBeenCalled();

    harness.select(harness.windows[0]!.window);
    harness.application.findInSelectedWindow();
    expect(harness.sendFind).toHaveBeenCalledExactlyOnceWith(
      harness.windows[0]!.window,
    );
  });

  it("opens the local image picker only in the selected Terminal Window", async () => {
    const harness = createApplicationHarness();
    await harness.application.newWindow();
    await harness.application.newWindow();

    harness.select(undefined);
    harness.application.openLocalImageInSelectedWindow();
    expect(harness.sendLocalImageOpen).not.toHaveBeenCalled();

    harness.select(harness.windows[1]!.window);
    harness.application.openLocalImageInSelectedWindow();
    expect(harness.sendLocalImageOpen).toHaveBeenCalledExactlyOnceWith(
      harness.windows[1]!.window,
    );
  });

  it("toggles Developer Tools only for the selected Terminal Window", async () => {
    const harness = createApplicationHarness();
    await harness.application.newWindow();
    await harness.application.newWindow();

    harness.select(undefined);
    harness.application.toggleSelectedDevTools();
    expect(harness.toggleDeveloperTools).not.toHaveBeenCalled();

    harness.select(harness.windows[1]!.window);
    harness.application.toggleSelectedDevTools();
    expect(harness.toggleDeveloperTools).toHaveBeenCalledExactlyOnceWith(
      harness.windows[1]!.window,
    );
  });

  it("sends explicit clipboard actions only to the selected Terminal Window", async () => {
    const harness = createApplicationHarness();
    await harness.application.newWindow();
    await harness.application.newWindow();
    harness.select(harness.windows[1]!.window);

    harness.application.clipboardSelectedWindow("copy");
    harness.application.clipboardSelectedWindow("paste");
    harness.application.clipboardSelectedWindow("select-all");

    expect(harness.sendClipboardAction.mock.calls).toEqual([
      [harness.windows[1]!.window, "copy"],
      [harness.windows[1]!.window, "paste"],
      [harness.windows[1]!.window, "select-all"],
    ]);
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
    const windows: ReturnType<typeof createWindowHarness>[] = [];
    const quit = vi.fn(() => {
      for (const { window } of windows) window.close();
    });
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
      getSelectedWindow: () => windows[0]?.window,
      showQuitConfirmation: vi.fn(async () => true),
      showCloseWindowConfirmation: vi.fn(async () => true),
      showCloseTabConfirmation: vi.fn(async () => true),
      showSessionFailure: vi.fn(async () => {}),
      sendFontZoom: vi.fn(),
      sendClipboardAction: vi.fn(),
      sendSnippetsToggle: vi.fn(),
      sendTabBarToggle: vi.fn(),
      sendFind: vi.fn(),
      sendTitleBarToggle: vi.fn(),
      sendLocalImageOpen: vi.fn(),
      toggleDeveloperTools: vi.fn(),
      sendTabCommand: vi.fn(),
      quit,
    });
    await application.newWindow();
    await application.newWindow();

    await application.requestQuit();

    expect(quit).toHaveBeenCalledOnce();
    expect(windows[0]!.closeSession).toHaveBeenCalledOnce();
    expect(windows[1]!.closeSession).toHaveBeenCalledOnce();
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

  it("sends Window Font Zoom only to the selected Terminal Window", async () => {
    const harness = createApplicationHarness();
    await harness.application.newWindow();
    await harness.application.newWindow();
    harness.select(harness.windows[1]!.window);

    harness.application.zoomSelectedWindow("in");
    harness.application.zoomSelectedWindow("out");
    harness.application.zoomSelectedWindow("reset");

    expect(harness.sendFontZoom.mock.calls).toEqual([
      [harness.windows[1]!.window, "in"],
      [harness.windows[1]!.window, "out"],
      [harness.windows[1]!.window, "reset"],
    ]);
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

  it("sends tab commands only to the selected Terminal Window", async () => {
    const harness = createApplicationHarness();
    await harness.application.newWindow();
    await harness.application.newWindow();

    harness.select(undefined);
    harness.application.newTabInSelectedWindow();
    harness.application.selectNextTab();
    expect(harness.sendTabCommand).not.toHaveBeenCalled();

    harness.select(harness.windows[1]!.window);
    harness.application.newTabInSelectedWindow();
    harness.application.selectNextTab();
    harness.application.selectPreviousTab();
    harness.application.selectTabInSelectedWindow(3);

    expect(harness.sendTabCommand.mock.calls).toEqual([
      [harness.windows[1]!.window, { action: "new" }],
      [harness.windows[1]!.window, { action: "next" }],
      [harness.windows[1]!.window, { action: "previous" }],
      [harness.windows[1]!.window, { action: "select", position: 3 }],
    ]);
  });

  it("records window lifecycle with local identifiers and bounded duration only", async () => {
    const write = vi.fn(() => true);
    const harness = createApplicationHarness({ operationalEvents: { write } });

    await harness.application.newWindow();
    harness.select(harness.windows[0]!.window);
    await harness.application.closeSelectedWindow();

    expect(write).toHaveBeenNthCalledWith(1, {
      name: "window.opened",
      windowId: 1,
    });
    expect(write).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        name: "window.closed",
        windowId: 1,
        durationMs: expect.any(Number) as unknown,
      }),
    );
  });
});
