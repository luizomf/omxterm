import { expect, it, vi } from "vitest";
import type { TerminalBridge } from "../../src/shared/terminal-bridge";
import { terminalIpc } from "../../src/shared/terminal-ipc";
const electron = vi.hoisted(() => ({
  bridge: undefined as TerminalBridge | undefined,
  send: vi.fn(),
}));
vi.mock("electron", () => ({
  contextBridge: {
    exposeInMainWorld(_name: string, value: { terminal: TerminalBridge }) {
      electron.bridge = value.terminal;
    },
  },
  webUtils: { getPathForFile() {} },
  ipcRenderer: {
    send: electron.send,
    invoke: vi.fn(),
    on: vi.fn(),
    removeListener: vi.fn(),
  },
}));
it("sends only the fixed graphical selection identity across preload", async () => {
  await import("../../src/preload/index");
  electron.bridge!.notifyTabSelection({ kind: "settings" });
  expect(electron.send).toHaveBeenLastCalledWith(terminalIpc.tabSelected, {
    kind: "settings",
  });
  for (const payload of [
    { kind: "settings", title: "untrusted" },
    { kind: "settings", sessionId: "s1" },
    { kind: "other" },
  ])
    expect(() => electron.bridge!.notifyTabSelection(payload as never)).toThrow(
      TypeError,
    );
});
