import { describe, expect, it, vi } from "vitest";
import { createNativeTerminalWindowTitleController } from "../../src/main/terminal-window-attention";

function createHarness(platform: string, dock = createDock()) {
  const listeners = new Set<() => void>();
  const window = {
    isFocused: vi.fn(() => false),
    isDestroyed: vi.fn(() => false),
    flashFrame: vi.fn(),
    setTitle: vi.fn(),
    on: (_event: "focus", listener: () => void) => listeners.add(listener),
    removeListener: (_event: "focus", listener: () => void) =>
      listeners.delete(listener),
  };
  const controller = createNativeTerminalWindowTitleController(
    window,
    {
      fallbackSessionTitle: "shell",
      sendSessionTitle: vi.fn(),
    },
    dock,
    platform,
  );
  controller.sessionStarted("session");
  controller.selectSession("session");
  return {
    window,
    dock,
    controller,
    focus() {
      window.isFocused.mockReturnValue(true);
      for (const listener of listeners) listener();
    },
  };
}

function createDock() {
  return { bounce: vi.fn(() => 0), cancelBounce: vi.fn() };
}

describe.each(["darwin", "linux", "win32"])(
  "native attention binding on %s",
  (platform) => {
    it("requests attention once per unfocused window and cancels on focus", () => {
      const { controller, window, dock, focus } = createHarness(platform);
      controller.ringBell("session");
      controller.ringBell("session");
      expect(window.setTitle).toHaveBeenLastCalledWith("🔔 shell");
      if (platform === "darwin") {
        expect(dock.bounce.mock.calls).toEqual([["informational"]]);
        expect(window.flashFrame).not.toHaveBeenCalled();
      } else {
        expect(window.flashFrame.mock.calls).toEqual([[true]]);
        expect(dock.bounce).not.toHaveBeenCalled();
      }
      focus();
      focus();
      expect(window.setTitle).toHaveBeenLastCalledWith("shell");
      if (platform === "darwin") {
        expect(dock.cancelBounce.mock.calls).toEqual([[0]]);
        expect(window.flashFrame).not.toHaveBeenCalled();
      } else {
        expect(window.flashFrame.mock.calls).toEqual([[true], [false]]);
        expect(dock.cancelBounce).not.toHaveBeenCalled();
      }
    });

    it("cancels on interaction, rearms, and cancels once on disposal", () => {
      const { controller, window, dock } = createHarness(platform);
      controller.ringBell("session");
      controller.resetAttention();
      controller.resetAttention();
      controller.ringBell("session");
      controller.dispose();
      controller.dispose();
      controller.resetAttention();
      controller.ringBell("session");
      if (platform === "darwin") {
        expect(dock.bounce).toHaveBeenCalledTimes(2);
        expect(dock.cancelBounce.mock.calls).toEqual([[0], [0]]);
        expect(window.flashFrame).not.toHaveBeenCalled();
      } else {
        expect(window.flashFrame.mock.calls).toEqual([
          [true],
          [false],
          [true],
          [false],
        ]);
        expect(dock.bounce).not.toHaveBeenCalled();
        expect(dock.cancelBounce).not.toHaveBeenCalled();
      }
    });

    it("does not request native attention for a focused window", () => {
      const { controller, window, dock, focus } = createHarness(platform);
      focus();
      controller.ringBell("session");
      controller.resetAttention();
      controller.dispose();
      expect(window.flashFrame).not.toHaveBeenCalled();
      expect(dock.bounce).not.toHaveBeenCalled();
      expect(dock.cancelBounce).not.toHaveBeenCalled();
    });

    it("isolates each window's native request and cancellation", () => {
      const dock = createDock();
      dock.bounce.mockReturnValueOnce(41).mockReturnValueOnce(42);
      const first = createHarness(platform, dock);
      const second = createHarness(platform, dock);
      first.controller.ringBell("session");
      second.controller.ringBell("session");
      first.controller.dispose();
      if (platform === "darwin") {
        expect(dock.cancelBounce.mock.calls).toEqual([[41]]);
      } else {
        expect(first.window.flashFrame.mock.calls).toEqual([[true], [false]]);
        expect(second.window.flashFrame.mock.calls).toEqual([[true]]);
      }
      second.controller.resetAttention();
      if (platform === "darwin") {
        expect(dock.cancelBounce.mock.calls).toEqual([[41], [42]]);
      } else {
        expect(second.window.flashFrame.mock.calls).toEqual([[true], [false]]);
      }
    });
  },
);

it.each(["linux", "win32"])(
  "avoids calling a destroyed %s window during disposal",
  (platform) => {
    const { controller, window } = createHarness(platform);
    controller.ringBell("session");
    window.isDestroyed.mockReturnValue(true);
    expect(() => controller.dispose()).not.toThrow();
    expect(window.flashFrame.mock.calls).toEqual([[true]]);
  },
);

it("does not cancel an unavailable Dock request", () => {
  const dock = createDock();
  dock.bounce.mockReturnValue(-1);
  const { controller } = createHarness("darwin", dock);
  controller.ringBell("session");
  controller.resetAttention();
  expect(dock.cancelBounce).not.toHaveBeenCalled();
});
