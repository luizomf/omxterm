import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import {
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
    registerTerminalWindowHost(harness.window, controller, onWindowClosed);

    harness.windowEvents.emit("closed");

    expect(controller.dispose).toHaveBeenCalledOnce();
    expect(onWindowClosed).toHaveBeenCalledOnce();
    expect(harness.close).not.toHaveBeenCalled();
  });
});
