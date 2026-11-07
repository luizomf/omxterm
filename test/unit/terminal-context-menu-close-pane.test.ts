import { beforeAll, describe, expect, it, vi } from "vitest";
import { clipboardRequests } from "../../src/main/terminal-ipc-boundaries";
import type { TerminalBridge } from "../../src/shared/terminal-bridge";
import { terminalIpc } from "../../src/shared/terminal-ipc";

const electron = vi.hoisted(() => ({
  bridge: undefined as TerminalBridge | undefined,
  send: vi.fn(),
  listeners: new Map<string, (_event: unknown, payload: unknown) => void>(),
}));

vi.mock("electron", () => ({
  contextBridge: {
    exposeInMainWorld(_key: string, value: { terminal: TerminalBridge }) {
      electron.bridge = value.terminal;
    },
  },
  webUtils: { getPathForFile: vi.fn() },
  ipcRenderer: {
    send: electron.send,
    invoke: vi.fn(),
    on: vi.fn(
      (
        channel: string,
        listener: (_event: unknown, payload: unknown) => void,
      ) => {
        electron.listeners.set(channel, listener);
      },
    ),
    removeListener: vi.fn(),
  },
}));

beforeAll(async () => {
  await import("../../src/preload/index");
});

const forgedOffers = [
  { closePane: true },
  { sessionId: "s1", menuId: 0 },
  { sessionId: "s1", menuId: 1.5 },
  { sessionId: "s1", menuId: Number.MAX_SAFE_INTEGER + 1 },
  { sessionId: "foreign", menuId: 1 },
  { sessionId: "s1", menuId: 1, closePane: false, hasSelection: false },
  { sessionId: "s1", menuId: 1, hasSelection: "yes" },
  { sessionId: "s1", menuId: 1, hasSelection: false, extra: true },
  { closePane: false },
  { closePane: "yes" },
  { closePane: true, extra: 1 },
  [true],
];

describe("Close Pane context menu offer", () => {
  it("accepts only exact bounded popup targets on the existing tab-command channel", () => {
    const listener = vi.fn();
    electron.bridge!.onTabCommand(listener);
    const deliver = electron.listeners.get(terminalIpc.tabCommand)!;
    const target = { sessionId: "s1", menuId: 1 };
    deliver({}, { action: "close-pane", target });
    expect(listener).toHaveBeenLastCalledWith({ action: "close-pane", target });
    deliver({}, { action: "prepare-close-pane", target });
    expect(listener).toHaveBeenLastCalledWith({
      action: "prepare-close-pane",
      target,
    });
    listener.mockClear();
    for (const invalid of [
      { action: "close-pane", target: { ...target, extra: true } },
      { action: "prepare-close-pane", target: { ...target, menuId: 0 } },
      { action: "close-pane", target: { ...target, sessionId: "foreign" } },
      { action: "resolve-close-pane", confirmed: true, target },
    ])
      deliver({}, invalid);
    expect(listener).not.toHaveBeenCalled();
    deliver({}, { action: "close-pane" });
    expect(listener).toHaveBeenCalledExactlyOnceWith({ action: "close-pane" });
  });

  it("delivers only bounded clipboard action notifications through preload", () => {
    const listener = vi.fn();
    electron.bridge!.onClipboardAction(listener);
    const deliver = electron.listeners.get(terminalIpc.clipboardAction)!;
    deliver({}, "paste");
    expect(listener).toHaveBeenLastCalledWith("paste");
    deliver({}, { action: "copy", target: { sessionId: "s1", menuId: 1 } });
    expect(listener).toHaveBeenLastCalledWith("copy", {
      sessionId: "s1",
      menuId: 1,
    });
    listener.mockClear();
    for (const invalid of [
      { action: "delete", target: { sessionId: "s1", menuId: 1 } },
      { action: "paste", target: { sessionId: "s1", menuId: -1 } },
      { action: "paste", target: { sessionId: "s1", menuId: 1, extra: true } },
      { action: "copy", target: { sessionId: "s1", menuId: 1 }, extra: true },
      { action: "paste" },
    ])
      deliver({}, invalid);
    expect(listener).not.toHaveBeenCalled();
  });

  it("leaves preload only with no request or the exact offer", () => {
    const bridge = electron.bridge!;
    const channel = terminalIpc.clipboardContextMenu;
    bridge.requestClipboardContextMenu();
    expect(electron.send).toHaveBeenLastCalledWith(channel);
    bridge.requestClipboardContextMenu({
      sessionId: "s1",
      menuId: 1,
      hasSelection: false,
      closePane: true,
    });
    expect(electron.send).toHaveBeenLastCalledWith(channel, {
      sessionId: "s1",
      menuId: 1,
      hasSelection: false,
      closePane: true,
    });
    electron.send.mockClear();
    for (const forged of forgedOffers)
      expect(() => bridge.requestClipboardContextMenu(forged as never)).toThrow(
        TypeError,
      );
    expect(electron.send).not.toHaveBeenCalled();
  });

  it("reaches main's menu only as the exact offer", () => {
    const showClipboardContextMenu = vi.fn();
    const reject = vi.fn();
    const requests = clipboardRequests(
      {
        writeClipboardText: vi.fn(),
        readClipboardText: () => "",
        confirmPaste: async () => false,
        showClipboardContextMenu,
      },
      reject,
    );
    for (const forged of forgedOffers)
      requests.showClipboardContextMenu(forged);
    expect(showClipboardContextMenu).not.toHaveBeenCalled();
    expect(reject).toHaveBeenCalledTimes(forgedOffers.length);
    expect(reject).toHaveBeenLastCalledWith("clipboard", "invalid-payload");

    requests.showClipboardContextMenu();
    expect(showClipboardContextMenu).toHaveBeenLastCalledWith();
    requests.showClipboardContextMenu({
      sessionId: "s1",
      menuId: 1,
      hasSelection: false,
      closePane: true,
    });
    expect(showClipboardContextMenu).toHaveBeenLastCalledWith({
      sessionId: "s1",
      menuId: 1,
      hasSelection: false,
      closePane: true,
    });
  });
});
