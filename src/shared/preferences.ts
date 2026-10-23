import {
  MAX_SCROLLBACK_LINES,
  MAX_TERMINAL_FONT_SIZE,
  MAX_TERMINAL_LINE_HEIGHT,
  MAX_TERMINAL_PADDING,
  MAX_WINDOW_CORNER_RADIUS,
  MIN_TERMINAL_FONT_SIZE,
  MIN_TERMINAL_LINE_HEIGHT,
  MIN_TERMINAL_PADDING,
  type OperationalLogLevel,
  type OptionKeyMode,
  type TerminalPadding,
} from "./user-configuration";
import {
  TERMINAL_ACTION_NAMES,
  type TerminalActionName,
} from "./terminal-keybinds";
import { TERMINAL_THEME_COLOR_KEYS } from "./terminal-theme";

export const preferencesIpc = {
  get: "preferences:get",
  save: "preferences:save",
  reset: "preferences:reset",
  // Main asks the focused window to open the Preferences dialog.
  open: "preferences:open",
  // The shortcut recorder starts or stops receiving every key press.
  capture: "preferences:capture",
  capturedKey: "preferences:captured-key",
  // The config.json text for the built-in editor, and saving it whole.
  readFile: "preferences:read-file",
  writeFile: "preferences:write-file",
} as const;

export const MAX_CONFIGURATION_TEXT = 1024 * 1024;

export interface PreferencesFile {
  readonly path: string;
  readonly text: string;
}

export function isConfigurationText(value: unknown): value is string {
  return typeof value === "string" && value.length <= MAX_CONFIGURATION_TEXT;
}

export function isPreferencesFile(value: unknown): value is PreferencesFile {
  return (
    isRecord(value) &&
    typeof value.path === "string" &&
    value.path.length > 0 &&
    value.path.length <= 4_096 &&
    isConfigurationText(value.text)
  );
}

export const LOG_LEVELS = ["error", "info", "debug"] as const;
export const OPTION_KEY_MODES = ["none", "left", "right", "both"] as const;

// The settings the Preferences dialog edits. Everything except the last two
// lives in config.json; those two are Application Data toggles.
export interface PreferencesValues {
  // A built-in scheme id, or "file:<name>.json" for a theme in themes/.
  readonly scheme: string;
  // The empty string selects the bundled font.
  readonly fontFamily: string;
  readonly fontSize: number;
  readonly fontLineHeight: number;
  readonly fontLigatures: boolean;
  readonly padding: TerminalPadding;
  readonly transparency: number;
  readonly blur: boolean;
  readonly scrollbackLines: number;
  readonly optionKeyMode: OptionKeyMode;
  readonly showTitleBar: boolean;
  readonly showTabBar: boolean;
  readonly cornerRadius: number;
  readonly autoHideTitleBar: boolean;
  readonly alwaysOnTop: boolean;
  readonly confirmClose: boolean;
  readonly logLevel: OperationalLogLevel;
  // Hovering a printed file name shows a preview card.
  readonly filePreview: boolean;
  // Windows only; the empty string uses the default shell.
  readonly windowsShell: string;
  readonly keybinds: Readonly<Record<TerminalActionName, string>>;
  readonly restoreWindows: boolean;
  readonly highlightOutput: boolean;
}

export type PreferencesPatch = Partial<
  Omit<PreferencesValues, "padding" | "keybinds">
> & {
  readonly padding?: Partial<TerminalPadding>;
  readonly keybinds?: Partial<Record<TerminalActionName, string>>;
};

export interface PreferencesScheme {
  readonly id: string;
  readonly name: string;
  readonly builtIn: boolean;
  // Enough colors to draw a preview swatch.
  readonly background: string;
  readonly foreground: string;
  readonly palette: readonly string[];
}

export interface PreferencesSnapshot {
  readonly values: PreferencesValues;
  readonly defaults: PreferencesValues;
  readonly schemes: readonly PreferencesScheme[];
  // Installed monospace families to suggest; free text is still accepted.
  readonly fontFamilies: readonly string[];
  readonly platform: string;
  // Why config.json is not active right now, when it is not.
  readonly problem?: string;
}

export type PreferencesSaveResult =
  | { readonly ok: true; readonly snapshot: PreferencesSnapshot }
  | {
      readonly ok: false;
      readonly error: string;
      readonly snapshot: PreferencesSnapshot;
    };

const SCHEME_ID = /^(?:[a-z0-9][a-z0-9-]{0,63}|file:[\w .-]{1,96}\.json)$/u;
const HEX_COLOR = /^#[0-9a-f]{6}$/iu;
const MAX_TEXT = 256;
const MAX_LIST = 512;

export function isSchemeId(value: unknown): value is string {
  return typeof value === "string" && SCHEME_ID.test(value);
}

type Check = (value: unknown) => boolean;

const isBoolean: Check = (value) => typeof value === "boolean";
const text: Check = (value) =>
  typeof value === "string" && value.length <= MAX_TEXT;
const integerIn =
  (minimum: number, maximum: number): Check =>
  (value) =>
    Number.isInteger(value) &&
    (value as number) >= minimum &&
    (value as number) <= maximum;
const numberIn =
  (minimum: number, maximum: number): Check =>
  (value) =>
    typeof value === "number" &&
    Number.isFinite(value) &&
    value >= minimum &&
    value <= maximum;
const oneOf =
  (values: readonly string[]): Check =>
  (value) =>
    typeof value === "string" && values.includes(value);

const SCALAR_CHECKS: Readonly<
  Record<Exclude<keyof PreferencesValues, "padding" | "keybinds">, Check>
> = {
  scheme: isSchemeId,
  fontFamily: text,
  fontSize: integerIn(MIN_TERMINAL_FONT_SIZE, MAX_TERMINAL_FONT_SIZE),
  fontLineHeight: numberIn(MIN_TERMINAL_LINE_HEIGHT, MAX_TERMINAL_LINE_HEIGHT),
  fontLigatures: isBoolean,
  transparency: numberIn(0, 1),
  blur: isBoolean,
  scrollbackLines: integerIn(0, MAX_SCROLLBACK_LINES),
  optionKeyMode: oneOf(OPTION_KEY_MODES),
  showTitleBar: isBoolean,
  showTabBar: isBoolean,
  cornerRadius: integerIn(0, MAX_WINDOW_CORNER_RADIUS),
  autoHideTitleBar: isBoolean,
  alwaysOnTop: isBoolean,
  confirmClose: isBoolean,
  logLevel: oneOf(LOG_LEVELS),
  filePreview: isBoolean,
  windowsShell: (value) =>
    typeof value === "string" && value.length <= 4_096 && !value.includes("\0"),
  restoreWindows: isBoolean,
  highlightOutput: isBoolean,
};

const PADDING_SIDES = ["top", "right", "bottom", "left"] as const;
const isPaddingValue = integerIn(MIN_TERMINAL_PADDING, MAX_TERMINAL_PADDING);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isKeybindMap(value: unknown, complete: boolean): boolean {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  if (complete && keys.length !== TERMINAL_ACTION_NAMES.length) return false;
  return keys.every(
    (key) =>
      (TERMINAL_ACTION_NAMES as readonly string[]).includes(key) &&
      text(value[key]),
  );
}

function isPadding(value: unknown, complete: boolean): boolean {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  if (complete && keys.length !== PADDING_SIDES.length) return false;
  return keys.every(
    (key) =>
      (PADDING_SIDES as readonly string[]).includes(key) &&
      isPaddingValue(value[key]),
  );
}

// A patch names only known settings, each with an in-range value. config.json
// validation in main still decides (fonts, keybind syntax and conflicts).
export function isPreferencesPatch(value: unknown): value is PreferencesPatch {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value);
  if (keys.length === 0 || keys.length > 32) return false;
  return keys.every((key) => {
    if (key === "padding") return isPadding(value.padding, false);
    if (key === "keybinds") return isKeybindMap(value.keybinds, false);
    const check = SCALAR_CHECKS[key as keyof typeof SCALAR_CHECKS];
    return check !== undefined && check(value[key]);
  });
}

export function isPreferencesValues(
  value: unknown,
): value is PreferencesValues {
  if (!isRecord(value)) return false;
  const scalars = Object.keys(SCALAR_CHECKS) as (keyof typeof SCALAR_CHECKS)[];
  return (
    Object.keys(value).length === scalars.length + 2 &&
    scalars.every((key) => SCALAR_CHECKS[key](value[key])) &&
    isPadding(value.padding, true) &&
    isKeybindMap(value.keybinds, true)
  );
}

function isScheme(value: unknown): value is PreferencesScheme {
  return (
    isRecord(value) &&
    isSchemeId(value.id) &&
    text(value.name) &&
    isBoolean(value.builtIn) &&
    typeof value.background === "string" &&
    HEX_COLOR.test(value.background) &&
    typeof value.foreground === "string" &&
    HEX_COLOR.test(value.foreground) &&
    Array.isArray(value.palette) &&
    value.palette.length <= TERMINAL_THEME_COLOR_KEYS.length &&
    value.palette.every(
      (color) => typeof color === "string" && HEX_COLOR.test(color),
    )
  );
}

export function isPreferencesSnapshot(
  value: unknown,
): value is PreferencesSnapshot {
  return (
    isRecord(value) &&
    isPreferencesValues(value.values) &&
    isPreferencesValues(value.defaults) &&
    Array.isArray(value.schemes) &&
    value.schemes.length <= MAX_LIST &&
    value.schemes.every(isScheme) &&
    Array.isArray(value.fontFamilies) &&
    value.fontFamilies.length <= MAX_LIST &&
    value.fontFamilies.every(text) &&
    text(value.platform) &&
    (value.problem === undefined ||
      (typeof value.problem === "string" && value.problem.length <= 4_096))
  );
}

export function isPreferencesSaveResult(
  value: unknown,
): value is PreferencesSaveResult {
  if (!isRecord(value) || !isPreferencesSnapshot(value.snapshot)) return false;
  return value.ok === true
    ? Object.keys(value).length === 2
    : value.ok === false &&
        typeof value.error === "string" &&
        value.error.length <= 4_096;
}

export interface CapturedKeyPress {
  readonly key: string;
  readonly code: string;
  readonly control: boolean;
  readonly meta: boolean;
  readonly alt: boolean;
  readonly shift: boolean;
}

export function isCapturedKeyPress(value: unknown): value is CapturedKeyPress {
  return (
    isRecord(value) &&
    Object.keys(value).length === 6 &&
    typeof value.key === "string" &&
    value.key.length <= 32 &&
    typeof value.code === "string" &&
    value.code.length <= 32 &&
    ["control", "meta", "alt", "shift"].every((name) => isBoolean(value[name]))
  );
}
