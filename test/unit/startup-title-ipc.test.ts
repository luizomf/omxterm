import { describe, expect, it, vi } from "vitest";
import {
  registerTerminalIpcRouter,
  type TerminalIpcControllerOptions,
} from "../../src/main/terminal-ipc-controller";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import {
  clipboardOptions,
  createIpcHarness,
} from "../fixtures/terminal-ipc-harness";

describe("startup title synchronization ownership", () => {
  it("validates renderer/frame/session and never changes selection or stores unknown requests", () => {
    const ipc = createIpcHarness();
    const write = vi.fn();
    const router = registerTerminalIpcRouter(ipc.ipcMain, { write });
    const callbacks: Parameters<
      TerminalIpcControllerOptions["createSession"]
    >[0][] = [];
    const register = () => {
      const webContents = {
        mainFrame: {},
        isDestroyed: () => false,
        send: vi.fn(),
      };
      const sync = vi.fn();
      const selected = vi.fn();
      const controller = router.registerController({
        ...clipboardOptions(),
        webContents,
        onSessionTitleSync: sync,
        onSessionSelected: selected,
        onSessionStartError() {},
        onSessionExit() {},
        createSession(callback) {
          callbacks.push(callback);
          return {
            write() {},
            resize() {},
            close() {},
            hasForegroundChildProcess: () => false,
          };
        },
      });
      return {
        event: { sender: webContents, senderFrame: webContents.mainFrame },
        sync,
        selected,
        controller,
      };
    };
    const a = register();
    const b = register();
    ipc.handlers.get(terminalIpc.start)!(a.event);
    ipc.handlers.get(terminalIpc.start)!(a.event);
    ipc.handlers.get(terminalIpc.start)!(b.event);
    const request = ipc.listeners.get(terminalIpc.tabTitleSync)!;
    for (const payload of [
      null,
      "s1",
      {},
      { sessionId: "s0" },
      { sessionId: "s1", title: "private-canary" },
    ])
      request(a.event, payload);
    request({ ...a.event, senderFrame: {} }, { sessionId: "s1" });
    request(
      { sender: { ...a.event.sender }, senderFrame: a.event.senderFrame },
      { sessionId: "s1" },
    );
    for (let id = 2; id < 1002; id += 1)
      request(b.event, { sessionId: `s${id}` });
    expect(a.sync).not.toHaveBeenCalled();
    expect(b.sync).not.toHaveBeenCalled();
    request(a.event, { sessionId: "s2" });
    request(b.event, { sessionId: "s1" });
    expect(a.sync).toHaveBeenCalledExactlyOnceWith("s2");
    expect(b.sync).toHaveBeenCalledExactlyOnceWith("s1");
    expect(a.selected).not.toHaveBeenCalled();
    expect(b.selected).not.toHaveBeenCalled();
    ipc.listeners.get(terminalIpc.close)!(a.event, { sessionId: "s2" });
    callbacks[0]!.onExit({ exitCode: 0, signal: 0 });
    request(a.event, { sessionId: "s1" });
    request(a.event, { sessionId: "s2" });
    expect(a.sync).toHaveBeenCalledTimes(1);
    a.controller.dispose();
    request(a.event, { sessionId: "s1" });
    expect(a.sync).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(write.mock.calls)).not.toContain("private-canary");
    router.dispose();
    expect(ipc.listeners.has(terminalIpc.tabTitleSync)).toBe(false);
  });
});
