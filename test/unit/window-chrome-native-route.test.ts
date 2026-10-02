import { EventEmitter } from "node:events";
import type { BrowserWindow } from "electron";
import { afterEach, expect, it, vi } from "vitest";
import { registerWindowChrome } from "../../src/main/window-chrome";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import { exerciseCustomControlFocus } from "../fixtures/window-chrome-exercise";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function exercise(mode: string, available = false) {
  vi.useFakeTimers();
  vi.setSystemTime(0);
  vi.stubGlobal("process", { ...process, platform: "linux" });
  const ipc = new EventEmitter();
  let clicks = 0;
  let tailInjected = false;
  function createWindow() {
    let rendererLabel: string | undefined;
    const flags = { visible: true, minimized: false, maximized: false };
    const contents = Object.assign(new EventEmitter(), {
      mainFrame: {},
      isDestroyed: () => false,
      send: vi.fn(),
      executeJavaScript: async (script: string) => {
        if (script.includes("getBoundingClientRect")) return { x: 1, y: 1 };
        await Promise.resolve();
        if (script.includes("document.activeElement")) {
          if (clicks === 2 && !tailInjected && mode.startsWith("focus-tail")) {
            tailInjected = true;
            if (mode === "focus-tail-restore") window.unmaximize();
            if (mode === "focus-tail-foreign-minimize") peer.window.minimize();
            if (mode === "focus-tail-maximize") flags.maximized = true;
            if (mode === "focus-tail-wrong-label") rendererLabel = "Restore";
          }
          if (script.includes("labelPresent"))
            return {
              focused: true,
              labelPresent: script.includes(
                `[aria-label="${rendererLabel ?? (flags.maximized ? "Restore" : "Maximize")}"]`,
              ),
            };
          return true;
        }
        if (clicks === 2 && !tailInjected && mode.startsWith("label-tail")) {
          tailInjected = true;
          if (mode === "label-tail-foreign-restore") peer.window.restore();
          if (mode === "label-tail-maximize") flags.maximized = true;
        }
        return script.includes(
          `[aria-label="${rendererLabel ?? (flags.maximized ? "Restore" : "Maximize")}"]`,
        );
      },
      sendInputEvent: (_event: { type: string }) => {},
    });
    const window = Object.assign(new EventEmitter(), {
      webContents: contents,
      focus() {},
      isDestroyed: () => false,
      isVisible: () => flags.visible,
      isMinimized: () => flags.minimized,
      isMaximized: () => flags.maximized,
      isFullScreen: () => false,
      isFocused: () => true,
      getContentBounds: () => ({ x: 0, y: 0, width: 900, height: 600 }),
      setWindowButtonVisibility() {},
      minimize() {
        if (available) flags.minimized = true;
      },
      restore() {
        flags.minimized = false;
      },
      hide() {
        flags.visible = false;
      },
      show() {
        flags.visible = true;
      },
      maximize() {
        if (available) flags.maximized = true;
      },
      unmaximize() {
        flags.maximized = false;
      },
      close() {},
    });
    const chrome = registerWindowChrome(window, ipc, {
      platform: "linux",
      showTitleBar: true,
      cursor: () => ({ x: -1, y: -1 }),
      popupApplicationMenu: () => undefined,
    });
    return { window, flags, chrome };
  }
  const target = createWindow(),
    peer = createWindow();
  const deliver = (owner = target.window) =>
    ipc.emit(
      terminalIpc.windowChromeCommand,
      { sender: owner.webContents, senderFrame: owner.webContents.mainFrame },
      "maximize",
    );
  target.window.webContents.sendInputEvent = (event) => {
    if (event.type !== "mouseUp") return;
    clicks += 1;
    if (mode === "drop") return;
    if (mode === "wrong-owner") {
      deliver(peer.window);
      return;
    }
    deliver();
    if (mode === "duplicate") deliver();
    if (mode === "late-duplicate") setTimeout(() => deliver(), 1000);
    if (mode === "hidden") target.flags.visible = false;
    if (mode === "minimized") target.flags.minimized = true;
    if (mode === "foreign-minimize") peer.window.minimize();
    if (mode === "extra-minimize") target.window.minimize();
    if (mode === "end-boundary-maximize" && clicks === 2)
      setTimeout(() => {
        target.flags.maximized = true;
      }, 25000);
  };
  let failure: unknown;
  const done = exerciseCustomControlFocus(
    target.window as unknown as BrowserWindow,
    available ? "native-maximize-observed" : "native-maximize-not-observed",
    peer.window as unknown as BrowserWindow,
  ).catch((error: unknown) => {
    failure = error;
  });
  await vi.runAllTimersAsync();
  await done;
  target.chrome.dispose();
  peer.chrome.dispose();
  return failure;
}
it("retains actual maximize/restore when native transitions are available", async () => {
  expect(await exercise("ordinary", true)).toBeUndefined();
});
it("rejects a duplicate which maximizes then restores on a capable native window", async () => {
  expect(await exercise("duplicate", true)).toMatchObject({
    message: expect.stringContaining(
      "Custom control duplicated native invocation",
    ) as unknown,
  });
});
it.each([
  ["focus-tail-restore", "Custom control duplicated native invocation"],
  ["label-tail-foreign-restore", "Custom control invoked wrong native owner"],
])(
  "rejects %s during existing renderer/focus awaits on a capable window",
  async (mode, message) => {
    expect(await exercise(mode, true)).toMatchObject({
      message: expect.stringContaining(message) as unknown,
    });
  },
);
it("keeps actual routing, healthy presentation and both complete 25-second unavailable intervals", async () => {
  expect(await exercise("ordinary")).toBeUndefined();
  expect(Date.now()).toBe(50_000);
});
it.each([
  ["foreign-minimize", "Custom control invoked wrong native owner"],
  ["extra-minimize", "Custom control duplicated native invocation"],
  ["focus-tail-foreign-minimize", "Custom control invoked wrong native owner"],
  ["end-boundary-maximize", "Custom control final native state"],
  ["focus-tail-maximize", "Custom control final native state"],
  ["focus-tail-wrong-label", "final renderer label"],
  ["label-tail-maximize", "Custom control final native state"],
  ["drop", "custom control invokes intended native action"],
  ["wrong-owner", "Custom control invoked wrong native owner"],
  ["duplicate", "Custom control duplicated native invocation"],
  ["late-duplicate", "Custom control duplicated native invocation"],
  ["hidden", "Custom control target must remain presented"],
  ["minimized", "Custom control target must remain presented"],
])(
  "rejects %s despite unchanged native maximize state",
  async (mode, message) => {
    expect(await exercise(mode)).toMatchObject({
      message: expect.stringContaining(message) as unknown,
    });
  },
);
