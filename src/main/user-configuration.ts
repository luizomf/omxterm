import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
  OperationalLogLevel,
  UserConfiguration,
} from "../shared/user-configuration";
import {
  DEFAULT_SCROLLBACK_LINES,
  DEFAULT_TERMINAL_FONT_SIZE,
  MAX_SCROLLBACK_LINES,
  MAX_TERMINAL_FONT_SIZE,
  MIN_TERMINAL_FONT_SIZE,
} from "../shared/user-configuration";

export {
  DEFAULT_SCROLLBACK_LINES,
  DEFAULT_TERMINAL_FONT_SIZE,
  MAX_SCROLLBACK_LINES,
  MAX_TERMINAL_FONT_SIZE,
  MIN_TERMINAL_FONT_SIZE,
} from "../shared/user-configuration";

export const USER_CONFIGURATION_VERSION = 1;

export const DEFAULT_USER_CONFIGURATION: UserConfiguration = Object.freeze({
  version: USER_CONFIGURATION_VERSION,
  confirmClose: true,
  logLevel: "info",
  fontSize: DEFAULT_TERMINAL_FONT_SIZE,
  scrollbackLines: DEFAULT_SCROLLBACK_LINES,
  optionKeyMode: "none",
  alwaysOnTop: false,
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
  readonly discoverInstalledFontFamilies: () => Promise<ReadonlySet<string>>;
  readonly read?: typeof readFile;
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
): Promise<UserConfiguration> {
  const configurationPath = resolveUserConfigurationPath(
    options.environment,
    options.homeDirectory,
  );
  let bytes: Uint8Array;
  try {
    bytes = await (options.read ?? readFile)(configurationPath);
  } catch (cause) {
    if (isNotFound(cause)) return DEFAULT_USER_CONFIGURATION;
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
  if (preliminary.fontFamily === undefined) return preliminary;
  const installedFontFamilies = await discoverFonts(options, configurationPath);
  if (!installedFontFamilies.has(preliminary.fontFamily))
    fail(
      configurationPath,
      "font.family",
      "must exactly name an installed font family",
    );
  return preliminary;
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

async function discoverFonts(
  options: LoadUserConfigurationOptions,
  configurationPath: string,
): Promise<ReadonlySet<string>> {
  try {
    return await options.discoverInstalledFontFamilies();
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
    "scrollback",
    "keyboard",
    "window",
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
  const keyboard = optionalObject(root.keyboard, configurationPath, "keyboard");
  const window = optionalObject(root.window, configurationPath, "window");
  if (font)
    rejectUnknownKeys(font, configurationPath, "font", ["family", "size"]);
  if (scrollback)
    rejectUnknownKeys(scrollback, configurationPath, "scrollback", ["lines"]);
  if (keyboard)
    rejectUnknownKeys(keyboard, configurationPath, "keyboard", ["optionAsAlt"]);
  if (window)
    rejectUnknownKeys(window, configurationPath, "window", ["alwaysOnTop"]);

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
    scrollbackLines,
    optionKeyMode,
    alwaysOnTop,
  });
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
