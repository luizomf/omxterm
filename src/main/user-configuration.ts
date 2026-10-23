import { lstat, readFile, stat } from "node:fs/promises";
import path from "node:path";
import type {
  OperationalLogLevel,
  UserConfiguration,
} from "../shared/user-configuration";
import {
  DEFAULT_SCROLLBACK_LINES,
  DEFAULT_TERMINAL_FONT_LIGATURES,
  DEFAULT_TERMINAL_LINE_HEIGHT,
  DEFAULT_TERMINAL_PADDING,
  DEFAULT_TERMINAL_FONT_SIZE,
  MAX_TERMINAL_LINE_HEIGHT,
  MAX_TERMINAL_PADDING,
  MAX_SCROLLBACK_LINES,
  MAX_WINDOW_CORNER_RADIUS,
  MAX_TERMINAL_FONT_SIZE,
  MIN_TERMINAL_LINE_HEIGHT,
  MIN_TERMINAL_PADDING,
  MIN_TERMINAL_FONT_SIZE,
} from "../shared/user-configuration";
import type { InstalledFontFamilyMetrics } from "./installed-font-family";
import { isTerminalFontFamily } from "../shared/terminal-font-data";
import { DEFAULT_TERMINAL_THEME } from "../shared/terminal-theme";
import {
  canonicalAccelerator,
  DEFAULT_TERMINAL_KEYBINDS,
  isValidAccelerator,
  shadowedControlKeyBindings,
  terminalDefaultKeybinds,
  TERMINAL_ACTION_NAMES,
  type TerminalActionName,
  type TerminalKeybinds,
} from "../shared/terminal-keybinds";
import { loadTerminalTheme, TerminalThemeError } from "./terminal-theme";
import {
  fail,
  integerInRange,
  numberInRange,
  optionalBoolean,
  optionalEnum,
  optionalObject,
  rejectUnknownKeys,
  requireObject,
} from "./user-configuration-values";
import {
  UserConfigurationError,
  userConfigurationDiagnostic,
} from "./user-configuration-error";
export {
  UserConfigurationError,
  userConfigurationDiagnostic,
  configurationRejectionReason,
  type ConfigurationRejectionReason,
} from "./user-configuration-error";

export const USER_CONFIGURATION_VERSION = 1;

export const DEFAULT_USER_CONFIGURATION: UserConfiguration = Object.freeze({
  version: USER_CONFIGURATION_VERSION,
  confirmClose: true,
  logLevel: "info",
  fontSize: DEFAULT_TERMINAL_FONT_SIZE,
  fontLineHeight: DEFAULT_TERMINAL_LINE_HEIGHT,
  fontLigatures: DEFAULT_TERMINAL_FONT_LIGATURES,
  terminalPadding: DEFAULT_TERMINAL_PADDING,
  scrollbackLines: DEFAULT_SCROLLBACK_LINES,
  optionKeyMode: "none",
  alwaysOnTop: false,
  blur: false,
  transparency: 0,
  showTitleBar: true,
  showTabBar: true,
  cornerRadius: 0,
  autoHideTitleBar: false,
  terminalTheme: DEFAULT_TERMINAL_THEME,
  keybinds: DEFAULT_TERMINAL_KEYBINDS,
});

export interface LoadUserConfigurationOptions {
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly homeDirectory: string;
  readonly getInstalledFontFamilyMetrics: (
    family: string,
    fontSize: number,
  ) => Promise<InstalledFontFamilyMetrics | undefined>;
  readonly read?: typeof readFile;
  readonly inspectWindowsShell?: typeof stat;
  readonly platform?: NodeJS.Platform | string;
}

export interface LoadedUserConfiguration extends UserConfiguration {
  readonly configuredFontMetrics?: InstalledFontFamilyMetrics;
}

export type UserConfigurationFallbackSurface = "configuration" | "theme";

export interface UserConfigurationFallback {
  readonly surface: UserConfigurationFallbackSurface;
  readonly error: UserConfigurationError;
}

export interface UserConfigurationLoad {
  readonly configuration: LoadedUserConfiguration;
  readonly selectedTerminalThemePath?: string;
  readonly fallback?: UserConfigurationFallback;
  // Non-fatal notices for a valid configuration that stays active (#102).
  readonly warnings?: readonly string[];
}

export function userConfigurationFallbackNotice(
  fallback: UserConfigurationFallback,
): string {
  const activeDefaults =
    fallback.surface === "theme"
      ? "OMXTerm opened with the bundled omtheme Terminal Theme instead."
      : "OMXTerm opened with its built-in default settings instead.";
  return `${activeDefaults} ${fallback.error.message}`;
}

export function startupUserFileNotices(
  fallback: UserConfigurationFallback | undefined,
  warnings: readonly string[] | undefined,
): readonly string[] {
  return Object.freeze([
    ...(fallback ? [userConfigurationFallbackNotice(fallback)] : []),
    ...(warnings ?? []),
  ]);
}

// Warn about the swallowed control key, never the raw accelerator contents.
export function keybindPortabilityWarnings(
  keybinds: TerminalKeybinds,
  configurationPath: string,
  platform: string,
): readonly string[] {
  return shadowedControlKeyBindings(keybinds, platform).map(
    ({ action, controlKey, shadows }) =>
      userConfigurationDiagnostic(
        configurationPath,
        `keybinds.${action}`,
        `resolves to ${controlKey}, which shadows the terminal's ${shadows} control key on this platform. The keybind stays active, so ${controlKey} no longer reaches the shell`,
      ),
  );
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
): Promise<UserConfigurationLoad> {
  const defaultKeybinds = terminalDefaultKeybinds(options.platform ?? "darwin");
  const defaultConfiguration =
    defaultKeybinds === DEFAULT_TERMINAL_KEYBINDS
      ? DEFAULT_USER_CONFIGURATION
      : Object.freeze({
          ...DEFAULT_USER_CONFIGURATION,
          keybinds: defaultKeybinds,
        });
  const configurationPath = resolveUserConfigurationPath(
    options.environment,
    options.homeDirectory,
  );
  // A config.json failure uses defaults and keeps its precise diagnostic.
  const configurationFallback = (
    location: string | undefined,
    reason: string,
  ): UserConfigurationLoad =>
    Object.freeze({
      configuration: defaultConfiguration,
      fallback: Object.freeze({
        surface: "configuration" as const,
        error: new UserConfigurationError(configurationPath, location, reason),
      }),
    });

  let bytes: Uint8Array;
  try {
    bytes = await (options.read ?? readFile)(configurationPath);
  } catch (cause) {
    if (isNotFound(cause) && (await isPathAbsent(configurationPath)))
      return Object.freeze({ configuration: defaultConfiguration });
    return configurationFallback(undefined, "the file could not be read");
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    return configurationFallback(undefined, "the file is not valid UTF-8");
  }

  let document: unknown;
  try {
    document = JSON.parse(text) as unknown;
  } catch {
    return configurationFallback(undefined, "the file is not valid JSON");
  }
  const declaredFontFamily = configuredFontFamily(document);
  let preliminary: UserConfiguration;
  try {
    preliminary = validateUserConfiguration(
      document,
      configurationPath,
      new Set(declaredFontFamily === undefined ? [] : [declaredFontFamily]),
      defaultKeybinds,
      options.platform ?? "darwin",
    );
  } catch (cause) {
    if (cause instanceof UserConfigurationError)
      return configurationFallback(cause.location, cause.reason);
    throw cause;
  }
  if (
    (options.platform ?? "darwin") === "win32" &&
    preliminary.windowsShell !== undefined
  ) {
    let finalTargetIsFile: boolean;
    try {
      finalTargetIsFile = (
        await (options.inspectWindowsShell ?? stat)(preliminary.windowsShell)
      ).isFile();
    } catch {
      return configurationFallback(
        "windowsShell",
        "the final target could not be inspected",
      );
    }
    if (!finalTargetIsFile)
      return configurationFallback(
        "windowsShell",
        "the final target must be an existing regular file",
      );
  }
  // Keybinds are valid but may still shadow PTY control keys on this platform;
  // that is a non-fatal warning, not a fallback (#102).
  const keybindWarnings = keybindPortabilityWarnings(
    preliminary.keybinds,
    configurationPath,
    options.platform ?? "darwin",
  );
  const warnings =
    keybindWarnings.length > 0
      ? { warnings: Object.freeze(keybindWarnings) }
      : {};
  const configuredThemePath = selectedTerminalThemePath(
    document,
    configurationPath,
  );
  let terminalTheme = DEFAULT_TERMINAL_THEME;
  let themeFallback: UserConfigurationFallback | undefined;
  if (configuredThemePath) {
    try {
      terminalTheme = await loadTerminalTheme(configuredThemePath);
    } catch (cause) {
      if (!(cause instanceof TerminalThemeError)) throw cause;
      themeFallback = Object.freeze({
        surface: "theme" as const,
        error: new UserConfigurationError(
          configurationPath,
          "theme.path",
          cause.message,
        ),
      });
    }
  }
  if (preliminary.fontFamily !== undefined) {
    let configuredFontMetrics: InstalledFontFamilyMetrics | undefined;
    try {
      configuredFontMetrics = await options.getInstalledFontFamilyMetrics(
        preliminary.fontFamily,
        preliminary.fontSize,
      );
    } catch (cause) {
      const detail =
        cause instanceof Error
          ? cause.message.slice(0, 2_048)
          : "installed font families could not be discovered";
      return configurationFallback(
        "font.family",
        `installed font could not be validated: ${detail}`,
      );
    }
    if (configuredFontMetrics === undefined)
      return configurationFallback(
        "font.family",
        "must exactly name an installed font family",
      );
    return Object.freeze({
      configuration: Object.freeze({
        ...preliminary,
        terminalTheme,
        configuredFontMetrics,
      }),
      ...(configuredThemePath
        ? { selectedTerminalThemePath: configuredThemePath }
        : {}),
      ...(themeFallback ? { fallback: themeFallback } : {}),
      ...warnings,
    });
  }
  return Object.freeze({
    configuration: Object.freeze({ ...preliminary, terminalTheme }),
    ...(configuredThemePath
      ? { selectedTerminalThemePath: configuredThemePath }
      : {}),
    ...(themeFallback ? { fallback: themeFallback } : {}),
    ...warnings,
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

export function validateUserConfiguration(
  document: unknown,
  configurationPath: string,
  installedFontFamilies: ReadonlySet<string>,
  defaultKeybinds: TerminalKeybinds = DEFAULT_TERMINAL_KEYBINDS,
  platform: string = "darwin",
): UserConfiguration {
  const root = requireObject(document, configurationPath, "$", "an object");
  rejectUnknownKeys(root, configurationPath, "$", [
    "version",
    "confirmClose",
    "logLevel",
    "windowsShell",
    "font",
    "terminal",
    "scrollback",
    "keyboard",
    "window",
    "theme",
    "keybinds",
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
  const keybinds = optionalObject(root.keybinds, configurationPath, "keybinds");
  if (font)
    rejectUnknownKeys(font, configurationPath, "font", [
      "family",
      "size",
      "lineHeight",
      "ligatures",
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
    rejectUnknownKeys(window, configurationPath, "window", [
      "alwaysOnTop",
      "blur",
      "transparency",
      "showTitleBar",
      "showTabBar",
      "cornerRadius",
      "autoHideTitleBar",
    ]);
  if (theme) rejectUnknownKeys(theme, configurationPath, "theme", ["path"]);
  if (keybinds)
    rejectUnknownKeys(
      keybinds,
      configurationPath,
      "keybinds",
      TERMINAL_ACTION_NAMES,
    );
  const terminalKeybinds = validateTerminalKeybinds(
    keybinds,
    configurationPath,
    defaultKeybinds,
    platform,
  );

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

  const windowsShell = validateWindowsShell(
    root.windowsShell,
    configurationPath,
    platform,
  );

  const fontFamily = font?.family;
  if (fontFamily !== undefined) {
    if (!isTerminalFontFamily(fontFamily))
      fail(
        configurationPath,
        "font.family",
        "must be a printable family name of at most 256 characters",
      );
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
  const fontLigatures = optionalBoolean(
    font?.ligatures,
    configurationPath,
    "font.ligatures",
    DEFAULT_TERMINAL_FONT_LIGATURES,
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
    ...windowsShellProperty(windowsShell),
    ...(fontFamily === undefined ? {} : { fontFamily }),
    fontSize,
    fontLineHeight,
    fontLigatures,
    terminalPadding,
    scrollbackLines,
    optionKeyMode,
    ...windowPreferences(window, configurationPath),
    terminalTheme: DEFAULT_TERMINAL_THEME,
    keybinds: terminalKeybinds,
  });
}

function windowPreferences(
  window: Record<string, unknown> | undefined,
  configurationPath: string,
) {
  const read = (key: string, fallback: boolean) =>
    optionalBoolean(
      window?.[key],
      configurationPath,
      `window.${key}`,
      fallback,
    );
  return {
    alwaysOnTop: read("alwaysOnTop", false),
    blur: read("blur", false),
    transparency: numberInRange(
      window?.transparency,
      configurationPath,
      "window.transparency",
      0,
      1,
      0,
    ),
    showTitleBar: read("showTitleBar", true),
    showTabBar: read("showTabBar", true),
    cornerRadius: integerInRange(
      window?.cornerRadius,
      configurationPath,
      "window.cornerRadius",
      0,
      MAX_WINDOW_CORNER_RADIUS,
      0,
    ),
    autoHideTitleBar: read("autoHideTitleBar", false),
  };
}

function windowsShellProperty(windowsShell: string | undefined): {
  readonly windowsShell?: string;
} {
  return windowsShell === undefined ? {} : { windowsShell };
}

function validateWindowsShell(
  value: unknown,
  configurationPath: string,
  platform: string,
): string | undefined {
  if (value === undefined) return undefined;
  if (typeof value !== "string" || value.length === 0 || value.includes("\0"))
    fail(
      configurationPath,
      "windowsShell",
      "must be a non-empty string without a NUL character",
    );
  if (platform === "win32" && !path.win32.isAbsolute(value))
    fail(
      configurationPath,
      "windowsShell",
      "must be an absolute Windows filesystem path",
    );
  return value;
}

function validateTerminalKeybinds(
  keybinds: Record<string, unknown> | undefined,
  configurationPath: string,
  defaultKeybinds: TerminalKeybinds,
  platform: string,
): TerminalKeybinds {
  if (!keybinds) return defaultKeybinds;
  const effective: Record<TerminalActionName, string> = {
    ...defaultKeybinds,
  };
  for (const action of TERMINAL_ACTION_NAMES) {
    const value = keybinds[action];
    if (value === undefined) continue;
    if (typeof value !== "string" || !isValidAccelerator(value))
      fail(
        configurationPath,
        `keybinds.${action}`,
        "must be an accelerator with at least one non-Shift modifier and one key",
      );
    effective[action] = value;
  }
  // Duplicates are judged on the effective map: a remap that collides with
  // another action's remaining default is the same error as two explicit
  // entries colliding. Diagnostics name actions, never accelerator contents.
  const actionsByAccelerator = new Map<string, TerminalActionName>();
  for (const action of TERMINAL_ACTION_NAMES) {
    const canonical = canonicalAccelerator(effective[action], platform);
    if (canonical === undefined)
      fail(
        configurationPath,
        `keybinds.${action}`,
        "must be an accelerator with at least one non-Shift modifier and one key",
      );
    const holder = actionsByAccelerator.get(canonical);
    if (holder === undefined) {
      actionsByAccelerator.set(canonical, action);
      continue;
    }
    // Defaults never collide with each other, so blame a remapped entry.
    const blamed = action in keybinds ? action : holder;
    const other = blamed === action ? holder : action;
    fail(
      configurationPath,
      `keybinds.${blamed}`,
      `conflicts with the "${other}" keybind`,
    );
  }
  return Object.freeze(effective);
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
