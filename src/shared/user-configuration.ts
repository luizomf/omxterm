import { isTerminalTheme, type TerminalTheme } from "./terminal-theme";

export const MIN_TERMINAL_FONT_SIZE = 8;
export const MAX_TERMINAL_FONT_SIZE = 72;
export const DEFAULT_TERMINAL_FONT_SIZE = 16;
export const DEFAULT_TERMINAL_LINE_HEIGHT = 1;
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
export const MAX_SCROLLBACK_LINES = 100_000;
export const MAX_USER_FILE_ERROR_COUNT = 8;
export const MAX_USER_FILE_ERROR_LENGTH = 2048;

export type OperationalLogLevel = "error" | "info" | "debug";
export type OptionKeyMode = "none" | "left" | "right" | "both";

export interface TerminalPadding {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface TerminalRendererConfiguration {
  readonly fontFamily?: string;
  readonly fontSize: number;
  readonly fontLineHeight: number;
  readonly terminalPadding: TerminalPadding;
  readonly scrollbackLines: number;
  readonly optionKeyMode: OptionKeyMode;
  readonly terminalTheme: TerminalTheme;
  readonly userFileErrors: readonly string[];
}

export interface UserConfiguration {
  readonly version: 1;
  readonly confirmClose: boolean;
  readonly logLevel: OperationalLogLevel;
  readonly fontFamily?: string;
  readonly fontSize: number;
  readonly fontLineHeight: number;
  readonly terminalPadding: TerminalPadding;
  readonly scrollbackLines: number;
  readonly optionKeyMode: OptionKeyMode;
  readonly alwaysOnTop: boolean;
  readonly terminalTheme: TerminalTheme;
}

export function isTerminalRendererConfiguration(
  value: unknown,
): value is TerminalRendererConfiguration {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return (
    keys.every((key) =>
      [
        "fontFamily",
        "fontSize",
        "fontLineHeight",
        "terminalPadding",
        "scrollbackLines",
        "optionKeyMode",
        "terminalTheme",
        "userFileErrors",
      ].includes(key),
    ) &&
    (value.fontFamily === undefined || typeof value.fontFamily === "string") &&
    Number.isInteger(value.fontSize) &&
    (value.fontSize as number) >= MIN_TERMINAL_FONT_SIZE &&
    (value.fontSize as number) <= MAX_TERMINAL_FONT_SIZE &&
    typeof value.fontLineHeight === "number" &&
    Number.isFinite(value.fontLineHeight) &&
    (value.fontLineHeight as number) >= MIN_TERMINAL_LINE_HEIGHT &&
    (value.fontLineHeight as number) <= MAX_TERMINAL_LINE_HEIGHT &&
    isTerminalPadding(value.terminalPadding) &&
    Number.isInteger(value.scrollbackLines) &&
    (value.scrollbackLines as number) >= 0 &&
    (value.scrollbackLines as number) <= MAX_SCROLLBACK_LINES &&
    ["none", "left", "right", "both"].includes(value.optionKeyMode as string) &&
    isTerminalTheme(value.terminalTheme) &&
    isUserFileErrors(value.userFileErrors)
  );
}

function isUserFileErrors(value: unknown): value is readonly string[] {
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
