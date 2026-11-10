import { beforeAll, describe, expect, it, vi } from "vitest";
import type { TerminalBridge } from "../../src/shared/terminal-bridge";
import {
  isTerminalExportSaveRequest,
  MAX_TERMINAL_EXPORT_BYTES,
} from "../../src/shared/terminal-contract";
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
  it.each([
    ["ASCII", () => "a".repeat(MAX_TERMINAL_EXPORT_BYTES)],
    ["two-byte", () => "é".repeat(MAX_TERMINAL_EXPORT_BYTES / 2)],
    [
      "three-byte",
      () => "日".repeat((MAX_TERMINAL_EXPORT_BYTES - 1) / 3) + "a",
    ],
    ["surrogate pair", () => "🙂".repeat(MAX_TERMINAL_EXPORT_BYTES / 4)],
    [
      "lone surrogate",
      () => "\ud800".repeat((MAX_TERMINAL_EXPORT_BYTES - 1) / 3) + "a",
    ],
  ] as const)(
    "accepts the inclusive UTF-8 bound for %s and rejects one extra byte before IPC",
    async (_label, exactText) => {
      const text = exactText();
      expect(new TextEncoder().encode(text).byteLength).toBe(
        MAX_TERMINAL_EXPORT_BYTES,
      );
      const request = { kind: "content", text } as const;
      electron.invoke.mockClear();
      expect(isTerminalExportSaveRequest(request)).toBe(true);
      await electron.bridge!.saveTerminalExport(request);
      expect(electron.invoke).toHaveBeenCalledExactlyOnceWith(
        terminalIpc.exportSave,
        request,
      );
      electron.invoke.mockClear();
      const overflow = { kind: "content", text: text + "a" } as const;
      expect(isTerminalExportSaveRequest(overflow)).toBe(false);
      await expect(
        electron.bridge!.saveTerminalExport(overflow),
      ).rejects.toThrow("Invalid terminal export request");
      expect(electron.invoke).not.toHaveBeenCalled();
    },
  );

  it("accepts both text kinds, empty text and only the bounded notices", async () => {
    for (const request of [
      { kind: "selection", text: "日本語 café 👩‍💻" },
      { kind: "content", text: "" },
      { notice: "too-large" },
      { notice: "failed" },
    ] as const) {
      electron.invoke.mockClear();
      expect(isTerminalExportSaveRequest(request)).toBe(true);
      await electron.bridge!.saveTerminalExport(request);
      expect(electron.invoke).toHaveBeenCalledExactlyOnceWith(
        terminalIpc.exportSave,
        request,
      );
    }
  });

  it("rejects non-exact save shapes and legacy variants without invoking IPC", async () => {
    electron.invoke.mockClear();
    for (const request of [
      undefined,
      null,
      [],
      "content",
      {},
      { kind: "all", text: "text" },
      { kind: "selection" },
      { kind: "content", text: 1 },
      { kind: "content", text: "text", extra: true },
      { kind: "content", overLimit: true },
      { kind: "content", text: "text", overLimit: false },
      { notice: "other" },
      { notice: "too-large", text: "untrusted" },
      { notice: "too-large", kind: "selection" },
    ]) {
      expect(isTerminalExportSaveRequest(request)).toBe(false);
      await expect(
        electron.bridge!.saveTerminalExport(request as never),
      ).rejects.toThrow("Invalid terminal export request");
    }
    expect(electron.invoke).not.toHaveBeenCalled();
  });

  it("accepts exact targeted menu requests and the no-argument field route", () => {
    const bridge = electron.bridge!;
    for (const request of [
      { sessionId: "s1", menuId: 1, hasSelection: false },
      {
        sessionId: "s2",
        menuId: Number.MAX_SAFE_INTEGER,
        hasSelection: true,
        closePane: true,
      },
    ] as const) {
      electron.send.mockClear();
      bridge.requestClipboardContextMenu(request);
      expect(electron.send).toHaveBeenCalledExactlyOnceWith(
        terminalIpc.clipboardContextMenu,
        request,
      );
    }
    electron.send.mockClear();
    bridge.requestClipboardContextMenu();
    expect(electron.send).toHaveBeenCalledExactlyOnceWith(
      terminalIpc.clipboardContextMenu,
    );
  });

  it("rejects local Surface descriptors, invalid menu targets and non-exact wire shapes", () => {
    const valid = { sessionId: "s1", menuId: 1, hasSelection: true };
    electron.send.mockClear();
    for (const request of [
      null,
      [],
      {},
      { target: "field" },
      { target: "terminal", hasSelection: true },
      { target: "terminal", hasSelection: true, contextId: 1 },
      { sessionId: "s1", menuId: 1 },
      { ...valid, hasSelection: 1 },
      { ...valid, hasSelection: undefined },
      { ...valid, sessionId: "s0" },
      { ...valid, sessionId: "s01" },
      { ...valid, sessionId: "s1000000000" },
      { ...valid, sessionId: 1 },
      ...[0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, "1"].map(
        (menuId) => ({ ...valid, menuId }),
      ),
      { ...valid, closePane: false },
      { ...valid, closePane: undefined },
      { ...valid, extra: true },
    ])
      expect(() =>
        electron.bridge!.requestClipboardContextMenu(request as never),
      ).toThrow("Invalid context menu request");
    expect(electron.send).not.toHaveBeenCalled();
  });

  it("delivers only validated fixed-kind export contexts and removes the exact listener", () => {
    const listener = vi.fn();
    const remove = electron.bridge!.onExportRequest(listener);
    const handler = electron.listeners.get(terminalIpc.exportRequest)!;
    const target = { sessionId: "s1", menuId: 1 };
    for (const payload of [
      undefined,
      null,
      [],
      "selection",
      "content",
      { kind: "content" },
      { kind: "content", contextId: 1 },
      { kind: "all", target },
      { kind: "content", target, extra: true },
      { kind: "content", target: { ...target, hasSelection: false } },
      { kind: "selection", target: { ...target, sessionId: "s0" } },
      { kind: "selection", target: { ...target, sessionId: "s01" } },
      { kind: "selection", target: { ...target, sessionId: "s1000000000" } },
      ...[0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, "1"].map(
        (menuId) => ({ kind: "content", target: { ...target, menuId } }),
      ),
    ])
      handler({}, payload);
    expect(listener).not.toHaveBeenCalled();
    const contexts = [
      { kind: "selection", target },
      {
        kind: "content",
        target: { sessionId: "s2", menuId: Number.MAX_SAFE_INTEGER },
      },
    ] as const;
    for (const context of contexts) handler({}, context);
    expect(listener.mock.calls).toEqual(contexts.map((context) => [context]));
    remove();
    expect(electron.removeListener).toHaveBeenCalledWith(
      terminalIpc.exportRequest,
      handler,
    );
    expect(electron.listeners.has(terminalIpc.exportRequest)).toBe(false);
  });
});
