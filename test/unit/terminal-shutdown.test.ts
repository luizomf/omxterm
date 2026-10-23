import { EventEmitter } from "node:events";
import type { BrowserWindow } from "electron";
import type { IPty } from "node-pty";
import { describe, expect, it, vi } from "vitest";
import { registerTerminalShutdown } from "../../src/main/terminal-shutdown";
import { startTerminalApplication } from "../../src/main/terminal-application";
import {
  registerTerminalIpcRouter,
  type IpcMainPort,
} from "../../src/main/terminal-ipc-controller";
import {
  guardTerminalWindowClose,
  registerTerminalWindowHost,
} from "../../src/main/terminal-window-host";
import { terminalRendererConfiguration } from "../../src/main/active-user-configuration";
import { DEFAULT_USER_CONFIGURATION } from "../../src/main/user-configuration";
import { terminalIpc } from "../../src/shared/terminal-ipc";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}

function nativePty() {
  let exit: ((event: { exitCode: number }) => void) | undefined;
  const kill = vi.fn();
  const disposeExit = vi.fn(() => {
    exit = undefined;
  });
  const pty = {
    kill,
    write: vi.fn(),
    resize: vi.fn(),
    pause: vi.fn(),
    resume: vi.fn(),
    process: "busy",
    onData: () => ({ dispose() {} }),
    onExit(listener: typeof exit) {
      exit = listener;
      return { dispose: disposeExit };
    },
  } as unknown as IPty;
  return { pty, kill, disposeExit, exit: () => exit?.({ exitCode: 0 }) };
}

function harness(confirmClose = false) {
  const handlers = new Map<string, Parameters<IpcMainPort["handle"]>[1]>();
  const listeners = new Map<string, Parameters<IpcMainPort["on"]>[1]>();
  const router = registerTerminalIpcRouter({
    handle: (channel, handler) => {
      handlers.set(channel, handler);
    },
    removeHandler: (channel) => {
      handlers.delete(channel);
    },
    on: (channel, listener) => {
      listeners.set(channel, listener);
    },
    removeListener: (channel) => {
      listeners.delete(channel);
    },
  });
  const windows: ReturnType<typeof createWindow>[] = [];
  const ptys: ReturnType<typeof nativePty>[] = [];
  const spawn = vi.fn(() => {
    const pty = nativePty();
    ptys.push(pty);
    return pty.pty;
  });
  const native = Object.assign(new EventEmitter(), {
    quit() {
      const event = { preventDefault: vi.fn() };
      native.emit("before-quit", event);
      if (event.preventDefault.mock.calls.length) return;
      for (const window of windows) window.close();
      native.emit("quit");
    },
  });
  const quit = vi.fn();
  native.on("quit", quit);
  const showQuitConfirmation = vi.fn(async () => true);
  const showSessionFailure = vi.fn(async () => {});
  const forwardedExit = vi.fn();
  const sessionOptions = {
    shell: "C:\\fixture\\shell.exe",
    platform: "win32",
    homeDirectory: "C:\\fixture",
    environment: {},
    applicationVersionProvider: { getVersion: () => "1.0.0" },
    onOutput() {},
    onExit() {},
  };

  function createWindow() {
    let destroyed = false;
    const webContents = Object.assign(new EventEmitter(), {
      mainFrame: {},
      isDestroyed: () => destroyed,
      send: vi.fn(),
    });
    const events = new EventEmitter();
    return Object.assign(events, {
      webContents,
      isDestroyed: () => destroyed,
      isFullScreen: () => false,
      setFullScreen() {},
      isAlwaysOnTop: () => false,
      setAlwaysOnTop() {},
      close() {
        if (destroyed) return;
        const event = { preventDefault: vi.fn() };
        events.emit("close", event);
        if (event.preventDefault.mock.calls.length) return;
        destroyed = true;
        events.emit("closed");
        if (windows.every((window) => window.isDestroyed())) {
          // Like Electron: adding a listener takes ownership of default quit.
          if (!native.emit("window-all-closed")) native.quit();
        }
      },
    }) as unknown as BrowserWindow;
  }

  const application = startTerminalApplication({
    confirmClose,
    createWindow(lifecycle) {
      const window = createWindow();
      windows.push(window);
      guardTerminalWindowClose(window, application);
      const controller = router.registerController({
        windowId: lifecycle.windowId,
        webContents: window.webContents,
        configuration: terminalRendererConfiguration(
          { configuration: DEFAULT_USER_CONFIGURATION, userFileErrors: [] },
          0,
        ),
        createSession: (callbacks) =>
          shutdown.createSession(spawn, { ...sessionOptions, ...callbacks }),
        onSessionStartError: lifecycle.onSessionStartError,
        onTabsEmpty: lifecycle.onTabsEmpty,
        onSessionExit(exit, context) {
          forwardedExit(exit, context);
          lifecycle.onSessionExit(exit, context);
        },
        onSessionStarted() {},
        onSessionSelected() {},
        onTitleRequest() {},
        onBell() {},
        onUserInteraction() {},
        writeClipboardText() {},
        readClipboardText: () => "",
        confirmPaste: async () => false,
        showClipboardContextMenu() {},
        openExternalLink: async () => {},
        onExternalLinkOpenError() {},
        loadSnippets: async () => ({ snippets: [] }),
        loadLocalImage: async () => null,
      });
      registerTerminalWindowHost(window, controller, lifecycle.onWindowClosed);
      return { window, sessionActivity: controller, load: async () => {} };
    },
    getSelectedWindow: () => windows.find((window) => !window.isDestroyed()),
    showQuitConfirmation,
    showCloseWindowConfirmation: async () => true,
    showCloseTabConfirmation: async () => true,
    showSessionFailure,
    sendFontZoom() {},
    sendClipboardAction() {},
    sendSnippetsToggle() {},
    sendTabBarToggle() {},
    sendFind() {},
    sendTitleBarToggle() {},
    sendLocalImageOpen() {},
    toggleDeveloperTools() {},
    sendTabCommand() {},
    quit: () => native.quit(),
  });
  const shutdown = registerTerminalShutdown(native, {
    application: () => application,
    disposeSessions: () => router.dispose(),
  });
  const owner = (index: number) => {
    const sender = windows[index]!.webContents;
    return { sender, senderFrame: sender.mainFrame };
  };
  const startHandler = handlers.get(terminalIpc.start)!;
  return {
    application,
    native,
    windows,
    ptys,
    spawn,
    quit,
    forwardedExit,
    showQuitConfirmation,
    showSessionFailure,
    retainedStart: (index = 0) => startHandler(owner(index)),
    start: (index = 0) => handlers.get(terminalIpc.start)!(owner(index)),
    notifyTabsEmpty: (index = 0) =>
      listeners.get(terminalIpc.tabsEmpty)!(owner(index)),
    closeTab: (index = 0, sessionId = "s1") =>
      listeners.get(terminalIpc.close)!(owner(index), { sessionId }),
    createLateSession: () => shutdown.createSession(spawn, sessionOptions),
  };
}

// Production application, window host, router and LocalTerminalSession; only
// Electron/IPC and the native PTY are replaced at their public interfaces.
describe("application-owned native session shutdown", () => {
  it("leaves Busy sessions running while native Quit confirmation is pending or cancelled", async () => {
    const h = harness(true);
    const decision = deferred<boolean>();
    h.showQuitConfirmation.mockReturnValueOnce(decision.promise);
    await h.application.newWindow();
    h.start();
    h.native.quit();
    h.native.quit();
    const request = h.application.requestQuit();
    expect(h.showQuitConfirmation).toHaveBeenCalledOnce();
    expect(h.ptys[0]!.kill).not.toHaveBeenCalled();
    expect(h.quit).not.toHaveBeenCalled();
    h.start();
    decision.resolve(false);
    await request;
    expect(h.application.isQuitting()).toBe(false);
    expect(h.ptys.every((pty) => pty.kill.mock.calls.length === 0)).toBe(true);
    h.start();
    expect(h.spawn).toHaveBeenCalledTimes(3);
    await h.application.requestQuit();
    expect(h.showQuitConfirmation).toHaveBeenCalledTimes(2);
    for (const pty of h.ptys) pty.exit();
    await Promise.resolve();
    await Promise.resolve();
    expect(h.quit).toHaveBeenCalledOnce();
  });

  it("last-window Close waits for a session from a previously closed window", async () => {
    const h = harness();
    await h.application.newWindow();
    h.start();
    await h.application.newWindow();
    h.start(1);
    h.windows[0]!.close();
    expect(h.ptys[0]!.kill).toHaveBeenCalledOnce();
    expect(h.application.isQuitting()).toBe(false);
    h.windows[1]!.close();
    expect(h.application.isQuitting()).toBe(true);
    expect(h.quit).not.toHaveBeenCalled();
    h.ptys[1]!.exit();
    await Promise.resolve();
    expect(h.quit).not.toHaveBeenCalled();
    h.ptys[0]!.exit();
    await Promise.resolve();
    await Promise.resolve();
    expect(h.quit).toHaveBeenCalledOnce();
    expect(h.forwardedExit).not.toHaveBeenCalled();
  });

  it("keeps a previously closed tab pending through repeated and reentrant Quit", async () => {
    const h = harness();
    await h.application.newWindow();
    h.start();
    h.start();
    h.closeTab();
    h.ptys[1]!.kill.mockImplementation(() => h.native.quit());
    h.native.quit();
    h.native.quit();
    await h.application.requestQuit();
    expect(h.ptys.map((pty) => pty.kill.mock.calls.length)).toEqual([1, 1]);
    expect(h.quit).not.toHaveBeenCalled();
    h.ptys[1]!.exit();
    await Promise.resolve();
    expect(h.quit).not.toHaveBeenCalled();
    h.ptys[0]!.exit();
    await Promise.resolve();
    await Promise.resolve();
    expect(h.quit).toHaveBeenCalledOnce();
  });

  it("completes zero-session Quit without a timer or native start", async () => {
    const h = harness();
    h.native.quit();
    await Promise.resolve();
    expect(h.quit).toHaveBeenCalledOnce();
    expect(h.spawn).not.toHaveBeenCalled();
  });

  it("does not swallow a native close error or manufacture successful completion", async () => {
    const h = harness();
    await h.application.newWindow();
    h.start();
    h.ptys[0]!.kill.mockImplementation(() => {
      throw new Error("Native kill failed");
    });
    expect(() => h.application.requestQuit()).toThrow("Native kill failed");
    h.native.quit();
    await Promise.resolve();
    expect(h.ptys[0]!.kill).toHaveBeenCalledOnce();
    expect(h.quit).not.toHaveBeenCalled();
  });

  it("registers completion when the renderer closes after a synchronous native exit", async () => {
    const h = harness();
    await h.application.newWindow();
    const pty = nativePty();
    h.spawn.mockReturnValueOnce({
      ...pty.pty,
      onExit(listener) {
        listener({ exitCode: 0 });
        return { dispose: pty.disposeExit };
      },
    });
    h.start();
    expect(h.quit).not.toHaveBeenCalled();
    expect(h.forwardedExit).toHaveBeenCalledOnce();
    // The renderer receives the buffered exit after its start response, then
    // reports last-tab removal. Native completion must already be recorded.
    h.notifyTabsEmpty();
    await Promise.resolve();
    expect(h.quit).toHaveBeenCalledOnce();
    expect(h.forwardedExit).toHaveBeenCalledOnce();
    expect(pty.kill).not.toHaveBeenCalled();
    expect(pty.disposeExit).toHaveBeenCalledOnce();
  });

  it("waits for the remaining session when another exits synchronously during disposal", async () => {
    const h = harness();
    await h.application.newWindow();
    h.start();
    h.start();
    h.ptys[0]!.kill.mockImplementation(() => h.ptys[0]!.exit());
    await h.application.requestQuit();
    expect(h.quit).not.toHaveBeenCalled();
    h.ptys[1]!.exit();
    await Promise.resolve();
    await Promise.resolve();
    expect(h.quit).toHaveBeenCalledOnce();
  });

  it("rejects native creation and new windows once shutdown starts", async () => {
    const h = harness();
    await h.application.newWindow();
    h.start();
    await h.application.requestQuit();
    expect(() => h.createLateSession()).toThrow(
      "Terminal application is shutting down",
    );
    await h.application.newWindow();
    expect(h.windows).toHaveLength(1);
    expect(h.spawn).toHaveBeenCalledOnce();
    expect(() => h.retainedStart()).toThrow(
      "Rejected terminal IPC from an untrusted sender",
    );
    h.ptys[0]!.exit();
    await Promise.resolve();
    await Promise.resolve();
    expect(() => h.createLateSession()).toThrow(
      "Terminal application is shutting down",
    );
    expect(h.quit).toHaveBeenCalledOnce();
  });

  it("releases synchronous spawn failure without forgetting an earlier live session", async () => {
    const h = harness();
    await h.application.newWindow();
    h.start();
    h.spawn.mockImplementationOnce(() => {
      throw new Error("Native spawn failed");
    });
    expect(() => h.start()).toThrow("The Default Shell could not be started");
    await h.application.requestQuit();
    expect(h.quit).not.toHaveBeenCalled();
    h.ptys[0]!.exit();
    await Promise.resolve();
    await Promise.resolve();
    expect(h.quit).toHaveBeenCalledOnce();
  });

  it("waits for every real exit after confirmed Busy Quit, even when disposal suppresses forwarded exits", async () => {
    const h = harness(true);
    await h.application.newWindow();
    h.start();
    h.start();
    await h.application.requestQuit();
    expect(h.showQuitConfirmation).toHaveBeenCalledOnce();
    expect(h.quit).not.toHaveBeenCalled();
    expect(h.ptys.map((pty) => pty.kill.mock.calls.length)).toEqual([1, 1]);
    h.ptys[1]!.exit();
    await Promise.resolve();
    expect(h.quit).not.toHaveBeenCalled();
    h.ptys[0]!.exit();
    await Promise.resolve();
    await Promise.resolve();
    expect(h.quit).toHaveBeenCalledOnce();
    expect(h.forwardedExit).not.toHaveBeenCalled();
    expect(h.windows[0]!.isDestroyed()).toBe(true);
  });
});
