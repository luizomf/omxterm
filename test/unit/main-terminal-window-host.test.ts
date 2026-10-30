import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import type { BrowserWindow } from "electron";
import { extensionInvocationTarget } from "../../src/main/extension-invocation-target";
import {
  guardTerminalWindowClose,
  registerTerminalWindowHost,
  type HostedTerminalWindow,
} from "../../src/main/terminal-window-host";

function createEventSource() {
  const events = new EventEmitter();
  return {
    on: events.on.bind(events),
    once: events.once.bind(events),
    removeListener: events.removeListener.bind(events),
    emit: events.emit.bind(events),
  };
}

function createWindowHarness() {
  const windowEvents = createEventSource();
  const webContents = createEventSource();
  const close = vi.fn();
  let fullScreen = false;
  const window: HostedTerminalWindow = {
    on: windowEvents.on,
    once: windowEvents.once,
    removeListener: windowEvents.removeListener,
    webContents,
    isDestroyed: () => false,
    isFullScreen: () => fullScreen,
    close,
  };
  return {
    window,
    windowEvents,
    webContents,
    close,
    setFullScreen(value: boolean) {
      fullScreen = value;
    },
  };
}

describe("main Terminal Window host", () => {
  it.each(["destroyed", "render-process-gone"])(
    "keeps the busy close guard before synchronous invocation revocation and host close on %s",
    (event) => {
      const contents = new EventEmitter();
      const events = new EventEmitter();
      const order: string[] = [];
      const attempts: ReturnType<typeof vi.fn>[] = [];
      const window = Object.assign(events, {
        webContents: contents,
        isDestroyed: () => false,
        isFullScreen: () => false,
        close() {
          const preventDefault = vi.fn();
          attempts.push(preventDefault);
          events.emit("close", { preventDefault });
          if (!preventDefault.mock.calls.length) {
            order.push("closed");
            events.emit("closed");
          }
        },
      }) as unknown as BrowserWindow;
      const application = {
        mayCloseWindow: vi.fn(() => false),
        requestWindowClose: vi.fn(async () => {}),
      };
      guardTerminalWindowClose(window, application);
      const targets = extensionInvocationTarget(window);
      const target = targets.capture(() => undefined);
      target.signal.addEventListener("abort", () => order.push("revoked"));
      const disposed = vi.fn(() => {
        expect(target.signal.aborted).toBe(true);
        order.push("disposed");
      });
      const closed = vi.fn();
      registerTerminalWindowHost(
        window,
        { applyFullScreen: vi.fn(), dispose: disposed },
        closed,
      );
      window.close();
      expect(attempts[0]).toHaveBeenCalledOnce();
      expect(application.requestWindowClose).toHaveBeenCalledOnce();
      expect(target.signal.aborted).toBe(false);
      expect(disposed).not.toHaveBeenCalled();
      contents.emit(event);
      expect(order).toEqual(["revoked", "disposed", "closed"]);
      expect(attempts[1]).not.toHaveBeenCalled();
      expect(application.requestWindowClose).toHaveBeenCalledOnce();
      expect(disposed).toHaveBeenCalledOnce();
      expect(closed).toHaveBeenCalledOnce();
    },
  );
  it.each(["render-process-gone", "destroyed"])(
    "closes and disposes exactly once when WebContents emits %s",
    (event) => {
      const harness = createWindowHarness();
      const controller = { applyFullScreen: vi.fn(), dispose: vi.fn() };
      const onWindowClosed = vi.fn();
      const host = registerTerminalWindowHost(
        harness.window,
        controller,
        onWindowClosed,
      );

      harness.webContents.emit(event);
      harness.webContents.emit(event);
      harness.windowEvents.emit("closed");
      host.dispose();

      expect(harness.close).toHaveBeenCalledOnce();
      expect(controller.dispose).toHaveBeenCalledOnce();
      expect(onWindowClosed).toHaveBeenCalledOnce();
    },
  );

  it("delivers completed native fullscreen state and removes its listeners", () => {
    const harness = createWindowHarness();
    const controller = { applyFullScreen: vi.fn(), dispose: vi.fn() };
    registerTerminalWindowHost(harness.window, controller, vi.fn());

    harness.setFullScreen(true);
    harness.windowEvents.emit("enter-full-screen");
    harness.setFullScreen(false);
    harness.windowEvents.emit("leave-full-screen");

    expect(controller.applyFullScreen.mock.calls).toEqual([[true], [false]]);
    harness.windowEvents.emit("closed");
    harness.setFullScreen(true);
    harness.windowEvents.emit("enter-full-screen");
    expect(controller.applyFullScreen).toHaveBeenCalledTimes(2);
  });

  it("disposes on an ordinary closed event without closing again", () => {
    const harness = createWindowHarness();
    const controller = { applyFullScreen: vi.fn(), dispose: vi.fn() };
    const onWindowClosed = vi.fn();
    const host = registerTerminalWindowHost(
      harness.window,
      controller,
      onWindowClosed,
    );
    Object.defineProperty(harness.window, "webContents", {
      get() {
        throw new TypeError("Object has been destroyed");
      },
    });
    expect(() => harness.windowEvents.emit("closed")).not.toThrow();
    host.dispose();

    expect(controller.dispose).toHaveBeenCalledOnce();
    expect(onWindowClosed).toHaveBeenCalledOnce();
    expect(harness.close).not.toHaveBeenCalled();
  });
});
