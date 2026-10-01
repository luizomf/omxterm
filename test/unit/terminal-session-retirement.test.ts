import { describe, expect, it, vi } from "vitest";
import { registerTerminalIpcRouter } from "../../src/main/terminal-ipc-controller";
import type { SessionCallbacks } from "../../src/main/terminal-ipc-types";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import {
  clipboardOptions,
  createIpcHarness,
} from "../fixtures/terminal-ipc-harness";

describe("session retirement", () => {
  it("delivers immutable end context, then rejects retired routing without touching a sibling", () => {
    const ipc = createIpcHarness();
    const router = registerTerminalIpcRouter(ipc.ipcMain);
    const mainFrame = {};
    const webContents = { mainFrame, isDestroyed: () => false, send: vi.fn() };
    const owner = { sender: webContents, senderFrame: mainFrame };
    const callbacks: SessionCallbacks[] = [];
    const sessions = [0, 1].map(() => ({
      launchKind: "explicit-command" as const,
      write: vi.fn(),
      resize: vi.fn(),
      close: vi.fn(),
      acknowledgeOutput: vi.fn(() => true),
      hasForegroundChildProcess: vi.fn(() => false),
    }));
    const options = clipboardOptions();
    const onSessionExit = vi.fn();
    const controller = router.registerController({
      ...options,
      webContents,
      onSessionExit,
      onSessionStartError: vi.fn(),
      createSession(value) {
        callbacks.push(value);
        return sessions[callbacks.length - 1]!;
      },
    });
    const send = (channel: string, payload: unknown) =>
      ipc.listeners.get(channel)!(owner, payload);
    ipc.handlers.get(terminalIpc.start)!(owner);
    ipc.handlers.get(terminalIpc.start)!(owner);
    callbacks[0]!.onOutput("tail");
    send(terminalIpc.close, { sessionId: "s1", reason: "rendering-failure" });
    expect(onSessionExit).not.toHaveBeenCalled();
    callbacks[0]!.onExit({ exitCode: 0, signal: 15 });
    expect(onSessionExit).toHaveBeenCalledExactlyOnceWith(
      { exitCode: 0, signal: 15 },
      {
        sessionId: "s1",
        launchKind: "explicit-command",
        closeRequested: true,
        closeReason: "rendering-failure",
        liveSessions: 1,
      },
    );
    const context = onSessionExit.mock.calls[0]![1] as object;
    send(terminalIpc.input, { sessionId: "s1", data: "stale" });
    send(terminalIpc.resize, { sessionId: "s1", cols: 100, rows: 30 });
    send(terminalIpc.title, { sessionId: "s1", title: "stale" });
    send(terminalIpc.bell, { sessionId: "s1" });
    send(terminalIpc.outputAck, { sessionId: "s1", end: 4 });
    send(terminalIpc.tabTitleSync, { sessionId: "s1" });
    send(terminalIpc.tabSelected, { sessionId: "s1" });
    send(terminalIpc.close, { sessionId: "s1" });
    expect(options.onUserInteraction).not.toHaveBeenCalled();
    expect(Object.isFrozen(context)).toBe(true);
    expect(options.onTitleRequest).not.toHaveBeenCalled();
    expect(options.onBell).not.toHaveBeenCalled();
    expect(options.onSessionSelected).not.toHaveBeenCalled();
    expect(sessions[0]!.write).not.toHaveBeenCalled();
    expect(sessions[0]!.resize).not.toHaveBeenCalled();
    expect(sessions[0]!.acknowledgeOutput).not.toHaveBeenCalled();
    expect(sessions[0]!.close).toHaveBeenCalledOnce();
    expect(controller.hasBusySession()).toBe(false);
    expect(sessions[0]!.hasForegroundChildProcess).not.toHaveBeenCalled();
    send(terminalIpc.input, { sessionId: "s2", data: "live" });
    expect(sessions[1]!.write).toHaveBeenCalledExactlyOnceWith("live");
    router.dispose();
    expect(sessions[0]!.close).toHaveBeenCalledOnce();
    expect(sessions[1]!.close).toHaveBeenCalledOnce();
  });
});
