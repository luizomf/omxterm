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
  vi.stubGlobal("process", { ...process, platform: "linux" });
  const ipc = new EventEmitter();
  function createWindow() {
    const flags = { visible: true, minimized: false, maximized: false };
    const contents = Object.assign(new EventEmitter(), {
      mainFrame: {},
      isDestroyed: () => false,
      send: vi.fn(),
      executeJavaScript: async (script: string) =>
        script.includes("getBoundingClientRect") ? { x: 1, y: 1 } : true,
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
        flags.minimized = true;
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
it("keeps actual routing, healthy presentation and both complete 25-second unavailable intervals", async () => {
  expect(await exercise("ordinary")).toBeUndefined();
});
it.each([
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
