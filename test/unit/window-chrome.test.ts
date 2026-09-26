import { EventEmitter } from "node:events";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerWindowChrome } from "../../src/main/window-chrome";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import type { WindowChromeState } from "../../src/shared/window-chrome";

function setup(
  platform = "darwin",
  showTitleBar = true,
  ipc = new EventEmitter(),
) {
  const webContents = Object.assign(new EventEmitter(), {
    mainFrame: {},
    isDestroyed: () => false,
    send: vi.fn(),
  });
  const flags = {
    fullScreen: false,
    maximized: false,
    minimized: false,
    visible: true,
    focused: true,
    destroyed: false,
  };
  const window = Object.assign(new EventEmitter(), {
    webContents,
    isDestroyed: () => flags.destroyed,
    isFullScreen: () => flags.fullScreen,
    isMaximized: () => flags.maximized,
    isMinimized: () => flags.minimized,
    isVisible: () => flags.visible,
    isFocused: () => flags.focused,
    setWindowButtonVisibility: vi.fn<(visible: boolean) => void>(),
    getContentBounds: () => ({ x: 50, y: 60, width: 800, height: 600 }),
    minimize: vi.fn(),
    maximize: vi.fn(),
    unmaximize: vi.fn(),
    close: vi.fn(),
  });
  let point = { x: 51, y: 61 };
  const cursor = vi.fn(() => point);
  const chrome = registerWindowChrome(window, ipc, {
    platform,
    showTitleBar,
    cursor,
  });
  const command = (
    payload: unknown,
    sender = webContents,
    senderFrame: object | null = sender.mainFrame,
  ) =>
    ipc.emit(terminalIpc.windowChromeCommand, { sender, senderFrame }, payload);
  const state = () => webContents.send.mock.lastCall![1] as WindowChromeState;
  return {
    window,
    webContents,
    flags,
    ipc,
    chrome,
    command,
    state,
    cursor,
    point(value: typeof point) {
      point = value;
    },
  };
}

afterEach(() => vi.useRealTimers());

describe("native Window Chrome ownership", () => {
  it.each(["darwin", "linux", "win32"])(
    "keeps independent defaults and live state without replacing owners on %s",
    (platform) => {
      vi.useFakeTimers();
      const first = setup(platform, false);
      const second = setup(platform, true, first.ipc);
      expect(first.state().titleBarVisible).toBe(false);
      expect(second.state().titleBarVisible).toBe(true);
      first.command("toggle-title-bar");
      expect(first.state().titleBarVisible).toBe(true);
      expect(second.state().titleBarVisible).toBe(true);
      first.chrome.setTitle("accepted title");
      expect(first.state().title).toBe("accepted title");
      expect(second.state().title).toBe("OMXTerm");
      first.command("toggle-title-bar");
      first.chrome.setTitle("next title");
      expect(first.state().titleBarVisible).toBe(false);
      if (platform === "darwin")
        expect(
          first.window.setWindowButtonVisibility.mock.calls.map(
            ([visible]) => visible,
          ),
        ).toEqual([false, true, false]);
      else
        expect(first.window.setWindowButtonVisibility).not.toHaveBeenCalled();
      expect(first.window.close).not.toHaveBeenCalled();
      first.chrome.dispose();
      second.chrome.dispose();
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it("rejects foreign owners, subframes, detached frames and malformed commands", () => {
    const view = setup();
    const foreign = setup("linux", true, view.ipc);
    for (const payload of [
      undefined,
      null,
      true,
      {},
      { action: "close" },
      "destroy",
      "toggle-title-bar\0",
    ])
      view.command(payload);
    view.command("close", foreign.webContents, view.webContents.mainFrame);
    view.command("toggle-title-bar", view.webContents, {});
    view.command("toggle-title-bar", view.webContents, null);
    expect(view.window.close).not.toHaveBeenCalled();
    expect(foreign.window.close).not.toHaveBeenCalled();
    expect(view.state().titleBarVisible).toBe(true);
    view.command("minimize");
    view.command("maximize");
    view.flags.maximized = true;
    view.window.emit("maximize");
    expect(view.state().maximized).toBe(true);
    view.command("maximize");
    view.command("close");
    expect(view.window.minimize).toHaveBeenCalledOnce();
    expect(view.window.maximize).toHaveBeenCalledOnce();
    expect(view.window.unmaximize).toHaveBeenCalledOnce();
    expect(view.window.close).toHaveBeenCalledOnce();
    view.chrome.dispose();
    foreign.chrome.dispose();
  });

  it("samples only while a visible hidden-title window needs the narrow handle; reports changes, not coordinates", () => {
    vi.useFakeTimers();
    const view = setup();
    expect(vi.getTimerCount()).toBe(0);
    view.command("toggle-title-bar");
    expect(vi.getTimerCount()).toBe(1);
    expect(view.state().handleVisible).toBe(true);
    const sent = view.webContents.send.mock.calls.length;
    vi.advanceTimersByTime(500);
    expect(view.webContents.send).toHaveBeenCalledTimes(sent);
    for (const point of [
      { x: 49, y: 60 },
      { x: 850, y: 60 },
      { x: 50, y: 59 },
      { x: 50, y: 210 },
    ]) {
      view.point(point);
      vi.advanceTimersByTime(100);
      expect(view.state().handleVisible).toBe(false);
    }
    // Whole width, not merely the small native drag rectangle.
    for (const point of [
      { x: 50, y: 60 },
      { x: 849, y: 209 },
    ]) {
      view.point(point);
      vi.advanceTimersByTime(100);
      expect(view.state().handleVisible).toBe(true);
    }
    // An inactive but visible window can still be grabbed by its handle.
    view.flags.focused = false;
    view.window.emit("blur");
    vi.advanceTimersByTime(100);
    expect(view.state().handleVisible).toBe(true);
    expect(vi.getTimerCount()).toBe(1);
    view.flags.visible = false;
    view.window.emit("hide");
    expect(vi.getTimerCount()).toBe(0);
    view.flags.visible = true;
    view.window.emit("show");
    view.flags.minimized = true;
    view.window.emit("minimize");
    expect(vi.getTimerCount()).toBe(0);
    view.flags.minimized = false;
    view.window.emit("restore");
    expect(vi.getTimerCount()).toBe(1);
    expect(Object.keys(view.state()).sort()).toEqual([
      "fullScreen",
      "handleVisible",
      "maximized",
      "style",
      "title",
      "titleBarVisible",
    ]);
    view.chrome.dispose();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("suppresses fullscreen and preview chrome without losing the window choice", () => {
    vi.useFakeTimers();
    const view = setup("darwin", false);
    view.flags.fullScreen = true;
    view.window.emit("enter-full-screen");
    expect(view.state()).toMatchObject({
      titleBarVisible: false,
      fullScreen: true,
      handleVisible: false,
    });
    expect(vi.getTimerCount()).toBe(0);
    view.command("maximize");
    expect(view.window.maximize).not.toHaveBeenCalled();
    view.command("toggle-title-bar");
    expect(view.state().titleBarVisible).toBe(true);
    expect(view.window.setWindowButtonVisibility).toHaveBeenLastCalledWith(
      false,
    );
    view.flags.fullScreen = false;
    view.window.emit("leave-full-screen");
    expect(view.window.setWindowButtonVisibility).toHaveBeenLastCalledWith(
      true,
    );
    view.command("toggle-title-bar");
    view.command("preview-active");
    view.command("toggle-title-bar");
    expect(view.state()).toMatchObject({
      titleBarVisible: false,
      handleVisible: false,
    });
    expect(vi.getTimerCount()).toBe(0);
    view.command("close");
    expect(view.window.close).toHaveBeenCalledOnce();
    view.command("preview-inactive");
    expect(view.state().handleVisible).toBe(true);
    expect(vi.getTimerCount()).toBe(1);
    view.chrome.dispose();
  });

  it.each(["closed", "destroyed", "render-process-gone"])(
    "disposes subscriptions and late callbacks on %s",
    (event) => {
      vi.useFakeTimers();
      const view = setup("darwin", false);
      const callbacks = view.window.listeners("show") as Array<() => void>;
      // Real Electron invalidates BrowserWindow's native getters before "closed".
      Object.defineProperty(view.window, "webContents", {
        get() {
          if (view.flags.destroyed)
            throw new TypeError("Object has been destroyed");
          return view.webContents;
        },
      });
      if (event === "closed") view.flags.destroyed = true;
      expect(() =>
        (event === "closed" ? view.window : view.webContents).emit(event),
      ).not.toThrow();
      expect(vi.getTimerCount()).toBe(0);
      expect(view.ipc.listenerCount(terminalIpc.windowChromeCommand)).toBe(0);
      view.webContents.send.mockClear();
      view.command("toggle-title-bar");
      view.command("close");
      view.chrome.setTitle("late");
      for (const callback of callbacks) callback();
      vi.advanceTimersByTime(500);
      expect(view.webContents.send).not.toHaveBeenCalled();
      expect(view.window.close).not.toHaveBeenCalled();
      expect(view.window.eventNames()).toEqual([]);
      expect(view.webContents.eventNames()).toEqual([]);
      view.chrome.dispose();
    },
  );
});
