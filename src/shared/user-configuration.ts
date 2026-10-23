import { isTerminalTheme, type TerminalTheme } from "./terminal-theme";
import type { TerminalKeybinds } from "./terminal-keybinds";

export const MIN_TERMINAL_FONT_SIZE = 8;
export const MAX_TERMINAL_FONT_SIZE = 72;
export const DEFAULT_TERMINAL_FONT_SIZE = 16;
export const DEFAULT_TERMINAL_LINE_HEIGHT = 1;
export const DEFAULT_TERMINAL_FONT_LIGATURES = true;
export const MIN_TERMINAL_LINE_HEIGHT = 1;
export const MAX_TERMINAL_LINE_HEIGHT = 2;
export const MIN_TERMINAL_PADDING = 0;
export const MAX_TERMINAL_PADDING = 128;
export const DEFAULT_TERMINAL_PADDING: TerminalPadding = Object.freeze({
  top: 0,
  right: 8,
  bottom: 8,
  left: 8,
});
export const DEFAULT_SCROLLBACK_LINES = 10_000;
export const MAX_WINDOW_CORNER_RADIUS = 24;
export const MAX_SCROLLBACK_LINES = 100_000;
// One startup fallback, every distinct PTY-control shadow warning, and one
// runtime Terminal Theme reload failure can coexist without dropping an
// unrelated notice.
export const MAX_USER_FILE_ERROR_COUNT = 10;
// Large enough to retain an exact platform path while still bounding every
// notice crossing into the renderer.
export const MAX_USER_FILE_ERROR_LENGTH = 65_536;

export type OperationalLogLevel = "error" | "info" | "debug";
export type OptionKeyMode = "none" | "left" | "right" | "both";

export interface TerminalPadding {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface TerminalRendererConfiguration {
  readonly fontConfigurationId?: string;
  readonly fontFamily?: string;
  readonly fontSize: number;
  readonly fontLineHeight: number;
  readonly fontLigatures: boolean;
  readonly terminalPadding: TerminalPadding;
  readonly scrollbackLines: number;
  readonly optionKeyMode: OptionKeyMode;
  readonly nativeTitleInset: 0 | 30;
  readonly transparency: number;
  readonly showTabBar: boolean;
  // Rounded window corners in CSS px (custom title bar windows); absent is 0.
  readonly cornerRadius?: number;
  // The title bar slides in near the top edge and hides again.
  readonly autoHideTitleBar?: boolean;
  readonly terminalTheme: TerminalTheme;
  readonly userFileErrors: readonly string[];
}

export interface UserConfiguration {
  readonly version: 1;
  readonly confirmClose: boolean;
  readonly logLevel: OperationalLogLevel;
  readonly windowsShell?: string;
  readonly fontFamily?: string;
  readonly fontSize: number;
  readonly fontLineHeight: number;
  readonly fontLigatures: boolean;
  readonly terminalPadding: TerminalPadding;
  readonly scrollbackLines: number;
  readonly optionKeyMode: OptionKeyMode;
  readonly alwaysOnTop: boolean;
  readonly blur: boolean;
  readonly transparency: number;
  readonly showTitleBar: boolean;
  readonly showTabBar: boolean;
  readonly cornerRadius: number;
  readonly autoHideTitleBar: boolean;
  readonly terminalTheme: TerminalTheme;
  readonly keybinds: TerminalKeybinds;
}

export function isTerminalRendererConfiguration(
  value: unknown,
): value is TerminalRendererConfiguration {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return (
    keys.every((key) =>
      [
        "fontConfigurationId",
        "fontFamily",
        "fontSize",
        "fontLineHeight",
        "fontLigatures",
        "terminalPadding",
        "scrollbackLines",
        "optionKeyMode",
        "nativeTitleInset",
        "transparency",
        "showTabBar",
        "cornerRadius",
        "autoHideTitleBar",
        "terminalTheme",
        "userFileErrors",
      ].includes(key),
    ) &&
    isOptionalSurfaceFontIdentity(value.fontConfigurationId) &&
    (value.fontFamily === undefined || typeof value.fontFamily === "string") &&
    Number.isInteger(value.fontSize) &&
    (value.fontSize as number) >= MIN_TERMINAL_FONT_SIZE &&
    (value.fontSize as number) <= MAX_TERMINAL_FONT_SIZE &&
    isLineHeight(value.fontLineHeight) &&
    typeof value.fontLigatures === "boolean" &&
    isTerminalPadding(value.terminalPadding) &&
    Number.isInteger(value.scrollbackLines) &&
    (value.scrollbackLines as number) >= 0 &&
    (value.scrollbackLines as number) <= MAX_SCROLLBACK_LINES &&
    ["none", "left", "right", "both"].includes(value.optionKeyMode as string) &&
    (value.nativeTitleInset === 0 || value.nativeTitleInset === 30) &&
    typeof value.showTabBar === "boolean" &&
    isWindowFrame(value) &&
    isTransparency(value.transparency) &&
    isTerminalTheme(value.terminalTheme) &&
    isUserFileErrors(value.userFileErrors)
  );
}

function isLineHeight(value: unknown): boolean {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= MIN_TERMINAL_LINE_HEIGHT &&
    value <= MAX_TERMINAL_LINE_HEIGHT
  );
}

function isWindowFrame(value: Record<string, unknown>): boolean {
  return (
    (value.cornerRadius === undefined ||
      (Number.isInteger(value.cornerRadius) &&
        (value.cornerRadius as number) >= 0 &&
        (value.cornerRadius as number) <= MAX_WINDOW_CORNER_RADIUS)) &&
    (value.autoHideTitleBar === undefined ||
      typeof value.autoHideTitleBar === "boolean")
  );
}

export function isSurfaceFontIdentity(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/u.test(value)
  );
}

function isOptionalSurfaceFontIdentity(value: unknown): boolean {
  return value === undefined || isSurfaceFontIdentity(value);
}

function isTransparency(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 1
  );
}

export function isUserFileErrors(value: unknown): value is readonly string[] {
  return (
    Array.isArray(value) &&
    value.length <= MAX_USER_FILE_ERROR_COUNT &&
    value.every(
      (entry) =>
        typeof entry === "string" &&
        entry.length > 0 &&
        entry.length <= MAX_USER_FILE_ERROR_LENGTH,
    )
  );
}

function isTerminalPadding(value: unknown): value is TerminalPadding {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return (
    keys.length === 4 &&
    ["top", "right", "bottom", "left"].every(
      (side) =>
        Number.isInteger(value[side]) &&
        (value[side] as number) >= MIN_TERMINAL_PADDING &&
        (value[side] as number) <= MAX_TERMINAL_PADDING,
    )
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
