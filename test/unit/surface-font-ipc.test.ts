import { expect, it, vi } from "vitest";
import { registerTerminalIpcRouter } from "../../src/main/terminal-ipc-controller";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import {
  createIpcHarness,
  clipboardOptions,
} from "../fixtures/terminal-ipc-harness";

it("accepts only owned issued snapshots and one-shot starts, and releases pending owners", () => {
  const ipc = createIpcHarness();
  const router = registerTerminalIpcRouter(ipc.ipcMain);
  const createSession = vi.fn(() => ({
    close: vi.fn(),
    write: vi.fn(),
    resize: vi.fn(),
    hasForegroundChildProcess: () => false,
  }));
  const register = () => {
    const webContents = {
      mainFrame: {},
      isDestroyed: () => false,
      send: vi.fn(),
    };
    router.registerController({
      ...clipboardOptions(),
      webContents,
      createSession,
      onSessionStartError() {},
      onSessionExit() {},
    });
    const event = { sender: webContents, senderFrame: webContents.mainFrame };
    const configuration = ipc.handlers.get(terminalIpc.configuration)!(
      event,
    ) as { fontConfigurationId: string };
    return { event, id: configuration.fontConfigurationId };
  };
  const first = register();
  const second = register();
  const retain = ipc.handlers.get(terminalIpc.retainSurface)!;
  const start = ipc.handlers.get(terminalIpc.start)!;
  const release = ipc.listeners.get(terminalIpc.releaseSurface)!;
  const observed = ipc.listeners.get(terminalIpc.configurationObserved)!;
  expect(first.id).not.toBe(second.id);
  for (const invalid of [
    undefined,
    {},
    { fontLineHeight: 1 },
    second.id,
    "unknown",
  ])
    expect(() => retain(first.event, invalid)).toThrow();
  expect(() => retain({ ...first.event, senderFrame: {} }, first.id)).toThrow();
  expect(() =>
    retain(
      {
        sender: { ...first.event.sender },
        senderFrame: first.event.senderFrame,
      },
      first.id,
    ),
  ).toThrow();
  const pending = retain(first.event, first.id);
  router.applyConfiguration({
    ...clipboardOptions().configuration,
    fontLineHeight: 1.5,
  });
  const latest = ipc.handlers.get(terminalIpc.configuration)!(first.event) as {
    fontConfigurationId: string;
  };
  expect(latest.fontConfigurationId).not.toBe(first.id);
  // An old capture can arrive before acknowledgement of the newer delivery.
  const earlierCapture = retain(first.event, first.id);
  observed(first.event, latest.fontConfigurationId);
  expect(() => retain(first.event, first.id)).toThrow();
  expect(() => start(second.event, pending)).toThrow();
  release(second.event, pending);
  release({ ...first.event, senderFrame: {} }, pending);
  expect(router.activeTerminalSurfaceFontConfigurations()).toEqual([
    { fontLineHeight: 1 },
    { fontLineHeight: 1 },
  ]);
  expect(start(first.event, pending)).toBe("s1");
  expect(() => start(first.event, pending)).toThrow();
  release(first.event, earlierCapture);
  expect(() => start(first.event, earlierCapture)).toThrow();
  release(first.event, pending);
  expect(router.activeTerminalSurfaceFontConfigurations()).toEqual([]);
  expect(createSession).toHaveBeenCalledOnce();
  router.dispose();
  expect(ipc.handlers.size).toBe(0);
  expect(ipc.listeners.size).toBe(0);
});
