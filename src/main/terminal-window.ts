import type { BrowserWindowConstructorOptions } from "electron";
import type { LoadedUserConfiguration } from "./user-configuration";

const DEFAULT_MINIMUM_WINDOW_WIDTH = 320;
const DEFAULT_MINIMUM_WINDOW_HEIGHT = 200;
const NATIVE_TITLE_AREA_INSET = 30;
const MINIMUM_TERMINAL_COLUMNS = 2;
const MINIMUM_TERMINAL_ROWS = 1;
// Keep aligned with xterm's viewport width reserved by FitAddon.
const XTERM_SCROLLBAR_WIDTH = 14;
// The bundled font is not installed in AppKit. Keep its existing conservative
// two-em startup row envelope; configured system fonts provide exact metrics.
const MAXIMUM_CELL_HEIGHT_EMS = 2;

type TerminalWindowGeometryConfiguration = Pick<
  LoadedUserConfiguration,
  | "fontSize"
  | "fontLineHeight"
  | "terminalPadding"
  | "scrollbackLines"
  | "configuredFontMetrics"
  | "terminalTheme"
>;

export function terminalWindowOptions(
  preloadPath: string,
  configuration: TerminalWindowGeometryConfiguration,
): BrowserWindowConstructorOptions {
  const {
    fontSize,
    fontLineHeight,
    terminalPadding,
    scrollbackLines,
    configuredFontMetrics,
    terminalTheme,
  } = configuration;
  const cellWidth = configuredFontMetrics?.cellWidth ?? fontSize;
  const baseCellHeight =
    configuredFontMetrics?.cellHeight ?? fontSize * MAXIMUM_CELL_HEIGHT_EMS;
  const minimumContentWidth =
    terminalPadding.left +
    terminalPadding.right +
    (scrollbackLines > 0 ? XTERM_SCROLLBAR_WIDTH : 0) +
    cellWidth * MINIMUM_TERMINAL_COLUMNS;
  const minimumContentHeight =
    NATIVE_TITLE_AREA_INSET +
    terminalPadding.top +
    terminalPadding.bottom +
    // xterm rounds the base character envelope before applying lineHeight.
    Math.ceil(Math.ceil(baseCellHeight) * fontLineHeight) *
      MINIMUM_TERMINAL_ROWS;

  return {
    width: 960,
    height: 640,
    minWidth: Math.max(
      DEFAULT_MINIMUM_WINDOW_WIDTH,
      Math.ceil(minimumContentWidth),
    ),
    minHeight: Math.max(
      DEFAULT_MINIMUM_WINDOW_HEIGHT,
      Math.ceil(minimumContentHeight),
    ),
    show: false,
    title: "OMXTerm",
    titleBarStyle: "hiddenInset",
    backgroundColor: terminalTheme.colors.background,
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
