import { EventEmitter } from "node:events";
import type { BrowserWindow } from "electron";
import { expect, it, vi } from "vitest";
import { registerTerminalLayoutIpc } from "../../src/main/terminal-layout-ipc";
import { layoutIpc } from "../../src/shared/terminal-layout";
import type { TerminalIpcController } from "../../src/main/terminal-ipc-types";
import { createIpcHarness } from "../fixtures/terminal-ipc-harness";
const token = "00000000-0000-0000-0000-000000000001";
const layout = {
  selected: 0,
  omitted: 1,
  tabs: [{ root: 0, focused: 0, panes: ["s1"], nodes: [{ pane: 0 }] }],
};
function setup() {
  const ipc = createIpcHarness();
  const contents = Object.assign(new EventEmitter(), {
    mainFrame: {},
    isDestroyed: () => false,
    send: vi.fn(),
  });
  const window = Object.assign(new EventEmitter(), {
    webContents: contents,
  }) as unknown as BrowserWindow;
  const event = { sender: contents, senderFrame: contents.mainFrame };
  let quitting = false;
  const service = registerTerminalLayoutIpc({
    ipc: ipc.ipcMain,
    platform: "linux",
    quitting: () => quitting,
    trusted: (value) => value.senderFrame === value.sender.mainFrame,
  });
  const directory = vi.fn(() => ({
    kind: "launch-local" as const,
    path: "/synthetic",
  }));
  const controller = {
    layoutDirectory: directory,
  } as unknown as TerminalIpcController;
  service.register(window, controller, {
    initial: {
      selected: 0,
      fallbacks: 0,
      tabs: [{ ...layout.tabs[0]!, panes: [token] }],
    },
    directories: new Map([[token, "/synthetic"]]),
  });
  return {
    ipc,
    window,
    contents,
    event,
    service,
    directory,
    quit() {
      quitting = true;
    },
  };
}
it("binds initial plan and single-use/cancellable allocations to the actual window", () => {
  const test = setup();
  expect(test.service.constructing()).toBe(true);
  expect(test.service.initial(test.window)).toMatchObject({ selected: 0 });
  expect(() => test.service.initial(test.window)).toThrow();
  expect(() =>
    test.service.consume({ webContents: {} } as BrowserWindow, token),
  ).toThrow();
  expect(test.service.consume(test.window, token)).toBe("/synthetic");
  expect(() => test.service.consume(test.window, token)).toThrow();
  expect(test.service.constructing()).toBe(false);
  test.service.dispose();
});
it.each(["closed", "destroyed"] as const)(
  "retires layout ownership after %s without accessing a destroyed native window",
  async (first) => {
    const test = setup();
    const pending = test.service.capture(
      test.window,
      new AbortController().signal,
    );
    const rejected = expect(pending).rejects.toThrow(
      "Layout capture unavailable",
    );
    const nativeGetter = vi.fn(() => {
      throw new Error("Object has been destroyed");
    });
    Object.defineProperty(test.window, "webContents", { get: nativeGetter });
    const close = () => test.window.emit("closed");
    const destroy = () => test.contents.emit("destroyed");
    expect(first === "closed" ? close : destroy).not.toThrow();
    await rejected;
    expect(test.service.constructing()).toBe(false);
    expect(first === "closed" ? destroy : close).not.toThrow();
    expect(() => test.service.dispose()).not.toThrow();
    expect(nativeGetter).not.toHaveBeenCalled();
  },
);
it("keeps initial navigation local and removes subscriptions on post-read navigation", () => {
  const test = setup();
  test.contents.emit("did-start-navigation", {}, "app", false, true);
  expect(test.service.constructing()).toBe(true);
  expect(test.service.initial(test.window)).toMatchObject({ selected: 0 });
  test.contents.emit("did-start-navigation", {}, "app#same", true, true);
  test.contents.emit("did-start-navigation", {}, "child", false, false);
  expect(test.service.constructing()).toBe(true);
  test.contents.emit("did-start-navigation", {}, "reload", false, true);
  expect(test.service.constructing()).toBe(false);
  expect(() => test.service.consume(test.window, token)).toThrow();
  expect(test.contents.listenerCount("did-start-navigation")).toBe(0);
  expect(test.contents.listenerCount("destroyed")).toBe(0);
  expect(test.contents.listenerCount("render-process-gone")).toBe(0);
  expect(test.window.listenerCount("closed")).toBe(0);
  test.service.dispose();
});
it("explicit layout disposal rejects capture and removes all owner subscriptions", async () => {
  const test = setup();
  const pending = test.service.capture(
    test.window,
    new AbortController().signal,
  );
  const rejected = expect(pending).rejects.toThrow(
    "Layout capture unavailable",
  );
  test.service.dispose();
  test.service.dispose();
  await rejected;
  expect(test.service.constructing()).toBe(false);
  expect(test.contents.listenerCount("did-start-navigation")).toBe(0);
  expect(test.contents.listenerCount("destroyed")).toBe(0);
  expect(test.contents.listenerCount("render-process-gone")).toBe(0);
  expect(test.window.listenerCount("closed")).toBe(0);
});
it("captures only matching sender/request and enriches the renderer clone in main", async () => {
  const test = setup();
  const pending = test.service.capture(
    test.window,
    new AbortController().signal,
  );
  const id: unknown = test.contents.send.mock.calls[0]![1];
  test.ipc.listeners.get(layoutIpc.captured)!(
    { ...test.event, senderFrame: {} },
    { id, layout },
  );
  expect(test.directory).not.toHaveBeenCalled();
  test.ipc.listeners.get(layoutIpc.captured)!(test.event, {
    id: "wrong",
    layout,
  });
  expect(test.directory).not.toHaveBeenCalled();
  test.ipc.listeners.get(layoutIpc.captured)!(test.event, { id, layout });
  expect(await pending).toMatchObject({
    version: 1,
    platform: "linux",
    omitted: 1,
    tabs: [{ panes: [{ kind: "launch-local", path: "/synthetic" }] }],
  });
  expect(test.directory).toHaveBeenCalledWith("s1");
  test.service.dispose();
});
it.each(["abort", "loss", "quit"])(
  "retires capture/allocations on %s",
  async (mode) => {
    const test = setup();
    const abort = new AbortController();
    const pending = test.service.capture(test.window, abort.signal);
    const rejected = expect(pending).rejects.toThrow();
    if (mode === "abort") {
      abort.abort();
      test.ipc.listeners.get(layoutIpc.cancel)!(test.event, token);
    } else if (mode === "loss") test.contents.emit("render-process-gone");
    else {
      test.quit();
      test.service.dispose();
    }
    await rejected;
    expect(() => test.service.consume(test.window, token)).toThrow();
    test.service.dispose();
  },
);
