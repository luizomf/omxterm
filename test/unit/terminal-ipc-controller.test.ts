import { describe, expect, it, vi } from "vitest";
import {
  registerTerminalIpcController,
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
  it("preserves shell startup failures for the Terminal Window host", () => {
    const ipc = createIpcHarness();
    const mainFrame = {};
    const webContents: TrustedWebContents = {
      mainFrame,
      isDestroyed: () => false,
      send: vi.fn(),
    };
    const failure = new Error("spawn failed");
    const onSessionStartError = vi.fn();
    registerTerminalIpcController({
      ipcMain: ipc.ipcMain,
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
    ).toThrow(failure);
    expect(onSessionStartError).toHaveBeenCalledWith(failure);
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
    registerTerminalIpcController({
      ipcMain: ipc.ipcMain,
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
    let callbacks:
      | Parameters<
          Parameters<typeof registerTerminalIpcController>[0]["createSession"]
        >[0]
      | undefined;
    const onSessionExit = vi.fn();
    const controller = registerTerminalIpcController({
      ipcMain: ipc.ipcMain,
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
    controller.dispose();
    controller.dispose();

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
    let controller: ReturnType<typeof registerTerminalIpcController>;
    controller = registerTerminalIpcController({
      ipcMain: ipc.ipcMain,
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

    expect(close).toHaveBeenCalledOnce();
    expect(ipc.handlers.size).toBe(0);
    expect(ipc.listeners.size).toBe(0);
    expect(webContents.send).not.toHaveBeenCalled();
  });
});
