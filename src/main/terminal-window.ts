import type { BrowserWindowConstructorOptions } from "electron";
import type { LoadedUserConfiguration } from "./user-configuration";

const DEFAULT_MINIMUM_WINDOW_WIDTH = 320;
const DEFAULT_MINIMUM_WINDOW_HEIGHT = 200;
const MACOS_NATIVE_TITLE_AREA_INSET = 30;
const MINIMUM_TERMINAL_COLUMNS = 2;
const MINIMUM_TERMINAL_ROWS = 1;
// Reserve the Restty scrollbar's content width when history is enabled.
const TERMINAL_SCROLLBAR_WIDTH = 14;
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

export interface ConfigurableTerminalWindow {
  isDestroyed(): boolean;
  setMinimumSize(width: number, height: number): void;
}

export function terminalNativeTitleInset(platform: string): 0 | 30 {
  return platform === "darwin" ? MACOS_NATIVE_TITLE_AREA_INSET : 0;
}

export function applyTerminalWindowConfiguration(
  windows: readonly ConfigurableTerminalWindow[],
  configuration: TerminalWindowGeometryConfiguration,
  platform: string,
): void {
  const { minWidth, minHeight } = terminalWindowOptions(
    "",
    configuration,
    platform,
  );
  for (const window of windows) {
    if (window.isDestroyed()) continue;
    window.setMinimumSize(minWidth!, minHeight!);
  }
}

export function terminalWindowOptions(
  preloadPath: string,
  configuration: TerminalWindowGeometryConfiguration,
  platform: string = "darwin",
  windowIconPath?: string,
): BrowserWindowConstructorOptions {
  const {
    fontSize,
    fontLineHeight,
    terminalPadding,
    scrollbackLines,
    configuredFontMetrics,
  } = configuration;
  const cellWidth = configuredFontMetrics?.cellWidth ?? fontSize;
  const baseCellHeight =
    configuredFontMetrics?.cellHeight ?? fontSize * MAXIMUM_CELL_HEIGHT_EMS;
  const minimumContentWidth =
    terminalPadding.left +
    terminalPadding.right +
    (scrollbackLines > 0 ? TERMINAL_SCROLLBAR_WIDTH : 0) +
    cellWidth * MINIMUM_TERMINAL_COLUMNS;
  const nativeTitleInset = terminalNativeTitleInset(platform);
  const minimumContentHeight =
    (platform === "darwin" ? nativeTitleInset : 34) +
    terminalPadding.top +
    terminalPadding.bottom +
    // Restty rounds the base character envelope before applying lineHeight.
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
    autoHideMenuBar: platform === "linux" || platform === "win32",
    // Retain hiddenInset on macOS: live button visibility never recreates the window.
    // Other platforms keep native resize/snap behavior with app-drawn controls.
    frame: platform === "darwin",
    useContentSize: platform !== "darwin",
    titleBarStyle: platform === "darwin" ? "hiddenInset" : "default",
    // Windows transparent windows lose the normal native control/state path.
    // Keep it intact; Acrylic supplies translucency, otherwise retain the theme.
    transparent: platform !== "win32",
    backgroundColor:
      platform === "win32"
        ? configuration.terminalTheme.colors.background
        : "#00000000",
    ...(platform === "darwin" ? { visualEffectState: "active" as const } : {}),
    // Without a window icon, environments that resolve icons from the window
    // itself (a directly-run Linux AppImage has no registered desktop entry)
    // fall back to a generic placeholder.
    ...(windowIconPath ? { icon: windowIconPath } : {}),
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
