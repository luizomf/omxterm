import type { BrowserWindow, Input, InputEvent } from "electron";
import { terminalIpc } from "../shared/terminal-ipc";
import {
  isWindowChromeCommand,
  type WindowChromeState,
} from "../shared/window-chrome";
import type { IpcListener, IpcMainPort } from "./terminal-ipc-types";

interface ChromeWindow extends Pick<
  BrowserWindow,
  | "isDestroyed"
  | "isFullScreen"
  | "isMaximized"
  | "isMinimized"
  | "isVisible"
  | "isFocused"
  | "setWindowButtonVisibility"
  | "getContentBounds"
  | "minimize"
  | "maximize"
  | "unmaximize"
  | "close"
> {
  readonly webContents: {
    readonly mainFrame: object;
    isDestroyed(): boolean;
    send(channel: string, payload: unknown): void;
    on(event: string, listener: () => void): void;
    on(
      event: "before-input-event",
      listener: (event: { preventDefault(): void }, input: Input) => void,
    ): void;
    on(
      event: "input-event",
      listener: (event: unknown, input: InputEvent) => void,
    ): void;
    removeListener(event: string, listener: () => void): void;
    removeListener(
      event: "before-input-event",
      listener: (event: { preventDefault(): void }, input: Input) => void,
    ): void;
    removeListener(
      event: "input-event",
      listener: (event: unknown, input: InputEvent) => void,
    ): void;
  };
  on(event: string, listener: () => void): void;
  removeListener(event: string, listener: () => void): void;
}

function isUnmodifiedAlt(input: Input): boolean {
  return (
    input.key === "Alt" &&
    ["AltLeft", "AltRight"].includes(input.code) &&
    !input.control &&
    !input.shift &&
    !input.meta &&
    !input.isComposing &&
    !input.isAutoRepeat &&
    !input.modifiers?.some((modifier) => /altgr|buttondown/i.test(modifier))
  );
}

// Native privileges and window-local choice live here, never in the Surface.
export function registerWindowChrome(
  window: ChromeWindow,
  ipc: Pick<IpcMainPort, "on" | "removeListener">,
  options: {
    readonly platform: string;
    readonly showTitleBar: boolean;
    readonly cursor: () => { x: number; y: number };
    // Resolve the current native menu at opening time. The returned function
    // closes only that popup; native dismissal must call onClosed.
    readonly popupApplicationMenu: (
      position: { x: number; y: number },
      onClosed: () => void,
    ) => (() => void) | undefined;
  },
) {
  // BrowserWindow.webContents is a native getter and throws after "closed".
  // Retain the emitter while its owner is still alive for teardown ordering.
  const webContents = window.webContents;
  let disposed = false;
  let titleBarVisible = options.showTitleBar;
  // On Windows fullscreen events precede the native getter update. The event
  // owns the new state; reading the getter there can stop sampling on exit.
  let fullScreen = window.isFullScreen();
  let previewActive = false;
  let title = "OMXTerm";
  let handleVisible = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  let lastSent = "";
  const alive = () =>
    !disposed && !window.isDestroyed() && !webContents.isDestroyed();
  const usesAltMenu =
    options.platform === "linux" || options.platform === "win32";
  let altCandidate: string | undefined;
  const pressedKeys = new Set<string>();
  let popup: { close: (() => void) | undefined } | undefined;
  const cancelAlt = () => {
    altCandidate = undefined;
  };
  const resetInput = () => {
    cancelAlt();
    pressedKeys.clear();
  };
  const closeMenu = () => {
    resetInput();
    const previous = popup;
    popup = undefined;
    previous?.close?.();
  };
  const canOpenMenu = () =>
    alive() &&
    window.isFocused() &&
    window.isVisible() &&
    !window.isMinimized() &&
    !previewActive &&
    !popup;
  const beforeInput = (event: { preventDefault(): void }, input: Input) => {
    const down = input.type === "keyDown" || input.type === "rawKeyDown";
    const alreadyPressed = pressedKeys.has(input.code);
    // Modified action keys may be consumed by keybind delivery, which can also
    // suppress their release. Track Alt and ordinary keys, including Shift-only
    // input: Shift alone cannot bind an application action. Modifier flags and
    // intervening events disqualify combinations separately.
    if (
      down &&
      (input.key === "Alt" || !(input.alt || input.control || input.meta))
    )
      pressedKeys.add(input.code);
    else if (input.type === "keyUp") pressedKeys.delete(input.code);
    if (
      !canOpenMenu() ||
      !isUnmodifiedAlt(input) ||
      (down ? alreadyPressed || pressedKeys.size !== 1 : pressedKeys.size !== 0)
    ) {
      cancelAlt();
      return;
    }
    if (down) {
      altCandidate = input.code;
      // Consuming Alt-down prevents Chromium from delivering Alt-up on X11.
      // Only the release that actually opens a menu is consumed.
      return;
    }
    const open = input.type === "keyUp" && altCandidate === input.code;
    cancelAlt();
    if (!open) return;
    const current: { close: (() => void) | undefined } = { close: undefined };
    popup = current;
    current.close = options.popupApplicationMenu(
      { x: 8, y: titleBarVisible && !fullScreen ? 42 : 8 },
      () => {
        if (popup === current) {
          popup = undefined;
          resetInput();
        }
        // Native menus restore the previous focus. Never activate a window or
        // steal DOM focus from a preview/sidebar when the popup closes.
      },
    );
    if (current.close) event.preventDefault();
    else if (popup === current) popup = undefined;
  };
  const inputEvent = (_event: unknown, input: InputEvent) => {
    // This post-dispatch seam also covers char, mouse, wheel, touch and pointer
    // input without intercepting the renderer. Keyboard identity is checked by
    // before-input-event; its matching down/up must not cancel themselves.
    if (!["keyDown", "rawKeyDown", "keyUp"].includes(input.type)) cancelAlt();
  };
  const state = (): WindowChromeState => ({
    style: options.platform === "darwin" ? "native" : "custom",
    titleBarVisible,
    fullScreen,
    maximized: window.isMaximized(),
    handleVisible,
    title,
  });
  const publish = (force = false) => {
    if (!alive()) return;
    const snapshot = state();
    const serialized = JSON.stringify(snapshot);
    if (!force && serialized === lastSent) return;
    lastSent = serialized;
    webContents.send(terminalIpc.windowChromeState, snapshot);
  };
  const needsSampling = () =>
    alive() &&
    !titleBarVisible &&
    !previewActive &&
    !fullScreen &&
    window.isVisible() &&
    !window.isMinimized();
  const sample = () => {
    if (!alive()) return;
    handleVisible = false;
    if (needsSampling()) {
      // Electron bounds and cursor points are logical (DIP) coordinates. Native
      // drag hit testing suppresses DOM pointer events, including mouseleave.
      const point = options.cursor();
      const bounds = window.getContentBounds();
      handleVisible =
        point.x >= bounds.x &&
        point.x < bounds.x + bounds.width &&
        point.y >= bounds.y &&
        point.y < bounds.y + Math.min(150, bounds.height);
    }
    publish();
  };
  const refresh = () => {
    if (!alive()) return;
    closeMenu();
    if (options.platform === "darwin")
      window.setWindowButtonVisibility(titleBarVisible && !fullScreen);
    if (needsSampling()) timer ??= setInterval(sample, 100);
    else if (timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
    sample();
  };
  const receive: IpcListener = (event, command) => {
    if (
      !alive() ||
      event.sender !== webContents ||
      event.senderFrame !== webContents.mainFrame ||
      !isWindowChromeCommand(command)
    )
      return;
    switch (command) {
      case "sync":
        refresh();
        publish(true);
        return;
      case "preview-active":
        previewActive = true;
        refresh();
        return;
      case "preview-inactive":
        previewActive = false;
        refresh();
        return;
      case "toggle-title-bar":
        if (previewActive) return;
        titleBarVisible = !titleBarVisible;
        refresh();
        return;
      case "minimize":
        window.minimize();
        return;
      case "maximize":
        if (fullScreen) return;
        if (window.isMaximized()) window.unmaximize();
        else window.maximize();
        return;
      // close() deliberately enters the installed guarded close listener.
      case "close":
        window.close();
        return;
    }
  };
  const enterFullScreen = () => {
    fullScreen = true;
    refresh();
  };
  const leaveFullScreen = () => {
    fullScreen = false;
    refresh();
  };
  const events = [
    "maximize",
    "unmaximize",
    "show",
    "hide",
    "minimize",
    "restore",
  ] as const;
  const dispose = () => {
    if (disposed) return;
    disposed = true;
    closeMenu();
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
    ipc.removeListener(terminalIpc.windowChromeCommand, receive);
    for (const event of events) window.removeListener(event, refresh);
    window.removeListener("enter-full-screen", enterFullScreen);
    window.removeListener("leave-full-screen", leaveFullScreen);
    window.removeListener("closed", dispose);
    if (usesAltMenu) {
      window.removeListener("blur", resetInput);
      webContents.removeListener("blur", resetInput);
      webContents.removeListener("before-input-event", beforeInput);
      webContents.removeListener("before-mouse-event", cancelAlt);
      webContents.removeListener("input-event", inputEvent);
    }
    webContents.removeListener("destroyed", dispose);
    webContents.removeListener("render-process-gone", dispose);
  };
  if (usesAltMenu) {
    window.on("blur", resetInput);
    webContents.on("blur", resetInput);
    webContents.on("before-input-event", beforeInput);
    webContents.on("before-mouse-event", cancelAlt);
    webContents.on("input-event", inputEvent);
  }
  ipc.on(terminalIpc.windowChromeCommand, receive);
  for (const event of events) window.on(event, refresh);
  window.on("enter-full-screen", enterFullScreen);
  window.on("leave-full-screen", leaveFullScreen);
  window.on("closed", dispose);
  webContents.on("destroyed", dispose);
  webContents.on("render-process-gone", dispose);
  refresh();
  return {
    setTitle(next: string) {
      if (!alive()) return;
      title = next;
      publish();
    },
    dispose,
  };
}
