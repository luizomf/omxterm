import { isTerminalTheme, type TerminalTheme } from "./terminal-theme";
import type { TerminalKeybinds } from "./terminal-keybinds";
import { isSupportedLanguage, type SupportedLanguage } from "./i18n";

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
export const MAX_SCROLLBACK_LINES = 100_000;
// One startup fallback, every distinct PTY-control shadow warning, and one
// runtime Terminal Theme reload failure can coexist without dropping an
// unrelated notice.
export const MAX_USER_FILE_ERROR_COUNT = 10;
// Large enough to retain an exact platform path while still bounding every
// notice crossing into the renderer.
export const MAX_USER_FILE_ERROR_LENGTH = 65_536;

export type AuxiliaryPanelSide = "left" | "right";

export type OperationalLogLevel = "error" | "info" | "debug";
export type OptionKeyMode = "none" | "left" | "right" | "both";

export interface TerminalPadding {
  readonly top: number;
  readonly right: number;
  readonly bottom: number;
  readonly left: number;
}

export interface TerminalRendererConfiguration {
  // Startup composition policy, not a user setting. Standalone hosts retain built-in.
  readonly optionalSnippets?: boolean;
  readonly auxiliaryPanelSide?: AuxiliaryPanelSide;
  // Main always sends the configured language; absent means en-US.
  readonly language?: SupportedLanguage;
  readonly fontConfigurationId?: string;
  readonly fontFamily?: string;
  readonly fontSize: number;
  readonly fontLineHeight: number;
  readonly fontLigatures: boolean;
  readonly terminalPadding: TerminalPadding;
  // Main sends the effective value; standalone/older hosts inherit true.
  readonly terminalContextMenuEnabled?: boolean;
  readonly scrollbackLines: number;
  readonly optionKeyMode: OptionKeyMode;
  readonly nativeTitleInset: 0 | 30;
  readonly transparency: number;
  readonly showTabBar: boolean;
  readonly terminalTheme: TerminalTheme;
  readonly userFileErrors: readonly string[];
}

export interface UserConfiguration {
  readonly version: 1;
  readonly language: SupportedLanguage;
  readonly confirmClose: boolean;
  readonly logLevel: OperationalLogLevel;
  readonly windowsShell?: string;
  readonly fontFamily?: string;
  readonly fontSize: number;
  readonly fontLineHeight: number;
  readonly fontLigatures: boolean;
  readonly terminalPadding: TerminalPadding;
  readonly terminalContextMenuEnabled: boolean;
  readonly scrollbackLines: number;
  readonly optionKeyMode: OptionKeyMode;
  readonly auxiliaryPanelSide: AuxiliaryPanelSide;
  readonly alwaysOnTop: boolean;
  readonly blur: boolean;
  readonly transparency: number;
  readonly showTitleBar: boolean;
  readonly showTabBar: boolean;
  readonly terminalTheme: TerminalTheme;
  readonly keybinds: TerminalKeybinds;
}

function hasValidOptionalRendererFields(
  value: Record<string, unknown>,
): boolean {
  return (
    (value.language === undefined || isSupportedLanguage(value.language)) &&
    (value.auxiliaryPanelSide === undefined ||
      value.auxiliaryPanelSide === "left" ||
      value.auxiliaryPanelSide === "right") &&
    (value.optionalSnippets === undefined ||
      typeof value.optionalSnippets === "boolean") &&
    isOptionalSurfaceFontIdentity(value.fontConfigurationId) &&
    (value.fontFamily === undefined || typeof value.fontFamily === "string")
  );
}

export function isTerminalRendererConfiguration(
  value: unknown,
): value is TerminalRendererConfiguration {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return (
    keys.every((key) =>
      [
        "language",
        "optionalSnippets",
        "auxiliaryPanelSide",
        "fontConfigurationId",
        "fontFamily",
        "fontSize",
        "fontLineHeight",
        "fontLigatures",
        "terminalPadding",
        "terminalContextMenuEnabled",
        "scrollbackLines",
        "optionKeyMode",
        "nativeTitleInset",
        "transparency",
        "showTabBar",
        "terminalTheme",
        "userFileErrors",
      ].includes(key),
    ) &&
    hasValidOptionalRendererFields(value) &&
    Number.isInteger(value.fontSize) &&
    (value.fontSize as number) >= MIN_TERMINAL_FONT_SIZE &&
    (value.fontSize as number) <= MAX_TERMINAL_FONT_SIZE &&
    typeof value.fontLineHeight === "number" &&
    Number.isFinite(value.fontLineHeight) &&
    (value.fontLineHeight as number) >= MIN_TERMINAL_LINE_HEIGHT &&
    (value.fontLineHeight as number) <= MAX_TERMINAL_LINE_HEIGHT &&
    typeof value.fontLigatures === "boolean" &&
    isTerminalPadding(value.terminalPadding) &&
    (value.terminalContextMenuEnabled === undefined ||
      typeof value.terminalContextMenuEnabled === "boolean") &&
    Number.isInteger(value.scrollbackLines) &&
    (value.scrollbackLines as number) >= 0 &&
    (value.scrollbackLines as number) <= MAX_SCROLLBACK_LINES &&
    ["none", "left", "right", "both"].includes(value.optionKeyMode as string) &&
    (value.nativeTitleInset === 0 || value.nativeTitleInset === 30) &&
    typeof value.showTabBar === "boolean" &&
    isTransparency(value.transparency) &&
    isTerminalTheme(value.terminalTheme) &&
    isUserFileErrors(value.userFileErrors)
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
