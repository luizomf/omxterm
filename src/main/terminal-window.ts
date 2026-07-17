import type { BrowserWindowConstructorOptions } from "electron";
import type { UserConfiguration } from "../shared/user-configuration";

const DEFAULT_MINIMUM_WINDOW_WIDTH = 320;
const DEFAULT_MINIMUM_WINDOW_HEIGHT = 200;
const NATIVE_TITLE_AREA_INSET = 30;
const MINIMUM_TERMINAL_COLUMNS = 2;
const MINIMUM_TERMINAL_ROWS = 1;
// Keep aligned with xterm's viewport width reserved by FitAddon.
const XTERM_SCROLLBAR_WIDTH = 14;
// Font bounding boxes can be taller than the configured CSS em before line
// height is applied. Reserve two em as a conservative startup row envelope.
const MAXIMUM_CELL_HEIGHT_EMS = 2;

type TerminalWindowGeometryConfiguration = Pick<
  UserConfiguration,
  "fontSize" | "fontLineHeight" | "terminalPadding" | "scrollbackLines"
>;

export function terminalWindowOptions(
  preloadPath: string,
  configuration: TerminalWindowGeometryConfiguration,
): BrowserWindowConstructorOptions {
  const { fontSize, fontLineHeight, terminalPadding, scrollbackLines } =
    configuration;
  const minimumContentWidth =
    terminalPadding.left +
    terminalPadding.right +
    (scrollbackLines > 0 ? XTERM_SCROLLBAR_WIDTH : 0) +
    fontSize * MINIMUM_TERMINAL_COLUMNS;
  const minimumContentHeight =
    NATIVE_TITLE_AREA_INSET +
    terminalPadding.top +
    terminalPadding.bottom +
    Math.ceil(fontSize * fontLineHeight * MAXIMUM_CELL_HEIGHT_EMS) *
      MINIMUM_TERMINAL_ROWS;

  return {
    width: 960,
    height: 640,
    minWidth: Math.max(DEFAULT_MINIMUM_WINDOW_WIDTH, minimumContentWidth),
    minHeight: Math.max(DEFAULT_MINIMUM_WINDOW_HEIGHT, minimumContentHeight),
    show: false,
    title: "OMXTerm",
    titleBarStyle: "hiddenInset",
    webPreferences: {
      preload: preloadPath,
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      webSecurity: true,
    },
  };
}

export interface LockedTerminalWebContents {
  setWindowOpenHandler(handler: () => { action: "deny" }): void;
  on(
    event: "will-navigate" | "will-frame-navigate",
    listener: (event: { preventDefault(): void }) => void,
  ): void;
}

export function lockTerminalRendererNavigation(
  webContents: LockedTerminalWebContents,
): void {
  webContents.setWindowOpenHandler(() => ({ action: "deny" }));
  webContents.on("will-navigate", (event) => event.preventDefault());
  webContents.on("will-frame-navigate", (event) => event.preventDefault());
}
