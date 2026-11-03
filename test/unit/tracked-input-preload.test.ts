import { expect, it, vi } from "vitest";
import type { TerminalBridge } from "../../src/shared/terminal-bridge";
import { terminalIpc } from "../../src/shared/terminal-ipc";

const electron = vi.hoisted(() => ({
  bridge: undefined as TerminalBridge | undefined,
  send: vi.fn(),
  invoke: vi.fn(async (): Promise<unknown> => undefined),
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
    invoke: electron.invoke,
    on: vi.fn(),
    removeListener: vi.fn(),
  },
}));

it("validates tracked input and its receipt without falling back to one-way input", async () => {
  await import("../../src/preload/index");
  const bridge = electron.bridge!;
  for (const receipt of ["accepted", "rejected", "unknown"] as const) {
    electron.invoke.mockResolvedValueOnce(receipt);
    await expect(bridge.inputTracked!("s1", "path")).resolves.toBe(receipt);
    expect(electron.invoke).toHaveBeenLastCalledWith(terminalIpc.trackedInput, {
      sessionId: "s1",
      data: "path",
    });
  }
  const calls = electron.invoke.mock.calls.length;
  await expect(bridge.inputTracked!("invalid", "path")).rejects.toThrow(
    TypeError,
  );
  await expect(bridge.inputTracked!("s1", "")).rejects.toThrow(TypeError);
  await expect(bridge.inputTracked!("s1", "x".repeat(65537))).rejects.toThrow(
    TypeError,
  );
  expect(electron.invoke).toHaveBeenCalledTimes(calls);
  electron.invoke.mockResolvedValueOnce(true);
  await expect(bridge.inputTracked!("s1", "path")).rejects.toThrow(TypeError);
  expect(electron.send).not.toHaveBeenCalled();
});
