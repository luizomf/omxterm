import { describe, expect, it, vi } from "vitest";
import {
  registerTerminalWindowHost,
  type HostedTerminalWindow,
} from "../../src/main/terminal-window-host";

function createEventSource() {
  const listeners = new Map<string, () => void>();
  return {
    once: (event: string, listener: () => void) =>
      void listeners.set(event, listener),
    removeListener: (event: string, listener: () => void) => {
      if (listeners.get(event) === listener) listeners.delete(event);
    },
    emit(event: string) {
      const listener = listeners.get(event);
      listeners.delete(event);
      listener?.();
    },
  };
}

function createWindowHarness() {
  const windowEvents = createEventSource();
  const webContents = createEventSource();
  const close = vi.fn();
  const window: HostedTerminalWindow = {
    once: windowEvents.once,
    removeListener: windowEvents.removeListener,
    webContents,
    isDestroyed: () => false,
    close,
  };
  return { window, windowEvents, webContents, close };
}

describe("main Terminal Window host", () => {
  it.each(["render-process-gone", "destroyed"])(
    "closes and disposes exactly once when WebContents emits %s",
    (event) => {
      const harness = createWindowHarness();
      const controller = { dispose: vi.fn() };
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

  it("disposes on an ordinary closed event without closing again", () => {
    const harness = createWindowHarness();
    const controller = { dispose: vi.fn() };
    const onWindowClosed = vi.fn();
    registerTerminalWindowHost(harness.window, controller, onWindowClosed);

    harness.windowEvents.emit("closed");

    expect(controller.dispose).toHaveBeenCalledOnce();
    expect(onWindowClosed).toHaveBeenCalledOnce();
    expect(harness.close).not.toHaveBeenCalled();
  });
});
