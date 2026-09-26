import { EventEmitter } from "node:events";
import { expect, it, vi } from "vitest";
import {
  createWindowBackgroundEffects,
  createWindowBackgroundEffectsOwner,
} from "../../src/main/window-background-effects";

function nativeWindow() {
  const handle = Buffer.alloc(8);
  handle.writeUInt32LE(0x123456);
  return {
    isDestroyed: vi.fn(() => false),
    getNativeWindowHandle: vi.fn(() => handle),
    setVibrancy: vi.fn(),
    setBackgroundMaterial: vi.fn(),
  };
}

it.each(["darwin", "win32"])(
  "requests and reverses only the native %s material, preserving the window",
  (platform) => {
    const window = nativeWindow();
    const effects = createWindowBackgroundEffects(window, { platform });
    effects.apply({ blur: false, transparency: 0 });
    effects.apply({ blur: true, transparency: 0.5 });
    effects.apply({ blur: true, transparency: 1 });
    effects.apply({ blur: true, transparency: 0 });
    const calls =
      platform === "darwin"
        ? window.setVibrancy.mock.calls
        : window.setBackgroundMaterial.mock.calls;
    expect(calls).toEqual(
      platform === "darwin"
        ? [["under-window"], [null]]
        : [["acrylic"], ["none"]],
    );
    expect(window.getNativeWindowHandle).not.toHaveBeenCalled();
    effects.dispose();
    effects.apply({ blur: true, transparency: 1 });
    expect(calls).toHaveLength(2);
  },
);

it("applies commits to independent live windows and current snapshots to future windows, retiring closed owners", () => {
  const owner = createWindowBackgroundEffectsOwner("darwin", "");
  const first = Object.assign(new EventEmitter(), nativeWindow());
  const second = Object.assign(new EventEmitter(), nativeWindow());
  owner.register(first, { blur: false, transparency: 0 });
  owner.register(second, { blur: false, transparency: 0 });
  expect(first.setVibrancy).not.toHaveBeenCalled();
  owner.apply({ blur: true, transparency: 0.5 });
  expect(first.setVibrancy).toHaveBeenCalledExactlyOnceWith("under-window");
  expect(second.setVibrancy).toHaveBeenCalledExactlyOnceWith("under-window");
  first.isDestroyed.mockReturnValue(true);
  first.emit("closed");
  owner.apply({ blur: false, transparency: 1 });
  expect(first.setVibrancy).toHaveBeenCalledOnce();
  expect(second.setVibrancy).toHaveBeenLastCalledWith(null);
  const future = Object.assign(new EventEmitter(), nativeWindow());
  owner.register(future, { blur: true, transparency: 1 });
  expect(future.setVibrancy).toHaveBeenCalledExactlyOnceWith("under-window");
});

it("lets a later committed reload retry an unavailable helper without background work", () => {
  const runXprop = vi.fn().mockImplementationOnce(() => {
    throw new Error("unavailable");
  });
  const effects = createWindowBackgroundEffects(nativeWindow(), {
    platform: "linux",
    x11: true,
    runXprop,
  });
  effects.apply({ blur: true, transparency: 0.5 });
  expect(runXprop).toHaveBeenCalledOnce();
  effects.apply({ blur: true, transparency: 0.5 });
  expect(runXprop).toHaveBeenCalledTimes(2);
  effects.apply({ blur: true, transparency: 0.75 });
  expect(runXprop).toHaveBeenCalledTimes(2);
  effects.dispose();
  expect(runXprop).toHaveBeenCalledTimes(3);
});

it("does not invoke an optional helper for opaque defaults or blur disabled", () => {
  const runXprop = vi.fn();
  const effects = createWindowBackgroundEffects(nativeWindow(), {
    platform: "linux",
    x11: true,
    runXprop,
  });
  effects.apply({ blur: false, transparency: 0 });
  effects.apply({ blur: true, transparency: 0 });
  effects.apply({ blur: false, transparency: 1 });
  effects.dispose();
  expect(runXprop).not.toHaveBeenCalled();
});

it("uses a bounded shell-free hint for only the owned XID, removes it and becomes inert on disposal", () => {
  const window = nativeWindow();
  const runXprop = vi.fn();
  const effects = createWindowBackgroundEffects(window, {
    platform: "linux",
    x11: true,
    runXprop,
  });
  effects.apply({ blur: true, transparency: 0.5 });
  expect(runXprop).toHaveBeenCalledExactlyOnceWith(
    "xprop",
    [
      "-id",
      "0x123456",
      "-f",
      "_KDE_NET_WM_BLUR_BEHIND_REGION",
      "32c",
      "-set",
      "_KDE_NET_WM_BLUR_BEHIND_REGION",
      "0",
    ],
    {
      timeout: 500,
      killSignal: "SIGKILL",
      maxBuffer: 1024,
      stdio: "ignore",
      windowsHide: true,
    },
  );
  effects.dispose();
  expect(runXprop.mock.calls[1]?.[1]).toEqual([
    "-id",
    "0x123456",
    "-remove",
    "_KDE_NET_WM_BLUR_BEHIND_REGION",
  ]);
  effects.apply({ blur: true, transparency: 1 });
  expect(runXprop).toHaveBeenCalledTimes(2);
});

it("quietly tolerates unsupported native APIs, absent helpers, invalid handles and destroyed windows", () => {
  for (const platform of ["darwin", "win32", "linux", "unsupported"]) {
    const window = nativeWindow();
    window.setVibrancy.mockImplementation(() => {
      throw new Error("unsupported");
    });
    window.setBackgroundMaterial.mockImplementation(() => {
      throw new Error("unsupported");
    });
    const runXprop = vi.fn(() => {
      throw Object.assign(new Error("missing"), { code: "ENOENT" });
    });
    const effects = createWindowBackgroundEffects(window, {
      platform,
      x11: true,
      runXprop,
    });
    expect(() => effects.apply({ blur: true, transparency: 1 })).not.toThrow();
    window.isDestroyed.mockReturnValue(true);
    const calls = runXprop.mock.calls.length;
    expect(() => effects.dispose()).not.toThrow();
    expect(runXprop).toHaveBeenCalledTimes(calls);
  }
  const runXprop = vi.fn();
  const window = nativeWindow();
  window.getNativeWindowHandle.mockReturnValue(Buffer.alloc(3));
  createWindowBackgroundEffects(window, {
    platform: "linux",
    x11: true,
    runXprop,
  }).apply({ blur: true, transparency: 1 });
  createWindowBackgroundEffects(nativeWindow(), {
    platform: "linux",
    x11: false,
    runXprop,
  }).apply({ blur: true, transparency: 1 });
  expect(runXprop).not.toHaveBeenCalled();
});
