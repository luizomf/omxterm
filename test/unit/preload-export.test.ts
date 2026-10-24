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
  it("validates context-menu and export payloads in both directions", async () => {
    const bridge = electron.bridge!;
    electron.send.mockClear();
    expect(() =>
      bridge.requestClipboardContextMenu({ hasSelection: "yes" } as never),
    ).toThrow("Invalid context menu request");
    bridge.requestClipboardContextMenu({ hasSelection: true });
    expect(electron.send).toHaveBeenCalledExactlyOnceWith(
      terminalIpc.clipboardContextMenu,
      { hasSelection: true },
    );

    const listener = vi.fn();
    const remove = bridge.onExportRequest(listener);
    const handler = electron.listeners.get(terminalIpc.exportRequest)!;
    for (const kind of [undefined, "all", { kind: "content" }])
      handler({}, kind);
    handler({}, "selection");
    handler({}, "content");
    expect(listener.mock.calls).toEqual([["selection"], ["content"]]);
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
