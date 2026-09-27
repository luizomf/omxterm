import { EventEmitter } from "node:events";
import { expect, it, vi } from "vitest";
import {
  createWindowBackgroundEffects,
  createWindowBackgroundEffectsOwner,
} from "../../src/main/window-background-effects";
import { DEFAULT_USER_CONFIGURATION } from "../../src/main/user-configuration";

function configuration(blur = false, transparency = 0, background = "#123456") {
  return {
    blur,
    transparency,
    terminalTheme: {
      ...DEFAULT_USER_CONFIGURATION.terminalTheme,
      colors: {
        ...DEFAULT_USER_CONFIGURATION.terminalTheme.colors,
        background,
      },
    },
  };
}
function nativeWindow() {
  const handle = Buffer.alloc(8);
  handle.writeUInt32LE(0x123456);
  return Object.assign(new EventEmitter(), {
    show: vi.fn(),
    isVisible: vi.fn(() => true),
    isDestroyed: vi.fn(() => false),
    getNativeWindowHandle: vi.fn(() => handle),
    setVibrancy: vi.fn(),
    setBackgroundMaterial: vi.fn(),
    setBackgroundColor: vi.fn(),
  });
}

it("prefers direct macOS blur only after show, keeping configured transparency and reversing on disable", () => {
  const window = nativeWindow();
  window.isVisible.mockReturnValue(false);
  const native = { setBlur: vi.fn(() => 0) };
  const loadMacBlur = vi.fn(() => native);
  const effects = createWindowBackgroundEffects(window, {
    platform: "darwin",
    loadMacBlur,
  });
  effects.apply(configuration());
  effects.apply(configuration(true, 0));
  effects.apply(configuration(false, 1));
  expect(loadMacBlur).not.toHaveBeenCalled();
  effects.apply(configuration(true, 0.15));
  expect(effects.transparency()).toBe(0.15);
  expect(native.setBlur).not.toHaveBeenCalled();
  window.isVisible.mockReturnValue(true);
  effects.show();
  expect(window.show).toHaveBeenCalledOnce();
  expect(window.show.mock.invocationCallOrder[0]).toBeLessThan(
    native.setBlur.mock.invocationCallOrder[0]!,
  );
  expect(native.setBlur).toHaveBeenCalledExactlyOnceWith(
    window.getNativeWindowHandle(),
    true,
  );
  expect(window.setVibrancy.mock.calls).toEqual([[null]]);
  effects.apply(configuration(true, 0.75));
  expect(native.setBlur).toHaveBeenCalledOnce();
  effects.apply(configuration(true, 0));
  expect(native.setBlur.mock.calls).toEqual([
    [window.getNativeWindowHandle(), true],
    [window.getNativeWindowHandle(), false],
  ]);
  effects.dispose();
  window.emit("show");
  effects.apply(configuration(true, 1));
  expect(native.setBlur).toHaveBeenCalledTimes(2);
});

it("cleans a failed direct apply before HUD fallback and retries only on explicit reload", () => {
  const window = nativeWindow();
  const events: string[] = [];
  window.setVibrancy.mockImplementation((material: unknown) => {
    events.push(`material:${String(material)}`);
  });
  const native = {
    setBlur: vi.fn((_handle: Buffer, enabled: boolean) => {
      events.push(`direct:${enabled}`);
      return enabled ? 5 : 0;
    }),
  };
  const effects = createWindowBackgroundEffects(window, {
    platform: "darwin",
    loadMacBlur: () => native,
  });
  effects.apply(configuration(true, 0.15));
  expect(events).toEqual([
    "material:null",
    "direct:true",
    "direct:false",
    "material:hud",
  ]);
  expect(effects.transparency()).toBe(0.15);
  native.setBlur.mockImplementation((_handle, enabled) => {
    events.push(`direct:${enabled}`);
    return 0;
  });
  effects.apply(configuration(true, 0.15));
  expect(events.slice(4)).toEqual(["material:null", "direct:true"]);
  effects.dispose();
  expect(events.slice(-2)).toEqual(["direct:false", "material:null"]);
});

it("reapplies direct blur on show/restore and removes all hooks at the native lifetime boundary", () => {
  const window = nativeWindow();
  const native = { setBlur: vi.fn(() => 0) };
  const effects = createWindowBackgroundEffects(window, {
    platform: "darwin",
    loadMacBlur: () => native,
  });
  effects.apply(configuration(true, 0.15));
  for (const event of ["show", "restore"]) {
    native.setBlur.mockClear();
    if (event === "show") effects.show();
    else window.emit(event);
    expect(native.setBlur.mock.calls).toEqual([
      [window.getNativeWindowHandle(), false],
      [window.getNativeWindowHandle(), true],
    ]);
  }
  native.setBlur.mockClear();
  window.isDestroyed.mockReturnValue(true);
  window.emit("closed");
  effects.dispose();
  effects.apply(configuration(true, 1));
  window.emit("show");
  window.emit("restore");
  expect(native.setBlur).not.toHaveBeenCalled();
  expect(window.eventNames()).toEqual([]);
});

it("keeps native ownership independent across reloads, hidden and future windows", () => {
  const native = { setBlur: vi.fn(() => 0) };
  const owner = createWindowBackgroundEffectsOwner("darwin", "", {
    loadMacBlur: () => native,
  });
  const first = nativeWindow();
  const second = nativeWindow();
  second.getNativeWindowHandle.mockReturnValue(Buffer.alloc(8, 2));
  second.isVisible.mockReturnValue(false);
  const firstTransparency = owner.register(first, configuration(true, 0.15));
  owner.register(second, configuration(true, 0.15));
  expect(native.setBlur).toHaveBeenCalledExactlyOnceWith(
    first.getNativeWindowHandle(),
    true,
  );
  owner.apply(configuration(false, 0.35));
  second.isVisible.mockReturnValue(true);
  owner.show(second);
  expect(native.setBlur).toHaveBeenCalledTimes(2);
  expect(firstTransparency()).toBe(0.35);
  owner.apply(configuration(true, 0.85));
  expect(native.setBlur).toHaveBeenLastCalledWith(
    second.getNativeWindowHandle(),
    true,
  );
  first.isDestroyed.mockReturnValue(true);
  first.emit("closed");
  native.setBlur.mockClear();
  owner.apply(configuration());
  expect(native.setBlur).toHaveBeenCalledExactlyOnceWith(
    second.getNativeWindowHandle(),
    false,
  );
  const future = nativeWindow();
  future.getNativeWindowHandle.mockReturnValue(Buffer.alloc(8, 3));
  owner.register(future, configuration(true, 1));
  expect(native.setBlur).toHaveBeenLastCalledWith(
    future.getNativeWindowHandle(),
    true,
  );
});

it.each(["missing", "load-throws", "symbols", "throws", "nonzero"])(
  "uses HUD for macOS %s without changing the configuration contract",
  (failure) => {
    const window = nativeWindow();
    const native = {
      setBlur: vi.fn((_handle: Buffer, enabled: boolean): number | null => {
        if (!enabled) return 0;
        if (failure === "throws") throw new Error("native exception");
        return failure === "symbols" ? null : 7;
      }),
    };
    const effects = createWindowBackgroundEffects(window, {
      platform: "darwin",
      loadMacBlur: () => {
        if (failure === "load-throws") throw new Error("load failed");
        return failure === "missing" ? undefined : native;
      },
    });
    effects.apply(configuration(true, 0.15));
    expect(window.setVibrancy).toHaveBeenLastCalledWith("hud");
    expect(effects.transparency()).toBe(0.15);
    expect(native.setBlur.mock.calls.map((call) => call[1])).toEqual(
      ["missing", "load-throws"].includes(failure)
        ? []
        : failure === "symbols"
          ? [true]
          : [true, false],
    );
    effects.apply(configuration(false, 1));
    expect(window.setVibrancy).toHaveBeenLastCalledWith(null);
    effects.dispose();
    expect(window.eventNames()).toEqual([]);
  },
);

it("does not stack HUD onto uncertain cleanup and clears before a later retry", () => {
  const window = nativeWindow();
  const native = { setBlur: vi.fn(() => 5) };
  const effects = createWindowBackgroundEffects(window, {
    platform: "darwin",
    loadMacBlur: () => native,
  });
  effects.apply(configuration(true, 0.15));
  expect(native.setBlur.mock.calls).toHaveLength(2);
  expect(window.setVibrancy).not.toHaveBeenCalledWith("hud");
  native.setBlur.mockClear();
  effects.apply(configuration(true, 0.15));
  expect(native.setBlur).toHaveBeenCalledExactlyOnceWith(
    window.getNativeWindowHandle(),
    false,
  );
  native.setBlur.mockReturnValue(0);
  window.emit("restore");
  expect(native.setBlur.mock.calls.slice(-2)).toEqual([
    [window.getNativeWindowHandle(), false],
    [window.getNativeWindowHandle(), true],
  ]);
  native.setBlur.mockImplementationOnce(() => {
    throw new Error("reset failed");
  });
  effects.apply(configuration(false, 1));
  expect(window.setVibrancy).toHaveBeenLastCalledWith(null);
  effects.apply(configuration(false, 1));
  expect(native.setBlur).toHaveBeenLastCalledWith(
    window.getNativeWindowHandle(),
    false,
  );
  effects.dispose();
  const calls = native.setBlur.mock.calls.length;
  effects.dispose();
  window.emit("show");
  expect(native.setBlur).toHaveBeenCalledTimes(calls);
});

it("keeps a throwing HUD fallback optional and never calls the addon off macOS", () => {
  const window = nativeWindow();
  window.setVibrancy.mockImplementation(() => {
    throw new Error("HUD unavailable");
  });
  const loadMacBlur = vi.fn(() => undefined);
  const mac = createWindowBackgroundEffects(window, {
    platform: "darwin",
    loadMacBlur,
  });
  expect(() => mac.apply(configuration(true, 1))).not.toThrow();
  expect(() => mac.dispose()).not.toThrow();
  loadMacBlur.mockClear();
  for (const platform of ["win32", "linux"]) {
    const effects = createWindowBackgroundEffects(nativeWindow(), {
      platform,
      loadMacBlur,
    });
    effects.apply(configuration(true, 1));
    effects.dispose();
  }
  expect(loadMacBlur).not.toHaveBeenCalled();
});

it.each(["darwin", "win32"])(
  "requests and reverses only the native %s material, preserving the window",
  (platform) => {
    const window = nativeWindow();
    const effects = createWindowBackgroundEffects(window, {
      platform,
      windowsVersion: "10.0.26200",
    });
    effects.apply(configuration());
    effects.apply(configuration(true, 0.5));
    effects.apply(configuration(true, 1));
    effects.apply(configuration(true, 0));
    const calls =
      platform === "darwin"
        ? window.setVibrancy.mock.calls
        : window.setBackgroundMaterial.mock.calls;
    expect(calls).toEqual(
      platform === "darwin" ? [["hud"], [null]] : [["acrylic"], ["none"]],
    );
    expect(window.getNativeWindowHandle).not.toHaveBeenCalled();
    if (platform === "darwin")
      expect(window.setBackgroundColor).not.toHaveBeenCalled();
    effects.dispose();
    effects.apply(configuration(true, 1));
    expect(calls).toHaveLength(2);
  },
);

it("keeps Windows startup, plain transparency and live theme changes coherently opaque without rewriting the request", () => {
  const window = nativeWindow();
  const effects = createWindowBackgroundEffects(window, {
    platform: "win32",
    windowsVersion: "10.0.26200",
  });
  const requested = Object.freeze(configuration(false, 1));
  effects.apply(configuration());
  effects.apply(requested);
  expect(effects.transparency()).toBe(0);
  expect(window.setBackgroundMaterial).not.toHaveBeenCalled();
  expect(window.setBackgroundColor).toHaveBeenLastCalledWith("#123456");
  effects.apply(configuration(false, 0.5, "#abcdef"));
  expect(window.setBackgroundColor).toHaveBeenLastCalledWith("#abcdef");
  expect(requested.transparency).toBe(1);
  effects.apply(configuration(true, 0.5));
  expect(window.setBackgroundColor).toHaveBeenLastCalledWith("#00000000");
  expect(effects.transparency()).toBe(0.5);
  effects.apply(configuration(false, 0.5, "#654321"));
  expect(effects.transparency()).toBe(0);
  expect(window.setBackgroundMaterial).toHaveBeenLastCalledWith("none");
  expect(window.setBackgroundColor).toHaveBeenLastCalledWith("#654321");
});

it.each(["10.0.19045", "10.0.22000", "unknown"])(
  "keeps an opaque theme on Windows %s without invoking an unsupported material API",
  (windowsVersion) => {
    const window = nativeWindow();
    const effects = createWindowBackgroundEffects(window, {
      platform: "win32",
      windowsVersion,
    });
    effects.apply(configuration(true, 1));
    effects.apply(configuration(true, 0.5, "#abcdef"));
    expect(window.setBackgroundMaterial).not.toHaveBeenCalled();
    expect(window.setBackgroundColor).toHaveBeenLastCalledWith("#abcdef");
  },
);

it("falls back after Windows material failures and retries only on a later apply, including failed removal", () => {
  const window = nativeWindow();
  window.setBackgroundMaterial.mockImplementationOnce(() => {
    throw new Error("unavailable");
  });
  const effects = createWindowBackgroundEffects(window, {
    platform: "win32",
    windowsVersion: "10.0.22621",
  });
  effects.apply(configuration(true, 1));
  expect(effects.transparency()).toBe(0);
  expect(window.setBackgroundColor).toHaveBeenLastCalledWith("#123456");
  effects.apply(configuration(true, 1));
  expect(effects.transparency()).toBe(1);
  expect(window.setBackgroundColor).toHaveBeenLastCalledWith("#00000000");
  window.setBackgroundMaterial.mockImplementationOnce(() => {
    throw new Error("removal failed");
  });
  effects.apply(configuration(false, 0.5, "#abcdef"));
  expect(window.setBackgroundColor).toHaveBeenLastCalledWith("#abcdef");
  effects.apply(configuration(false, 0.5));
  expect(window.setBackgroundMaterial.mock.calls).toEqual([
    ["acrylic"],
    ["acrylic"],
    ["none"],
    ["none"],
  ]);
});

it("applies commits to independent live windows and current snapshots to future windows, retiring closed owners", () => {
  const owner = createWindowBackgroundEffectsOwner("darwin", "");
  const first = Object.assign(new EventEmitter(), nativeWindow());
  const second = Object.assign(new EventEmitter(), nativeWindow());
  owner.register(first, configuration());
  owner.register(second, configuration());
  owner.apply(configuration(true, 0.5));
  expect(first.setVibrancy).toHaveBeenCalledExactlyOnceWith("hud");
  expect(second.setVibrancy).toHaveBeenCalledExactlyOnceWith("hud");
  first.isDestroyed.mockReturnValue(true);
  first.emit("closed");
  owner.apply(configuration(false, 1));
  expect(first.setVibrancy).toHaveBeenCalledOnce();
  expect(second.setVibrancy).toHaveBeenLastCalledWith(null);
  const future = Object.assign(new EventEmitter(), nativeWindow());
  owner.register(future, configuration(true, 1));
  expect(future.setVibrancy).toHaveBeenCalledExactlyOnceWith("hud");
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
  effects.apply(configuration(true, 0.5));
  expect(runXprop).toHaveBeenCalledOnce();
  effects.apply(configuration(true, 0.5));
  expect(runXprop).toHaveBeenCalledTimes(2);
  effects.apply(configuration(true, 0.75));
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
  effects.apply(configuration());
  effects.apply(configuration(true, 0));
  effects.apply(configuration(false, 1));
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
  effects.apply(configuration(true, 0.5));
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
  effects.apply(configuration(true, 1));
  expect(runXprop).toHaveBeenCalledTimes(2);
});

it("retires even a possibly partially applied hint after a failed enable", () => {
  const runXprop = vi.fn().mockImplementationOnce(() => {
    throw new Error("timeout after mutation");
  });
  const effects = createWindowBackgroundEffects(nativeWindow(), {
    platform: "linux",
    x11: true,
    runXprop,
  });
  effects.apply(configuration(true, 0.5));
  effects.dispose();
  expect(runXprop.mock.calls[1]?.[1]).toEqual([
    "-id",
    "0x123456",
    "-remove",
    "_KDE_NET_WM_BLUR_BEHIND_REGION",
  ]);
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
      windowsVersion: "10.0.26200",
    });
    expect(() => effects.apply(configuration(true, 1))).not.toThrow();
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
  }).apply(configuration(true, 1));
  createWindowBackgroundEffects(nativeWindow(), {
    platform: "linux",
    x11: false,
    runXprop,
  }).apply(configuration(true, 1));
  expect(runXprop).not.toHaveBeenCalled();
});
