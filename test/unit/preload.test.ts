import { beforeAll, describe, expect, it, vi } from "vitest";
import type { TerminalBridge } from "../../src/shared/terminal-bridge";
import { terminalIpc } from "../../src/shared/terminal-ipc";

const electron = vi.hoisted(() => {
  const listeners = new Map<
    string,
    (event: unknown, payload: unknown) => void
  >();
  return {
    bridge: undefined as TerminalBridge | undefined,
    listeners,
    send: vi.fn(),
    invoke: vi.fn(async (_channel?: string): Promise<unknown> => undefined),
    removeListener: vi.fn((channel: string) => listeners.delete(channel)),
  };
});

vi.mock("electron", () => ({
  contextBridge: {
    exposeInMainWorld(_key: string, value: { terminal: TerminalBridge }) {
      electron.bridge = value.terminal;
    },
  },
  ipcRenderer: {
    send: electron.send,
    invoke: electron.invoke,
    on(channel: string, listener: (event: unknown, payload: unknown) => void) {
      electron.listeners.set(channel, listener);
    },
    removeListener: electron.removeListener,
  },
}));

describe("isolated preload terminal bridge", () => {
  beforeAll(async () => {
    await import("../../src/preload/index");
  });

  it("validates outbound input and resize message shapes", () => {
    const bridge = electron.bridge!;

    bridge.input("hello");
    bridge.resize({ cols: 80, rows: 24 });
    expect(() => bridge.input("")).toThrow(TypeError);
    expect(() => bridge.resize({ cols: 0, rows: 24 })).toThrow(TypeError);

    expect(electron.send).toHaveBeenCalledWith(terminalIpc.input, "hello");
    expect(electron.send).toHaveBeenCalledWith(terminalIpc.resize, {
      cols: 80,
      rows: 24,
    });
  });

  it("delivers only valid bounded messages from main and removes subscriptions", () => {
    const bridge = electron.bridge!;
    const onOutput = vi.fn();
    const onExit = vi.fn();
    const removeOutput = bridge.onOutput(onOutput);
    const removeExit = bridge.onExit(onExit);

    electron.listeners.get(terminalIpc.output)?.({}, "output");
    electron.listeners.get(terminalIpc.output)?.({}, "");
    electron.listeners.get(terminalIpc.exit)?.({}, { exitCode: 0, signal: 0 });
    electron.listeners.get(terminalIpc.exit)?.(
      {},
      { exitCode: "0", signal: 0 },
    );
    removeOutput();
    removeExit();

    expect(onOutput).toHaveBeenCalledOnce();
    expect(onOutput).toHaveBeenCalledWith("output");
    expect(onExit).toHaveBeenCalledOnce();
    expect(onExit).toHaveBeenCalledWith({ exitCode: 0, signal: 0 });
    expect(electron.removeListener).toHaveBeenCalledTimes(2);
  });

  it("delivers only valid Window Font Zoom commands from main", () => {
    const bridge = electron.bridge!;
    const onFontZoom = vi.fn();
    const remove = bridge.onFontZoom(onFontZoom);

    electron.listeners.get(terminalIpc.fontZoom)?.({}, "in");
    electron.listeners.get(terminalIpc.fontZoom)?.({}, "application");
    electron.listeners.get(terminalIpc.fontZoom)?.({}, "reset");
    remove();

    expect(onFontZoom.mock.calls).toEqual([["in"], ["reset"]]);
    expect(electron.removeListener).toHaveBeenCalledWith(
      terminalIpc.fontZoom,
      expect.any(Function),
    );
  });

  it("exposes only text clipboard operations and validates both directions", async () => {
    const bridge = electron.bridge!;
    electron.invoke.mockImplementation(async (channel?: string) => {
      if (channel === terminalIpc.clipboardRead) return "pasted text";
      if (channel === terminalIpc.clipboardConfirmPaste) return true;
      return undefined;
    });

    await bridge.writeClipboardText("copied text");
    await expect(bridge.readClipboardText()).resolves.toBe("pasted text");
    await expect(bridge.confirmPaste("one\ntwo")).resolves.toBe(true);
    await expect(bridge.writeClipboardText("")).rejects.toThrow(TypeError);

    expect(electron.invoke).toHaveBeenCalledWith(
      terminalIpc.clipboardWrite,
      "copied text",
    );
    expect(electron.invoke).toHaveBeenCalledWith(terminalIpc.clipboardRead);
    expect(electron.invoke).toHaveBeenCalledWith(
      terminalIpc.clipboardConfirmPaste,
      "one\ntwo",
    );
    expect(Object.keys(bridge).some((key) => /image/i.test(key))).toBe(false);
  });
});
