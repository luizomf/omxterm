import {
  isTerminalThemeColor,
  isTerminalThemeName,
  type TerminalThemeColors,
} from "./terminal-theme";

export const SETTINGS_THEME_COLOR_KEYS = [
  "background",
  "foreground",
  "red",
  "green",
  "yellow",
  "blue",
  "magenta",
  "cyan",
] as const;

// These bounds apply to both discovery and its IPC response.
export const MAX_SETTINGS_THEMES = 128;
export const MAX_SETTINGS_THEME_PATH_LENGTH = 4_096;
export const MAX_SETTINGS_THEME_REASON_LENGTH = 256;

export interface SettingsTheme {
  readonly path: string;
  readonly name: string;
  readonly colors: Pick<
    TerminalThemeColors,
    (typeof SETTINGS_THEME_COLOR_KEYS)[number]
  >;
}

export const SETTINGS_THEME_PROBLEMS = [
  "size",
  "type",
  "changed",
  "read",
  "invalid",
  "unknown",
] as const;
export type SettingsThemeProblem = (typeof SETTINGS_THEME_PROBLEMS)[number];

export interface SettingsThemesResult {
  readonly status: "ok" | "missing" | "unavailable";
  readonly themes: readonly SettingsTheme[];
  readonly invalid: readonly {
    readonly path: string;
    readonly reason: SettingsThemeProblem;
    readonly detail?: string;
  }[];
  readonly truncated: boolean;
  // Undefined means the configuration itself could not be read for discovery.
  readonly hasConfiguredTheme?: boolean;
  readonly selectedPath?: string;
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(
  value: Record<string, unknown>,
  keys: readonly string[],
): boolean {
  const actual = Object.keys(value);
  return (
    actual.length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}

// Forward slashes also work in Windows config.json paths. A backslash may be
// part of an actual filename on POSIX, so it cannot be rejected here.
function isThemePath(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= MAX_SETTINGS_THEME_PATH_LENGTH &&
    value.startsWith("themes/") &&
    value.endsWith(".json") &&
    !value.slice("themes/".length).includes("/") &&
    !value.includes("\0")
  );
}

function isReason(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= MAX_SETTINGS_THEME_REASON_LENGTH &&
    !/[\p{Cc}\p{Cf}\p{Cs}\p{Cn}\p{Zl}\p{Zp}]/u.test(value)
  );
}

function isSettingsTheme(value: unknown): value is SettingsTheme {
  if (
    !record(value) ||
    !exactKeys(value, ["path", "name", "colors"]) ||
    !isThemePath(value.path) ||
    !isTerminalThemeName(value.name) ||
    !record(value.colors) ||
    !exactKeys(value.colors, SETTINGS_THEME_COLOR_KEYS)
  )
    return false;
  const colors = value.colors;
  return SETTINGS_THEME_COLOR_KEYS.every((key) =>
    isTerminalThemeColor(colors[key]),
  );
}

function isInvalidTheme(
  value: unknown,
): value is SettingsThemesResult["invalid"][number] {
  if (!record(value)) return false;
  const keys =
    value.detail === undefined
      ? ["path", "reason"]
      : ["path", "reason", "detail"];
  return (
    exactKeys(value, keys) &&
    isThemePath(value.path) &&
    SETTINGS_THEME_PROBLEMS.some((reason) => reason === value.reason) &&
    (value.detail === undefined ||
      (value.reason === "invalid" && isReason(value.detail)))
  );
}

function isThemePresence(status: unknown, value: unknown): boolean {
  return (
    typeof value === "boolean" ||
    (status === "unavailable" && value === undefined)
  );
}

export function isSettingsThemesResult(
  value: unknown,
): value is SettingsThemesResult {
  if (!record(value)) return false;
  const keys = [
    "status",
    "themes",
    "invalid",
    "truncated",
    ...(value.hasConfiguredTheme === undefined ? [] : ["hasConfiguredTheme"]),
    ...(value.selectedPath === undefined ? [] : ["selectedPath"]),
  ];
  if (!exactKeys(value, keys)) return false;
  if (
    !["ok", "missing", "unavailable"].includes(value.status as string) ||
    !Array.isArray(value.themes) ||
    !Array.isArray(value.invalid) ||
    value.themes.length + value.invalid.length > MAX_SETTINGS_THEMES ||
    typeof value.truncated !== "boolean" ||
    !isThemePresence(value.status, value.hasConfiguredTheme)
  )
    return false;

  const paths = new Set<string>();
  for (const theme of value.themes) {
    if (!isSettingsTheme(theme) || paths.has(theme.path)) return false;
    paths.add(theme.path);
  }
  const selectablePaths = new Set(paths);
  for (const entry of value.invalid) {
    if (!isInvalidTheme(entry) || paths.has(entry.path)) return false;
    paths.add(entry.path);
  }
  if (value.status !== "ok")
    return (
      paths.size === 0 && !value.truncated && value.selectedPath === undefined
    );
  return (
    value.selectedPath === undefined ||
    (value.hasConfiguredTheme !== false &&
      isThemePath(value.selectedPath) &&
      selectablePaths.has(value.selectedPath))
  );
}
