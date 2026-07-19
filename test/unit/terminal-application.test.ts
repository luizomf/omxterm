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
  const showSessionFailure = vi.fn(async () => {});
  const sendFontZoom = vi.fn();
  const sendClipboardAction = vi.fn();
  const sendSnippetsToggle = vi.fn();
  const quit = vi.fn();
  const application = startTerminalApplication({
    createWindow(lifecycle) {
      const harness = createWindowHarness(lifecycle);
      windows.push(harness);
      return { window: harness.window, load: vi.fn(async () => {}) };
    },
    getSelectedWindow: () => selected,
    showQuitConfirmation,
    showSessionFailure,
    sendFontZoom,
    sendClipboardAction,
    sendSnippetsToggle,
    quit,
    ...overrides,
  });

  return {
    application,
    windows,
    showQuitConfirmation,
    showSessionFailure,
    sendFontZoom,
    sendClipboardAction,
    sendSnippetsToggle,
    quit,
    select(window: NativeTerminalWindow | undefined) {
      selected = window;
    },
  };
}

describe("Terminal application lifecycle", () => {
  it("owns one independent session per window and closes only the selected window", async () => {
    const harness = createApplicationHarness();

    await harness.application.newWindow();
    await harness.application.newWindow();
    harness.select(harness.windows[1]!.window);
    harness.application.closeSelectedWindow();

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

    harness.application.closeSelectedWindow();
    harness.application.closeSelectedWindow();

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
        return { window: harness.window, load: vi.fn(async () => {}) };
      },
      getSelectedWindow: () => windows[0]?.window,
      showQuitConfirmation: vi.fn(async () => true),
      showSessionFailure: vi.fn(async () => {}),
      sendFontZoom: vi.fn(),
      sendClipboardAction: vi.fn(),
      sendSnippetsToggle: vi.fn(),
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

      harness.windows[0]!.lifecycle.onSessionExit({ exitCode, signal: 0 });

      expect(harness.showSessionFailure).not.toHaveBeenCalled();
      expect(harness.showQuitConfirmation).not.toHaveBeenCalled();
      expect(harness.windows[0]!.closeSession).toHaveBeenCalledOnce();
      expect(harness.quit).toHaveBeenCalledOnce();
    },
  );

  it("closes only the window whose shell exits and quits after the last ordinary exit", async () => {
    const harness = createApplicationHarness();
    await harness.application.newWindow();
    await harness.application.newWindow();

    harness.windows[0]!.lifecycle.onSessionExit({ exitCode: 1, signal: 0 });

    expect(harness.windows[0]!.closeSession).toHaveBeenCalledOnce();
    expect(harness.windows[1]!.closeSession).not.toHaveBeenCalled();
    expect(harness.quit).not.toHaveBeenCalled();

    harness.windows[1]!.lifecycle.onSessionExit({ exitCode: 7, signal: 0 });

    expect(harness.windows[1]!.closeSession).toHaveBeenCalledOnce();
    expect(harness.quit).toHaveBeenCalledOnce();
  });

  it.each([
    {
      label: "spawn failure",
      emit(lifecycle: TerminalWindowLifecycle, terminalPayloadCanary: string) {
        void terminalPayloadCanary;
        lifecycle.onSessionStartError();
      },
      expected: { reason: "spawn" },
    },
    {
      label: "unexpected signal",
      emit(lifecycle: TerminalWindowLifecycle, terminalPayloadCanary: string) {
        lifecycle.onSessionExit({
          exitCode: 0,
          signal: 15,
          terminalPayloadCanary,
        } as never);
      },
      expected: { reason: "signal", signal: 15 },
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

      expect(harness.windows[0]!.closeSession).toHaveBeenCalledOnce();
    },
  );

  it("consumes a rejected failure dialog and closes and tears down exactly once", async () => {
    const showSessionFailure = vi.fn(async () => {
      throw new Error("native dialog unavailable");
    });
    const harness = createApplicationHarness({ showSessionFailure });
    await harness.application.newWindow();

    harness.windows[0]!.lifecycle.onSessionStartError();
    harness.windows[0]!.lifecycle.onSessionStartError();

    await vi.waitFor(() => {
      expect(harness.windows[0]!.closeSession).toHaveBeenCalledOnce();
    });
    expect(showSessionFailure).toHaveBeenCalledOnce();
    expect(harness.windows[0]!.window.close).toHaveBeenCalledOnce();
    expect(harness.quit).toHaveBeenCalledOnce();
  });

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

  it("records window lifecycle with local identifiers and bounded duration only", async () => {
    const write = vi.fn(() => true);
    const harness = createApplicationHarness({ operationalEvents: { write } });

    await harness.application.newWindow();
    harness.select(harness.windows[0]!.window);
    harness.application.closeSelectedWindow();

    expect(write).toHaveBeenNthCalledWith(1, {
      name: "window.opened",
      windowId: 1,
    });
    expect(write).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        name: "window.closed",
        windowId: 1,
        durationMs: expect.any(Number),
      }),
    );
  });
});
