import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import type {
  OperationalLogLevel,
  UserConfiguration,
} from "../shared/user-configuration";
import {
  DEFAULT_SCROLLBACK_LINES,
  DEFAULT_TERMINAL_LINE_HEIGHT,
  DEFAULT_TERMINAL_PADDING,
  DEFAULT_TERMINAL_FONT_SIZE,
  MAX_TERMINAL_LINE_HEIGHT,
  MAX_TERMINAL_PADDING,
  MAX_SCROLLBACK_LINES,
  MAX_TERMINAL_FONT_SIZE,
  MIN_TERMINAL_LINE_HEIGHT,
  MIN_TERMINAL_PADDING,
  MIN_TERMINAL_FONT_SIZE,
} from "../shared/user-configuration";
import type { InstalledFontFamilyMetrics } from "./installed-font-family";
import { DEFAULT_TERMINAL_THEME } from "../shared/terminal-theme";
import { loadTerminalTheme, TerminalThemeError } from "./terminal-theme";

export {
  DEFAULT_SCROLLBACK_LINES,
  DEFAULT_TERMINAL_LINE_HEIGHT,
  DEFAULT_TERMINAL_PADDING,
  DEFAULT_TERMINAL_FONT_SIZE,
  MAX_TERMINAL_LINE_HEIGHT,
  MAX_TERMINAL_PADDING,
  MAX_SCROLLBACK_LINES,
  MAX_TERMINAL_FONT_SIZE,
  MIN_TERMINAL_LINE_HEIGHT,
  MIN_TERMINAL_PADDING,
  MIN_TERMINAL_FONT_SIZE,
} from "../shared/user-configuration";

export const USER_CONFIGURATION_VERSION = 1;

export const DEFAULT_USER_CONFIGURATION: UserConfiguration = Object.freeze({
  version: USER_CONFIGURATION_VERSION,
  confirmClose: true,
  logLevel: "info",
  fontSize: DEFAULT_TERMINAL_FONT_SIZE,
  fontLineHeight: DEFAULT_TERMINAL_LINE_HEIGHT,
  terminalPadding: DEFAULT_TERMINAL_PADDING,
  scrollbackLines: DEFAULT_SCROLLBACK_LINES,
  optionKeyMode: "none",
  alwaysOnTop: false,
  terminalTheme: DEFAULT_TERMINAL_THEME,
});

export class UserConfigurationError extends Error {
  constructor(
    readonly configurationPath: string,
    readonly location: string | undefined,
    readonly reason: string,
  ) {
    super(userConfigurationDiagnostic(configurationPath, location, reason));
    this.name = "UserConfigurationError";
  }
}

export function userConfigurationDiagnostic(
  configurationPath: string,
  location: string | undefined,
  reason: string,
): string {
  const safeLocation = location
    ? ` at ${JSON.stringify(location.slice(0, 128))}`
    : "";
  return `User Configuration ${JSON.stringify(configurationPath)}${safeLocation}: ${reason}. Fix the file and restart OMXTerm.`;
}

export interface LoadUserConfigurationOptions {
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly homeDirectory: string;
  readonly getInstalledFontFamilyMetrics: (
    family: string,
    fontSize: number,
  ) => Promise<InstalledFontFamilyMetrics | undefined>;
  readonly read?: typeof readFile;
}

export interface LoadedUserConfiguration extends UserConfiguration {
  readonly configuredFontMetrics?: InstalledFontFamilyMetrics;
}

export function resolveUserConfigurationPath(
  environment: Readonly<Record<string, string | undefined>>,
  homeDirectory: string,
): string {
  const root =
    environment.XDG_CONFIG_HOME || path.join(homeDirectory, ".config");
  return path.join(root, "omxterm", "config.json");
}

export async function loadUserConfiguration(
  options: LoadUserConfigurationOptions,
): Promise<LoadedUserConfiguration> {
  const configurationPath = resolveUserConfigurationPath(
    options.environment,
    options.homeDirectory,
  );
  let bytes: Uint8Array;
  try {
    bytes = await (options.read ?? readFile)(configurationPath);
  } catch (cause) {
    if (isNotFound(cause) && (await isPathAbsent(configurationPath)))
      return DEFAULT_USER_CONFIGURATION;
    throw new UserConfigurationError(
      configurationPath,
      undefined,
      "the file could not be read",
    );
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new UserConfigurationError(
      configurationPath,
      undefined,
      "the file is not valid UTF-8",
    );
  }

  let document: unknown;
  try {
    document = JSON.parse(text) as unknown;
  } catch {
    throw new UserConfigurationError(
      configurationPath,
      undefined,
      "the file is not valid JSON",
    );
  }
  const declaredFontFamily = configuredFontFamily(document);
  const preliminary = validateUserConfiguration(
    document,
    configurationPath,
    new Set(declaredFontFamily === undefined ? [] : [declaredFontFamily]),
  );
  const configuredThemePath = selectedTerminalThemePath(
    document,
    configurationPath,
  );
  let terminalTheme = DEFAULT_TERMINAL_THEME;
  if (configuredThemePath) {
    try {
      terminalTheme = await loadTerminalTheme(configuredThemePath);
    } catch (cause) {
      if (cause instanceof TerminalThemeError)
        throw new UserConfigurationError(
          configurationPath,
          "theme.path",
          cause.message,
        );
      throw cause;
    }
  }
  if (preliminary.fontFamily === undefined)
    return Object.freeze({ ...preliminary, terminalTheme });
  const configuredFontMetrics = await checkFontMetrics(
    options,
    configurationPath,
    preliminary.fontFamily,
    preliminary.fontSize,
  );
  if (configuredFontMetrics === undefined)
    fail(
      configurationPath,
      "font.family",
      "must exactly name an installed font family",
    );
  return Object.freeze({
    ...preliminary,
    terminalTheme,
    configuredFontMetrics,
  });
}

async function isPathAbsent(configurationPath: string): Promise<boolean> {
  try {
    await lstat(configurationPath);
    return false;
  } catch (cause) {
    return isNotFound(cause);
  }
}

function configuredFontFamily(document: unknown): string | undefined {
  if (
    typeof document !== "object" ||
    document === null ||
    Array.isArray(document)
  )
    return undefined;
  const font = (document as Record<string, unknown>).font;
  if (!(
    typeof font === "object" &&
    font !== null &&
    !Array.isArray(font) &&
    "family" in font
  ))
    return undefined;
  const family = (font as Record<string, unknown>).family;
  return typeof family === "string" ? family : undefined;
}

async function checkFontMetrics(
  options: LoadUserConfigurationOptions,
  configurationPath: string,
  family: string,
  fontSize: number,
): Promise<InstalledFontFamilyMetrics | undefined> {
  try {
    return await options.getInstalledFontFamilyMetrics(family, fontSize);
  } catch {
    throw new UserConfigurationError(
      configurationPath,
      "font.family",
      "installed font families could not be discovered",
    );
  }
}

export function validateUserConfiguration(
  document: unknown,
  configurationPath: string,
  installedFontFamilies: ReadonlySet<string>,
): UserConfiguration {
  const root = requireObject(document, configurationPath, "$", "an object");
  rejectUnknownKeys(root, configurationPath, "$", [
    "version",
    "confirmClose",
    "logLevel",
    "font",
    "terminal",
    "scrollback",
    "keyboard",
    "window",
    "theme",
  ]);
  if (!("version" in root)) fail(configurationPath, "version", "is required");
  if (root.version !== USER_CONFIGURATION_VERSION)
    fail(configurationPath, "version", "must be 1");

  const font = optionalObject(root.font, configurationPath, "font");
  const scrollback = optionalObject(
    root.scrollback,
    configurationPath,
    "scrollback",
  );
  const terminal = optionalObject(root.terminal, configurationPath, "terminal");
  const padding = optionalObject(
    terminal?.padding,
    configurationPath,
    "terminal.padding",
  );
  const keyboard = optionalObject(root.keyboard, configurationPath, "keyboard");
  const window = optionalObject(root.window, configurationPath, "window");
  const theme = optionalObject(root.theme, configurationPath, "theme");
  if (font)
    rejectUnknownKeys(font, configurationPath, "font", [
      "family",
      "size",
      "lineHeight",
    ]);
  if (terminal)
    rejectUnknownKeys(terminal, configurationPath, "terminal", ["padding"]);
  if (padding)
    rejectUnknownKeys(padding, configurationPath, "terminal.padding", [
      "top",
      "right",
      "bottom",
      "left",
    ]);
  if (scrollback)
    rejectUnknownKeys(scrollback, configurationPath, "scrollback", ["lines"]);
  if (keyboard)
    rejectUnknownKeys(keyboard, configurationPath, "keyboard", ["optionAsAlt"]);
  if (window)
    rejectUnknownKeys(window, configurationPath, "window", ["alwaysOnTop"]);
  if (theme) rejectUnknownKeys(theme, configurationPath, "theme", ["path"]);

  if (theme) {
    if (!("path" in theme))
      fail(configurationPath, "theme.path", "is required");
    if (
      typeof theme.path !== "string" ||
      theme.path.length === 0 ||
      theme.path.includes("\0")
    )
      fail(
        configurationPath,
        "theme.path",
        "must be a non-empty string without a NUL character",
      );
  }

  const fontFamily = font?.family;
  if (fontFamily !== undefined) {
    if (typeof fontFamily !== "string" || fontFamily.length === 0)
      fail(configurationPath, "font.family", "must be a non-empty string");
    if (!installedFontFamilies.has(fontFamily))
      fail(
        configurationPath,
        "font.family",
        "must exactly name an installed font family",
      );
  }

  const fontSize = integerInRange(
    font?.size,
    configurationPath,
    "font.size",
    MIN_TERMINAL_FONT_SIZE,
    MAX_TERMINAL_FONT_SIZE,
    DEFAULT_TERMINAL_FONT_SIZE,
  );
  const fontLineHeight = numberInRange(
    font?.lineHeight,
    configurationPath,
    "font.lineHeight",
    MIN_TERMINAL_LINE_HEIGHT,
    MAX_TERMINAL_LINE_HEIGHT,
    DEFAULT_TERMINAL_LINE_HEIGHT,
  );
  const terminalPadding = Object.freeze({
    top: integerInRange(
      padding?.top,
      configurationPath,
      "terminal.padding.top",
      MIN_TERMINAL_PADDING,
      MAX_TERMINAL_PADDING,
      DEFAULT_TERMINAL_PADDING.top,
    ),
    right: integerInRange(
      padding?.right,
      configurationPath,
      "terminal.padding.right",
      MIN_TERMINAL_PADDING,
      MAX_TERMINAL_PADDING,
      DEFAULT_TERMINAL_PADDING.right,
    ),
    bottom: integerInRange(
      padding?.bottom,
      configurationPath,
      "terminal.padding.bottom",
      MIN_TERMINAL_PADDING,
      MAX_TERMINAL_PADDING,
      DEFAULT_TERMINAL_PADDING.bottom,
    ),
    left: integerInRange(
      padding?.left,
      configurationPath,
      "terminal.padding.left",
      MIN_TERMINAL_PADDING,
      MAX_TERMINAL_PADDING,
      DEFAULT_TERMINAL_PADDING.left,
    ),
  });
  const scrollbackLines = integerInRange(
    scrollback?.lines,
    configurationPath,
    "scrollback.lines",
    0,
    MAX_SCROLLBACK_LINES,
    DEFAULT_SCROLLBACK_LINES,
  );
  const confirmClose = optionalBoolean(
    root.confirmClose,
    configurationPath,
    "confirmClose",
    true,
  );
  const alwaysOnTop = optionalBoolean(
    window?.alwaysOnTop,
    configurationPath,
    "window.alwaysOnTop",
    false,
  );
  const logLevel = optionalEnum(
    root.logLevel,
    configurationPath,
    "logLevel",
    ["error", "info", "debug"] as const,
    "info",
  ) as OperationalLogLevel;
  const optionKeyMode = optionalEnum(
    keyboard?.optionAsAlt,
    configurationPath,
    "keyboard.optionAsAlt",
    ["none", "left", "right", "both"] as const,
    "none",
  );

  return Object.freeze({
    version: USER_CONFIGURATION_VERSION,
    confirmClose,
    logLevel,
    ...(fontFamily === undefined ? {} : { fontFamily }),
    fontSize,
    fontLineHeight,
    terminalPadding,
    scrollbackLines,
    optionKeyMode,
    alwaysOnTop,
    terminalTheme: DEFAULT_TERMINAL_THEME,
  });
}

function selectedTerminalThemePath(
  document: unknown,
  configurationPath: string,
): string | undefined {
  if (
    typeof document !== "object" ||
    document === null ||
    Array.isArray(document)
  )
    return undefined;
  const theme = (document as Record<string, unknown>).theme;
  if (theme === undefined) return undefined;
  const selectedPath = (theme as Record<string, unknown>).path as string;
  return path.isAbsolute(selectedPath)
    ? selectedPath
    : path.resolve(path.dirname(configurationPath), selectedPath);
}

function isNotFound(cause: unknown): boolean {
  return (
    typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    cause.code === "ENOENT"
  );
}

function requireObject(
  value: unknown,
  configurationPath: string,
  location: string,
  expected: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    fail(configurationPath, location, `must be ${expected}`);
  return value as Record<string, unknown>;
}

function optionalObject(
  value: unknown,
  configurationPath: string,
  location: string,
): Record<string, unknown> | undefined {
  return value === undefined
    ? undefined
    : requireObject(value, configurationPath, location, "an object");
}

function rejectUnknownKeys(
  value: Record<string, unknown>,
  configurationPath: string,
  location: string,
  allowed: readonly string[],
): void {
  const unknown = Object.keys(value).find((key) => !allowed.includes(key));
  if (unknown) fail(configurationPath, `${location}.${unknown}`, "is unknown");
}

function integerInRange(
  value: unknown,
  configurationPath: string,
  location: string,
  minimum: number,
  maximum: number,
  defaultValue: number,
): number {
  if (value === undefined) return defaultValue;
  if (!Number.isFinite(value) || !Number.isInteger(value))
    fail(configurationPath, location, "must be a finite integer");
  if ((value as number) < minimum || (value as number) > maximum)
    fail(
      configurationPath,
      location,
      `must be from ${minimum} through ${maximum}`,
    );
  return value as number;
}

function numberInRange(
  value: unknown,
  configurationPath: string,
  location: string,
  minimum: number,
  maximum: number,
  defaultValue: number,
): number {
  if (value === undefined) return defaultValue;
  if (typeof value !== "number" || !Number.isFinite(value))
    fail(configurationPath, location, "must be a finite number");
  if (value < minimum || value > maximum)
    fail(
      configurationPath,
      location,
      `must be from ${minimum} through ${maximum}`,
    );
  return value;
}

function optionalBoolean(
  value: unknown,
  configurationPath: string,
  location: string,
  defaultValue: boolean,
): boolean {
  if (value === undefined) return defaultValue;
  if (typeof value !== "boolean")
    fail(configurationPath, location, "must be a boolean");
  return value;
}

function optionalEnum<const Values extends readonly string[]>(
  value: unknown,
  configurationPath: string,
  location: string,
  values: Values,
  defaultValue: Values[number],
): Values[number] {
  if (value === undefined) return defaultValue;
  if (typeof value !== "string" || !values.includes(value))
    fail(configurationPath, location, `must be ${values.join(", ")}`);
  return value as Values[number];
}

function fail(
  configurationPath: string,
  location: string | undefined,
  reason: string,
): never {
  throw new UserConfigurationError(configurationPath, location, reason);
}
