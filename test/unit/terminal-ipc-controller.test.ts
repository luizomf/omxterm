import { describe, expect, it, vi } from "vitest";
import {
  registerTerminalIpcRouter,
  type IpcEvent,
  type IpcMainPort,
  type TrustedWebContents,
} from "../../src/main/terminal-ipc-controller";
import type { LocalTerminalSession } from "../../src/main/local-terminal-session";
import { terminalIpc } from "../../src/shared/terminal-ipc";

function createIpcHarness() {
  const handlers = new Map<
    string,
    (event: IpcEvent, payload?: unknown) => void
  >();
  const listeners = new Map<
    string,
    (event: IpcEvent, payload?: unknown) => void
  >();
  const ipcMain: IpcMainPort = {
    handle: (channel, handler) => handlers.set(channel, handler),
    removeHandler: (channel) => void handlers.delete(channel),
    on: (channel, listener) => void listeners.set(channel, listener),
    removeListener: (channel, listener) => {
      if (listeners.get(channel) === listener) listeners.delete(channel);
    },
  };
  return { ipcMain, handlers, listeners };
}

describe("terminal IPC controller", () => {
  it("routes two Terminal Windows to independent Live Terminal Sessions", () => {
    const ipc = createIpcHarness();
    const router = registerTerminalIpcRouter(ipc.ipcMain);
    const firstFrame = {};
    const secondFrame = {};
    const firstWebContents: TrustedWebContents = {
      mainFrame: firstFrame,
      isDestroyed: () => false,
      send: vi.fn(),
    };
    const secondWebContents: TrustedWebContents = {
      mainFrame: secondFrame,
      isDestroyed: () => false,
      send: vi.fn(),
    };
    const firstSession: LocalTerminalSession = {
      write: vi.fn(),
      resize: vi.fn(),
      close: vi.fn(),
    };
    const secondSession: LocalTerminalSession = {
      write: vi.fn(),
      resize: vi.fn(),
      close: vi.fn(),
    };

    router.registerController({
      webContents: firstWebContents,
      createSession: vi.fn(() => firstSession),
      onSessionStartError: vi.fn(),
      onSessionExit: vi.fn(),
    });
    router.registerController({
      webContents: secondWebContents,
      createSession: vi.fn(() => secondSession),
      onSessionStartError: vi.fn(),
      onSessionExit: vi.fn(),
    });

    ipc.handlers.get(terminalIpc.start)!({
      sender: firstWebContents,
      senderFrame: firstFrame,
    });
    ipc.handlers.get(terminalIpc.start)!({
      sender: secondWebContents,
      senderFrame: secondFrame,
    });
    ipc.listeners.get(terminalIpc.input)?.(
      { sender: secondWebContents, senderFrame: secondFrame },
      "second window input",
    );
    ipc.listeners.get(terminalIpc.close)?.({
      sender: firstWebContents,
      senderFrame: firstFrame,
    });

    expect(firstSession.write).not.toHaveBeenCalled();
    expect(secondSession.write).toHaveBeenCalledWith("second window input");
    expect(firstSession.close).toHaveBeenCalledOnce();
    expect(secondSession.close).not.toHaveBeenCalled();
    expect(ipc.handlers.size).toBe(1);
    expect(ipc.listeners.size).toBe(3);
  });

  it("reports a normalized shell startup failure without disclosing the cause", () => {
    const ipc = createIpcHarness();
    const mainFrame = {};
    const webContents: TrustedWebContents = {
      mainFrame,
      isDestroyed: () => false,
      send: vi.fn(),
    };
    const failure = new Error("spawn failed: TERMINAL_PAYLOAD_CANARY");
    const onSessionStartError = vi.fn();
    const router = registerTerminalIpcRouter(ipc.ipcMain);
    router.registerController({
      webContents,
      createSession() {
        throw failure;
      },
      onSessionStartError,
      onSessionExit: vi.fn(),
    });

    expect(() =>
      ipc.handlers.get(terminalIpc.start)!({
        sender: webContents,
        senderFrame: mainFrame,
      }),
    ).toThrow("The Default Shell could not be started");
    expect(onSessionStartError).toHaveBeenCalledWith();
    expect(JSON.stringify(onSessionStartError.mock.calls)).not.toContain(
      "TERMINAL_PAYLOAD_CANARY",
    );
  });

  it("accepts only the bound web contents and its main frame", () => {
    const ipc = createIpcHarness();
    const mainFrame = {};
    const webContents: TrustedWebContents = {
      mainFrame,
      isDestroyed: () => false,
      send: vi.fn(),
    };
    const session: LocalTerminalSession = {
      write: vi.fn(),
      resize: vi.fn(),
      close: vi.fn(),
    };
    const createSession = vi.fn(() => session);
    const router = registerTerminalIpcRouter(ipc.ipcMain);
    router.registerController({
      webContents,
      createSession,
      onSessionStartError: vi.fn(),
      onSessionExit: vi.fn(),
    });

    const start = ipc.handlers.get(terminalIpc.start)!;
    expect(() =>
      start({
        sender: { ...webContents, mainFrame: {} },
        senderFrame: mainFrame,
      }),
    ).toThrow("untrusted sender");
    expect(() => start({ sender: webContents, senderFrame: {} })).toThrow(
      "untrusted sender",
    );
    expect(() =>
      start(
        { sender: webContents, senderFrame: mainFrame },
        { unexpected: true },
      ),
    ).toThrow("Invalid terminal start payload");
    start({ sender: webContents, senderFrame: mainFrame });

    const trustedEvent = { sender: webContents, senderFrame: mainFrame };
    ipc.listeners.get(terminalIpc.input)?.(trustedEvent, "hello");
    ipc.listeners.get(terminalIpc.input)?.(trustedEvent, "x".repeat(65_537));
    ipc.listeners.get(terminalIpc.resize)?.(trustedEvent, {
      cols: 100,
      rows: 30,
    });
    ipc.listeners.get(terminalIpc.resize)?.(trustedEvent, {
      cols: -1,
      rows: 30,
    });

    expect(createSession).toHaveBeenCalledOnce();
    expect(session.write).toHaveBeenCalledOnce();
    expect(session.write).toHaveBeenCalledWith("hello");
    expect(session.resize).toHaveBeenCalledOnce();
    expect(session.resize).toHaveBeenCalledWith({ cols: 100, rows: 30 });
  });

  it("forwards bounded output/exit and disposes session and IPC listeners once", () => {
    const ipc = createIpcHarness();
    const mainFrame = {};
    const send = vi.fn();
    const webContents: TrustedWebContents = {
      mainFrame,
      isDestroyed: () => false,
      send,
    };
    const close = vi.fn();
    const router = registerTerminalIpcRouter(ipc.ipcMain);
    let callbacks:
      | Parameters<
          Parameters<typeof router.registerController>[0]["createSession"]
        >[0]
      | undefined;
    const onSessionExit = vi.fn();
    const controller = router.registerController({
      webContents,
      createSession(value) {
        callbacks = value;
        return { write: vi.fn(), resize: vi.fn(), close };
      },
      onSessionStartError: vi.fn(),
      onSessionExit,
    });

    ipc.handlers.get(terminalIpc.start)!({
      sender: webContents,
      senderFrame: mainFrame,
    });
    callbacks!.onOutput("output");
    callbacks!.onExit({ exitCode: 0, signal: 0 });
    ipc.listeners.get(terminalIpc.close)?.({
      sender: webContents,
      senderFrame: mainFrame,
    });
    controller.dispose();
    controller.dispose();
    router.dispose();

    expect(send).toHaveBeenNthCalledWith(1, terminalIpc.output, "output");
    expect(send).toHaveBeenNthCalledWith(2, terminalIpc.exit, {
      exitCode: 0,
      signal: 0,
    });
    expect(onSessionExit).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(ipc.handlers.size).toBe(0);
    expect(ipc.listeners.size).toBe(0);
  });

  it("closes a session returned after reentrant exit disposal exactly once", () => {
    const ipc = createIpcHarness();
    const mainFrame = {};
    const webContents: TrustedWebContents = {
      mainFrame,
      isDestroyed: () => true,
      send: vi.fn(),
    };
    const close = vi.fn();
    const router = registerTerminalIpcRouter(ipc.ipcMain);
    let controller: ReturnType<typeof router.registerController>;
    controller = router.registerController({
      webContents,
      createSession(callbacks) {
        callbacks.onExit({ exitCode: 0, signal: 0 });
        return { write: vi.fn(), resize: vi.fn(), close };
      },
      onSessionStartError: vi.fn(),
      onSessionExit() {
        controller.dispose();
      },
    });

    ipc.handlers.get(terminalIpc.start)!({
      sender: webContents,
      senderFrame: mainFrame,
    });
    controller.dispose();
    router.dispose();

    expect(close).toHaveBeenCalledOnce();
    expect(ipc.handlers.size).toBe(0);
    expect(ipc.listeners.size).toBe(0);
    expect(webContents.send).not.toHaveBeenCalled();
  });
});
