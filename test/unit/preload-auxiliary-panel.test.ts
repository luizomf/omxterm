import { expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import { paletteIpc } from "../../src/shared/command-palette";

const electron = vi.hoisted(() => ({
  expose: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
}));
vi.mock("electron", () => ({
  contextBridge: { exposeInMainWorld: electron.expose },
  ipcRenderer: {
    on: electron.on,
    removeListener: electron.removeListener,
    invoke: vi.fn(),
    send: vi.fn(),
  },
  webUtils: {},
}));

it("delivers only payload-free panel actions and authenticates palette envelopes with the captured guard", async () => {
  const events = new EventEmitter();
  electron.on.mockImplementation(events.on.bind(events));
  electron.removeListener.mockImplementation(
    events.removeListener.bind(events),
  );
  await import("../../src/preload/index");
  const bridge = (electron.expose.mock.calls[0]![1] as Window["omxterm"])
    .terminal;
  const listener = vi.fn();
  const initialDispatchListeners = events.listenerCount(paletteIpc.dispatch);
  const remove = bridge.onAuxiliaryPanelToggle(listener);
  for (const payload of [null, false, 0, "", {}, []])
    events.emit(terminalIpc.auxiliaryPanelToggle, {}, payload);
  expect(listener).not.toHaveBeenCalled();
  events.emit(terminalIpc.auxiliaryPanelToggle, {}, undefined);
  expect(listener).toHaveBeenCalledOnce();
  const envelope = (token: string, payload?: unknown) =>
    events.emit(
      paletteIpc.dispatch,
      {},
      { token, channel: terminalIpc.auxiliaryPanelToggle, payload },
    );
  envelope("current");
  bridge.palette!.setDispatchGuard((token) => token === "current");
  envelope("stale");
  envelope("current", {});
  expect(listener).toHaveBeenCalledOnce();
  envelope("current");
  expect(listener).toHaveBeenCalledTimes(2);
  remove();
  events.emit(terminalIpc.auxiliaryPanelToggle, {});
  envelope("current");
  expect(listener).toHaveBeenCalledTimes(2);
  expect(events.listenerCount(terminalIpc.auxiliaryPanelToggle)).toBe(0);
  expect(events.listenerCount(paletteIpc.dispatch)).toBe(
    initialDispatchListeners,
  );
});
