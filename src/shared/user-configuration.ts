export const MIN_TERMINAL_FONT_SIZE = 8;
export const MAX_TERMINAL_FONT_SIZE = 72;
export const DEFAULT_TERMINAL_FONT_SIZE = 16;
export const DEFAULT_SCROLLBACK_LINES = 10_000;
export const MAX_SCROLLBACK_LINES = 100_000;

export type OperationalLogLevel = "error" | "info" | "debug";
export type OptionKeyMode = "none" | "left" | "right" | "both";

export interface TerminalRendererConfiguration {
  readonly fontFamily?: string;
  readonly fontSize: number;
  readonly scrollbackLines: number;
  readonly optionKeyMode: OptionKeyMode;
}

export interface UserConfiguration {
  readonly version: 1;
  readonly confirmClose: boolean;
  readonly logLevel: OperationalLogLevel;
  readonly fontFamily?: string;
  readonly fontSize: number;
  readonly scrollbackLines: number;
  readonly optionKeyMode: OptionKeyMode;
  readonly alwaysOnTop: boolean;
}

export function isTerminalRendererConfiguration(
  value: unknown,
): value is TerminalRendererConfiguration {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  return (
    keys.every((key) =>
      ["fontFamily", "fontSize", "scrollbackLines", "optionKeyMode"].includes(
        key,
      ),
    ) &&
    (value.fontFamily === undefined || typeof value.fontFamily === "string") &&
    Number.isInteger(value.fontSize) &&
    (value.fontSize as number) >= MIN_TERMINAL_FONT_SIZE &&
    (value.fontSize as number) <= MAX_TERMINAL_FONT_SIZE &&
    Number.isInteger(value.scrollbackLines) &&
    (value.scrollbackLines as number) >= 0 &&
    (value.scrollbackLines as number) <= MAX_SCROLLBACK_LINES &&
    ["none", "left", "right", "both"].includes(value.optionKeyMode as string)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
