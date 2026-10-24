import { beforeAll, describe, expect, it, vi } from "vitest";
import type { TerminalBridge } from "../../src/shared/terminal-bridge";
import { MAX_TERMINAL_EXPORT_BYTES } from "../../src/shared/terminal-contract";
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
    getPathForFile: vi.fn((file: File) => {
      if (!("name" in file)) throw new TypeError("not a File");
      return process.platform === "win32"
        ? `C:\\Users\\me\\${file.name}`
        : `/Users/me/${file.name}`;
    }),
  };
});

vi.mock("electron", () => ({
  contextBridge: {
    exposeInMainWorld(_key: string, value: { terminal: TerminalBridge }) {
      electron.bridge = value.terminal;
    },
  },
  webUtils: {
    getPathForFile: electron.getPathForFile,
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

beforeAll(async () => {
  await import("../../src/preload/index");
});

describe("preload export bridge", () => {
  it("independently accepts the exact UTF-8 limit, rejects overflow before IPC, and permits only a bounded size notice", async () => {
    const bridge = electron.bridge!;
    const text = "é".repeat(MAX_TERMINAL_EXPORT_BYTES / 2);
    electron.invoke.mockClear();
    await bridge.saveTerminalExport({ kind: "content", text });
    expect(electron.invoke).toHaveBeenCalledExactlyOnceWith(
      terminalIpc.exportSave,
      { kind: "content", text },
    );
    electron.invoke.mockClear();
    for (const request of [
      { kind: "content", text: text + "a" },
      { notice: "too-large", text: "untrusted" },
      { notice: "other" },
    ])
      await expect(bridge.saveTerminalExport(request as never)).rejects.toThrow(
        "Invalid terminal export request",
      );
    expect(electron.invoke).not.toHaveBeenCalled();
    await bridge.saveTerminalExport({ notice: "too-large" });
    expect(electron.invoke).toHaveBeenCalledExactlyOnceWith(
      terminalIpc.exportSave,
      { notice: "too-large" },
    );
  });
  it("validates context-menu and export payloads in both directions", async () => {
    const bridge = electron.bridge!;
    electron.send.mockClear();
    expect(() =>
      bridge.requestClipboardContextMenu({ target: "terminal" } as never),
    ).toThrow("Invalid context menu request");
    bridge.requestClipboardContextMenu({
      target: "terminal",
      hasSelection: true,
      contextId: 1,
    });
    expect(electron.send).toHaveBeenCalledExactlyOnceWith(
      terminalIpc.clipboardContextMenu,
      { target: "terminal", hasSelection: true, contextId: 1 },
    );

    const listener = vi.fn();
    const remove = bridge.onExportRequest(listener);
    const handler = electron.listeners.get(terminalIpc.exportRequest)!;
    for (const kind of [
      undefined,
      "all",
      "selection",
      { kind: "content" },
      { kind: "content", contextId: 0 },
      { kind: "content", contextId: 1, extra: true },
    ])
      handler({}, kind);
    handler({}, { kind: "selection", contextId: 1 });
    handler({}, { kind: "content", contextId: 2 });
    expect(listener.mock.calls).toEqual([
      [{ kind: "selection", contextId: 1 }],
      [{ kind: "content", contextId: 2 }],
    ]);
    remove();
    expect(electron.removeListener).toHaveBeenCalledWith(
      terminalIpc.exportRequest,
      handler,
    );

    electron.invoke.mockClear();
    await expect(
      bridge.saveTerminalExport({ kind: "content", text: 1 } as never),
    ).rejects.toThrow("Invalid terminal export request");
    expect(electron.invoke).not.toHaveBeenCalled();
    electron.invoke.mockResolvedValueOnce(undefined);
    await bridge.saveTerminalExport({ kind: "selection", text: "日本語" });
    expect(electron.invoke).toHaveBeenCalledExactlyOnceWith(
      terminalIpc.exportSave,
      { kind: "selection", text: "日本語" },
    );
  });
});
