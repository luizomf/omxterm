import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createKeybindCapture } from "../../src/main/keybind-capture";
import {
  deliverKeybindsFromKeyEvents,
  type KeybindKeyboardInput,
} from "../../src/main/keybind-delivery";
import { terminalDefaultKeybinds } from "../../src/shared/terminal-keybinds";

const key = (
  overrides: Partial<KeybindKeyboardInput> = {},
): KeybindKeyboardInput => ({
  type: "keyDown",
  key: "F11",
  code: "F11",
  control: false,
  meta: false,
  alt: false,
  shift: false,
  ...overrides,
});

function recording() {
  const capture = createKeybindCapture("linux");
  const contents = Object.assign(new EventEmitter(), {
    send: vi.fn((_channel: string, _payload: unknown) => {}),
  });
  const invoke = vi.fn();
  deliverKeybindsFromKeyEvents(
    contents,
    () => terminalDefaultKeybinds("linux"),
    invoke,
    "linux",
    capture,
  );
  const press = (input: Partial<KeybindKeyboardInput> = {}) => {
    const preventDefault = vi.fn();
    contents.emit("before-input-event", { preventDefault }, key(input));
    return preventDefault.mock.calls.length > 0;
  };
  capture.set(contents, { captureId: "first", active: true });
  return { capture, contents, invoke, press };
}

afterEach(() => vi.useRealTimers());

describe("shortcut capture gesture ownership", () => {
  it("does not let a retired stop or timeout terminate a replacement recording", () => {
    vi.useFakeTimers();
    const view = recording();
    vi.advanceTimersByTime(20_000);
    view.capture.set(view.contents, { captureId: "replacement", active: true });
    view.capture.set(view.contents, { captureId: "first", active: false });
    vi.advanceTimersByTime(10_000);
    expect(view.contents.send).not.toHaveBeenCalled();
    expect(view.press()).toBe(true);
    expect(view.contents.send).toHaveBeenCalledExactlyOnceWith(
      "settings:captured",
      {
        captureId: "replacement",
        shortcut: { accelerator: "F11" },
      },
    );
    expect(view.invoke).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("preserves owned releases on stop but never steals the next fresh gesture after a missing release", () => {
    const view = recording();
    const invalid = { key: "a", code: "KeyA" };
    expect(view.press(invalid)).toBe(true);
    view.capture.set(view.contents, { captureId: "first", active: false });
    expect(view.press({ ...invalid, isAutoRepeat: true })).toBe(true);
    expect(view.press(invalid)).toBe(false);
    expect(view.press({ ...invalid, type: "keyUp" })).toBe(false);
    expect(view.press()).toBe(true);
    expect(view.invoke).toHaveBeenCalledExactlyOnceWith("toggleFullScreen");
  });

  it.each(["destroyed", "throwing"])(
    "expires safely when the target is %s",
    (failure) => {
      vi.useFakeTimers();
      const view = recording();
      if (failure === "throwing")
        view.contents.send.mockImplementation(() => {
          throw new Error("renderer gone");
        });
      else Object.assign(view.contents, { isDestroyed: () => true });
      expect(() => vi.advanceTimersByTime(30_000)).not.toThrow();
      expect(vi.getTimerCount()).toBe(0);
      expect(view.press()).toBe(true);
      expect(view.invoke).toHaveBeenCalledExactlyOnceWith("toggleFullScreen");
      if (failure === "destroyed")
        expect(view.contents.send).not.toHaveBeenCalled();
    },
  );
  it("bounds missing-release retention without consuming an untracked gesture", () => {
    vi.useFakeTimers();
    const view = recording();
    for (let index = 0; index < 256; index += 1)
      expect(view.press({ key: "a", code: `Synthetic${index}` })).toBe(true);
    expect(view.press({ key: "b", code: "Overflow" })).toBe(false);
    expect(view.contents.send).toHaveBeenLastCalledWith("settings:captured", {
      captureId: "first",
      shortcut: { cancelled: true },
    });
    expect(view.press({ key: "b", code: "Overflow", type: "keyUp" })).toBe(
      false,
    );
    for (let index = 0; index < 256; index += 1)
      expect(
        view.press({ key: "a", code: `Synthetic${index}`, type: "keyUp" }),
      ).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });
  it.each(["blur", "did-start-loading", "render-process-gone", "destroyed"])(
    "clears capture and stale release ownership on %s",
    (event) => {
      vi.useFakeTimers();
      const view = recording();
      expect(view.press({ key: "a", code: "KeyA" })).toBe(true);
      view.contents.emit(event);
      expect(view.press({ key: "a", code: "KeyA", type: "keyUp" })).toBe(false);
      expect(view.press()).toBe(true);
      expect(view.invoke).toHaveBeenCalledExactlyOnceWith("toggleFullScreen");
      expect(vi.getTimerCount()).toBe(0);
    },
  );
  it("notifies expiry at thirty seconds without waiting for another key", () => {
    vi.useFakeTimers();
    const view = recording();
    vi.advanceTimersByTime(29_999);
    expect(view.contents.send).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(view.contents.send).toHaveBeenCalledWith("settings:captured", {
      captureId: "first",
      shortcut: { cancelled: true },
    });
    expect(view.press()).toBe(true);
    expect(view.invoke).toHaveBeenCalledExactlyOnceWith("toggleFullScreen");
    expect(view.press({ type: "keyUp" })).toBe(false);
    expect(vi.getTimerCount()).toBe(0);
  });
  it("records raw-native AltGr Escape instead of treating it as plain cancellation", () => {
    const view = recording();
    const escape = {
      ...key({ key: "Escape", code: "Escape" }),
      _modifiers: 32768,
    };
    expect(view.press(escape)).toBe(true);
    expect(view.contents.send).toHaveBeenCalledWith("settings:captured", {
      captureId: "first",
      shortcut: { accelerator: "AltGr+Escape" },
    });
    expect(view.press({ ...escape, type: "keyUp" })).toBe(true);
  });
  it("owns overlapping invalid and modifier gestures through their releases", () => {
    const view = recording();
    const inputs = [
      key({ key: "Control", code: "ControlLeft", control: true }),
      key({ key: "a", code: "KeyA" }),
      key({ key: "b", code: "KeyB" }),
    ];
    for (const input of inputs) expect(view.press(input)).toBe(true);
    for (const input of inputs) {
      expect(view.press({ ...input, isAutoRepeat: true })).toBe(true);
      expect(view.press({ ...input, type: "keyUp" })).toBe(true);
    }
    expect(view.contents.send.mock.calls.map(([, payload]) => payload)).toEqual(
      [
        { captureId: "first", shortcut: { invalid: true } },
        { captureId: "first", shortcut: { invalid: true } },
      ],
    );
    view.capture.set(view.contents, { captureId: "first", active: false });
    expect(view.invoke).not.toHaveBeenCalled();
  });
  it.each([
    ["fullscreen", key()],
    [
      "quit",
      key({ key: "Q", code: "KeyQ", control: true, alt: true, shift: true }),
    ],
  ])(
    "keeps held %s repeats and release out of normal delivery",
    (_name, input) => {
      const view = recording();
      expect(view.press(input)).toBe(true);
      expect(view.press({ ...input, isAutoRepeat: true })).toBe(true);
      expect(
        view.press({ ...input, isAutoRepeat: true, type: "rawKeyDown" }),
      ).toBe(true);
      expect(view.press({ ...input, type: "keyUp" })).toBe(true);
      expect(view.invoke).not.toHaveBeenCalled();
      expect(view.contents.send).toHaveBeenCalledTimes(1);
      expect(view.press(input)).toBe(true);
      expect(view.invoke).toHaveBeenCalledOnce();
      expect(view.press({ ...input, type: "keyUp" })).toBe(false);
    },
  );
});
