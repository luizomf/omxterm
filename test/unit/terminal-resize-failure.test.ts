import type { IPty } from "node-pty";
import { describe, expect, it, vi } from "vitest";
import { createLocalTerminalSession } from "../../src/main/local-terminal-session";
import { registerTerminalIpcRouter } from "../../src/main/terminal-ipc-controller";
import type { OperationalEvent } from "../../src/main/operational-events";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import {
  clipboardOptions,
  createIpcHarness,
} from "../fixtures/terminal-ipc-harness";

function nativePty() {
  let exited:
    ((exit: { exitCode: number; signal: number }) => void) | undefined;
  const pty = {
    resize: vi.fn(),
    write: vi.fn(),
    kill: vi.fn(),
    onData: () => ({ dispose() {} }),
    onExit(listener: typeof exited) {
      exited = listener;
      return {
        dispose: () => {
          exited = undefined;
        },
      };
    },
  };
  return {
    pty,
    exit: (exitCode: number, signal = 0) => exited?.({ exitCode, signal }),
  };
}

function resizeHarness(platform = "darwin") {
  const ipc = createIpcHarness();
  const mainFrame = {};
  const webContents = { mainFrame, isDestroyed: () => false, send: vi.fn() };
  const trusted = { sender: webContents, senderFrame: mainFrame };
  const terminals = [nativePty(), nativePty()];
  const events: OperationalEvent[] = [];
  const onSessionExit = vi.fn();
  const router = registerTerminalIpcRouter(ipc.ipcMain, {
    write(event) {
      events.push(event);
      return true;
    },
  });
  let next = 0;
  router.registerController({
    ...clipboardOptions(),
    windowId: 1,
    webContents,
    createSession: (callbacks) =>
      createLocalTerminalSession(
        () => terminals[next++]!.pty as unknown as IPty,
        {
          shell: "/bin/example-shell",
          platform,
          homeDirectory: "/example",
          environment: {},
          applicationVersionProvider: { getVersion: () => "test" },
          ...callbacks,
        },
      ),
    onSessionExit,
    onSessionStartError: vi.fn(),
  });
  ipc.handlers.get(terminalIpc.start)!(trusted);
  ipc.handlers.get(terminalIpc.start)!(trusted);
  return {
    terminals,
    events,
    onSessionExit,
    webContents,
    router,
    resize(sessionId = "s1", cols = 100, rows = 30, event = trusted) {
      ipc.listeners.get(terminalIpc.resize)!(event, { sessionId, cols, rows });
    },
    input(sessionId: string) {
      ipc.listeners.get(terminalIpc.input)!(trusted, {
        sessionId,
        data: "input",
      });
    },
    close() {
      ipc.listeners.get(terminalIpc.close)!(trusted, { sessionId: "s1" });
    },
  };
}

describe("owned native resize failures", () => {
  it.each([
    ["linux", new Error("ioctl(2) failed, ENOTTY")],
    ["darwin", new Error("PRIVATE_NATIVE_CANARY")],
    ["win32", new Error("ioctl(2) failed, EBADF")],
  ])(
    "reports an actionable %s native failure safely and allows a later resize",
    (platform, error) => {
      const h = resizeHarness(platform);
      const first = h.terminals[0]!;
      first.pty.resize.mockImplementationOnce(() => {
        throw error;
      });
      expect(() => h.resize()).not.toThrow();
      expect(h.events).toContainEqual({
        name: "pty.resize-failed",
        windowId: 1,
        reason: "native-failure",
      });
      expect(JSON.stringify(h.events)).not.toContain(error.message);
      expect(h.onSessionExit).not.toHaveBeenCalled();
      expect(first.pty.kill).not.toHaveBeenCalled();
      h.resize("s1", 120, 40);
      expect(first.pty.resize).toHaveBeenLastCalledWith(120, 40);
      h.close();
      expect(first.pty.kill).toHaveBeenCalledOnce();
      expect(h.onSessionExit).not.toHaveBeenCalled();
      h.resize();
      expect(first.pty.resize).toHaveBeenCalledTimes(2);
      first.exit(0, 15);
      expect(h.onSessionExit).toHaveBeenCalledExactlyOnceWith(
        { exitCode: 0, signal: 15 },
        {
          sessionId: "s1",
          launchKind: "default-shell",
          closeRequested: true,
          liveSessions: 1,
        },
      );
      h.router.dispose();
    },
  );
  it("contains a Unix closed-PTY resize before native exit without completing or harming siblings", () => {
    const h = resizeHarness();
    const first = h.terminals[0]!;
    first.pty.resize.mockImplementation(() => {
      throw new Error("ioctl(2) failed, EBADF");
    });
    // Neither an invalid size nor a foreign frame may reach the fallible PTY.
    h.resize("s1", 0);
    h.resize("s1", 100, 30, { sender: h.webContents, senderFrame: {} });
    h.resize("s9");
    expect(first.pty.resize).not.toHaveBeenCalled();
    expect(() => h.resize()).not.toThrow();
    expect(h.events).toContainEqual({
      name: "pty.resize-failed",
      windowId: 1,
      reason: "closed-pty",
    });
    expect(h.onSessionExit).not.toHaveBeenCalled();
    expect(first.pty.kill).not.toHaveBeenCalled();
    expect(
      h.webContents.send.mock.calls.filter(
        ([channel]) => channel === terminalIpc.exit,
      ),
    ).toEqual([]);
    h.resize("s2");
    h.input("s2");
    expect(h.terminals[1]!.pty.resize).toHaveBeenCalledWith(100, 30);
    expect(h.terminals[1]!.pty.write).toHaveBeenCalledWith("input");
    first.exit(7);
    expect(h.onSessionExit).toHaveBeenCalledExactlyOnceWith(
      { exitCode: 7, signal: 0 },
      {
        sessionId: "s1",
        launchKind: "default-shell",
        closeRequested: false,
        liveSessions: 1,
      },
    );
    h.resize();
    expect(first.pty.resize).toHaveBeenCalledOnce();
    h.router.dispose();
  });
});
