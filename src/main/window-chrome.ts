import type { BrowserWindow } from "electron";
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
    removeListener(event: string, listener: () => void): void;
  };
  on(event: string, listener: () => void): void;
  removeListener(event: string, listener: () => void): void;
}

// Native privileges and window-local choice live here, never in the Surface.
export function registerWindowChrome(
  window: ChromeWindow,
  ipc: Pick<IpcMainPort, "on" | "removeListener">,
  options: {
    readonly platform: string;
    readonly showTitleBar: boolean;
    readonly cursor: () => { x: number; y: number };
  },
) {
  // BrowserWindow.webContents is a native getter and throws after "closed".
  // Retain the emitter while its owner is still alive for teardown ordering.
  const webContents = window.webContents;
  let disposed = false;
  let titleBarVisible = options.showTitleBar;
  let previewActive = false;
  let title = "OMXTerm";
  let handleVisible = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  let lastSent = "";
  const alive = () =>
    !disposed && !window.isDestroyed() && !webContents.isDestroyed();
  const state = (): WindowChromeState => ({
    style: options.platform === "darwin" ? "native" : "custom",
    titleBarVisible,
    fullScreen: window.isFullScreen(),
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
    !window.isFullScreen() &&
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
    if (options.platform === "darwin")
      window.setWindowButtonVisibility(
        titleBarVisible && !window.isFullScreen(),
      );
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
        if (window.isFullScreen()) return;
        if (window.isMaximized()) window.unmaximize();
        else window.maximize();
        return;
      // close() deliberately enters the installed guarded close listener.
      case "close":
        window.close();
        return;
    }
  };
  const events = [
    "enter-full-screen",
    "leave-full-screen",
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
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
    ipc.removeListener(terminalIpc.windowChromeCommand, receive);
    for (const event of events) window.removeListener(event, refresh);
    window.removeListener("closed", dispose);
    webContents.removeListener("destroyed", dispose);
    webContents.removeListener("render-process-gone", dispose);
  };
  ipc.on(terminalIpc.windowChromeCommand, receive);
  for (const event of events) window.on(event, refresh);
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
