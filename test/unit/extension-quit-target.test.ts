import { EventEmitter } from "node:events";
import type { BrowserWindow } from "electron";
import { afterEach, expect, it, vi } from "vitest";
import { extensionInvocationTarget } from "../../src/main/extension-invocation-target";
import { registerTerminalShutdown } from "../../src/main/terminal-shutdown";
afterEach(() => vi.useRealTimers());
it("captures the original OSC7 source without retargeting and revokes on source or window death", () => {
  const window = Object.assign(new EventEmitter(), {
    webContents: new EventEmitter(),
  }) as unknown as BrowserWindow;
  const targets = extensionInvocationTarget(window);
  targets.started("a");
  targets.started("b");
  targets.selected("a");
  const first = targets.capture((id) => `/${id}`);
  targets.selected("b");
  const second = targets.capture((id) => `/${id}`);
  expect(first.terminalDirectory).toBe("/a");
  expect(second.terminalDirectory).toBe("/b");
  targets.ended("a");
  expect(first.signal.aborted).toBe(true);
  expect(second.signal.aborted).toBe(false);
  expect(targets.capture(() => "/forged", "a").signal.aborted).toBe(true);
  window.emit("closed");
  expect(second.signal.aborted).toBe(true);
});
it("arms invocation navigation only after load, then aborts and removes subscriptions", () => {
  const contents = new EventEmitter();
  const window = Object.assign(new EventEmitter(), {
    webContents: contents,
  }) as unknown as BrowserWindow;
  const targets = extensionInvocationTarget(window);
  const target = targets.capture(() => undefined);
  contents.emit("did-start-navigation", {}, "initial", false, true);
  expect(target.signal.aborted).toBe(false);
  contents.emit("did-finish-load");
  contents.emit("did-start-navigation", {}, "same", true, true);
  contents.emit("did-start-navigation", {}, "child", false, false);
  expect(target.signal.aborted).toBe(false);
  contents.emit("did-start-navigation", {}, "reload", false, true);
  expect(target.signal.aborted).toBe(true);
  expect(targets.capture(() => undefined).signal.aborted).toBe(true);
  expect(contents.listenerCount("did-finish-load")).toBe(0);
  expect(contents.listenerCount("did-start-navigation")).toBe(0);
  expect(contents.listenerCount("destroyed")).toBe(0);
  expect(contents.listenerCount("render-process-gone")).toBe(0);
  expect(window.listenerCount("closed")).toBe(0);
});
it.each([false, true])(
  "cleans invocation load/navigation callbacks on owner loss (loaded=%s)",
  (loaded) => {
    const contents = new EventEmitter();
    const window = Object.assign(new EventEmitter(), {
      webContents: contents,
    }) as unknown as BrowserWindow;
    const targets = extensionInvocationTarget(window);
    const target = targets.capture(() => undefined);
    if (loaded) contents.emit("did-finish-load");
    const getter = vi.fn(() => {
      throw new Error("Object has been destroyed");
    });
    Object.defineProperty(window, "webContents", { get: getter });
    contents.emit("render-process-gone");
    expect(target.signal.aborted).toBe(true);
    expect(contents.listenerCount("did-finish-load")).toBe(0);
    expect(contents.listenerCount("did-start-navigation")).toBe(0);
    expect(contents.listenerCount("destroyed")).toBe(0);
    expect(contents.listenerCount("render-process-gone")).toBe(0);
    expect(window.listenerCount("closed")).toBe(0);
    contents.emit("did-finish-load");
    expect(getter).not.toHaveBeenCalled();
  },
);
it("normal Quit joins extension cleanup once and does not finish on acceptance", async () => {
  const native = Object.assign(new EventEmitter(), { quit: vi.fn() });
  let finish!: (result: boolean) => void;
  const disposeExtensions = vi.fn(
    () =>
      new Promise<boolean>((resolve) => {
        finish = resolve;
      }),
  );
  registerTerminalShutdown(native, {
    application: () => ({
      isQuitting: () => true,
      requestQuit: async () => {},
    }),
    disposeSessions() {},
    disposeExtensions,
  });
  native.emit("before-quit", { preventDefault() {} });
  native.emit("before-quit", { preventDefault() {} });
  await Promise.resolve();
  expect(disposeExtensions).toHaveBeenCalledOnce();
  expect(native.quit).not.toHaveBeenCalled();
  finish(true);
  await vi.waitFor(() => expect(native.quit).toHaveBeenCalledOnce());
});
it("an extension that never settles cannot veto Quit, and late success cannot erase the unknown result", async () => {
  vi.useFakeTimers();
  const native = Object.assign(new EventEmitter(), { quit: vi.fn() });
  const unknown = vi.fn();
  let finish!: (value: boolean) => void;
  registerTerminalShutdown(native, {
    application: () => ({
      isQuitting: () => true,
      requestQuit: async () => {},
    }),
    disposeSessions() {},
    disposeExtensions: () =>
      new Promise<boolean>((resolve) => {
        finish = resolve;
      }),
    onExtensionCleanupUnknown: unknown,
  });
  native.emit("before-quit", { preventDefault() {} });
  await vi.advanceTimersByTimeAsync(15_000);
  expect(unknown).toHaveBeenCalledOnce();
  expect(native.quit).toHaveBeenCalledOnce();
  finish(true);
  await vi.advanceTimersByTimeAsync(1);
  expect(unknown).toHaveBeenCalledOnce();
  expect(native.quit).toHaveBeenCalledOnce();
});
