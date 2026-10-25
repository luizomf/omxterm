import { isSupportedLanguage } from "./i18n";
import { isSettingsMessage, type SettingsMessage } from "./settings-messages";
import {
  MAX_SCROLLBACK_LINES,
  MAX_TERMINAL_FONT_SIZE,
  MAX_TERMINAL_LINE_HEIGHT,
  MAX_TERMINAL_PADDING,
  MIN_TERMINAL_FONT_SIZE,
  MIN_TERMINAL_LINE_HEIGHT,
  MIN_TERMINAL_PADDING,
} from "./user-configuration";

export const settingsIpc = {
  open: "settings:open",
  snapshot: "settings:snapshot",
  change: "settings:change",
  saveText: "settings:save-text",
} as const;

// When a saved change takes effect, as the existing setting lifetimes define.
export type SettingsLifetime = "live" | "new-tabs" | "new-windows" | "restart";

interface SettingsFieldDefinition {
  readonly lifetime: SettingsLifetime;
  readonly accepts: (value: unknown) => boolean;
}

const isBoolean = (value: unknown) => typeof value === "boolean";
const integer = (min: number, max: number) => (value: unknown) =>
  Number.isInteger(value) &&
  (value as number) >= min &&
  (value as number) <= max;
const oneOf = (values: readonly string[]) => (value: unknown) =>
  typeof value === "string" && values.includes(value);
const nonEmptyText = (value: unknown) =>
  typeof value === "string" &&
  value.length > 0 &&
  value.length <= 4_096 &&
  !value.includes("\0");
const padding = integer(MIN_TERMINAL_PADDING, MAX_TERMINAL_PADDING);

// The editable User Configuration fields, by their config.json path. The
// main-process loader stays the validation authority; these checks only bound
// what the renderer may ask main to write.
export const SETTINGS_FIELDS = {
  language: { lifetime: "live", accepts: isSupportedLanguage },
  confirmClose: { lifetime: "live", accepts: isBoolean },
  logLevel: { lifetime: "live", accepts: oneOf(["error", "info", "debug"]) },
  windowsShell: { lifetime: "new-tabs", accepts: nonEmptyText },
  "font.family": { lifetime: "restart", accepts: nonEmptyText },
  "font.size": {
    lifetime: "live",
    accepts: integer(MIN_TERMINAL_FONT_SIZE, MAX_TERMINAL_FONT_SIZE),
  },
  "font.lineHeight": {
    lifetime: "restart",
    accepts: (value: unknown) =>
      typeof value === "number" &&
      Number.isFinite(value) &&
      value >= MIN_TERMINAL_LINE_HEIGHT &&
      value <= MAX_TERMINAL_LINE_HEIGHT,
  },
  "font.ligatures": { lifetime: "live", accepts: isBoolean },
  "terminal.padding.top": { lifetime: "live", accepts: padding },
  "terminal.padding.right": { lifetime: "live", accepts: padding },
  "terminal.padding.bottom": { lifetime: "live", accepts: padding },
  "terminal.padding.left": { lifetime: "live", accepts: padding },
  "scrollback.lines": {
    lifetime: "live",
    accepts: integer(0, MAX_SCROLLBACK_LINES),
  },
  "keyboard.optionAsAlt": {
    lifetime: "live",
    accepts: oneOf(["none", "left", "right", "both"]),
  },
  "window.alwaysOnTop": { lifetime: "new-windows", accepts: isBoolean },
  "window.showTitleBar": { lifetime: "new-windows", accepts: isBoolean },
  "window.showTabBar": { lifetime: "new-windows", accepts: isBoolean },
  "theme.path": { lifetime: "live", accepts: nonEmptyText },
} as const satisfies Record<string, SettingsFieldDefinition>;

export type SettingsPath = keyof typeof SETTINGS_FIELDS;

// A graphical change sets one field, or removes it (null) so it inherits its
// default again. Removing a required group member is left to the validator.
export interface SettingsChange {
  readonly path: SettingsPath;
  readonly value: unknown;
}

export interface SettingsSnapshot {
  readonly configurationPath: string;
  // Selects platform-specific fields such as the Windows shell.
  readonly platform: string;
  // A digest of config.json's bytes, or "absent" when there is no file yet.
  readonly revision: string;
  // Decoded UTF-8 text (leading BOM omitted), or null when there is no file yet.
  readonly text: string | null;
  // The values each control shows: the file's own entries, falling back to
  // the effective defaults for omitted fields.
  readonly values: Readonly<Partial<Record<SettingsPath, unknown>>>;
  // Why config.json cannot be edited graphically right now, if it cannot.
  readonly problem?: SettingsMessage;
}

export type SettingsApplication =
  | { readonly applied: true; readonly notices: readonly SettingsMessage[] }
  | { readonly applied: false; readonly notice: SettingsMessage };

export type SettingsResult =
  | {
      readonly status: "saved";
      readonly snapshot: SettingsSnapshot;
      readonly application: SettingsApplication;
      // Deferred lifetimes of effective values changed by this saved candidate.
      readonly lifetimes: readonly Exclude<SettingsLifetime, "live">[];
    }
  | {
      readonly status: "rejected" | "conflict" | "failed";
      readonly message: SettingsMessage;
      readonly snapshot: SettingsSnapshot;
    };

export interface SettingsBridge {
  snapshot(): Promise<SettingsSnapshot>;
  change(change: SettingsChange): Promise<SettingsResult>;
  saveText(text: string, revision: string): Promise<SettingsResult>;
  onOpen(listener: () => void): () => void;
}

export const MAX_SETTINGS_TEXT_LENGTH = 1_048_576;

export function isSettingsPath(value: unknown): value is SettingsPath {
  return typeof value === "string" && Object.hasOwn(SETTINGS_FIELDS, value);
}

export function isSettingsChange(value: unknown): value is SettingsChange {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const keys = Object.keys(value);
  if (keys.length !== 2 || !keys.includes("path") || !keys.includes("value"))
    return false;
  const change = value as Record<string, unknown>;
  return (
    isSettingsPath(change.path) &&
    (change.value === null ||
      SETTINGS_FIELDS[change.path].accepts(change.value))
  );
}

export function isSettingsTextSave(
  value: unknown,
): value is { readonly text: string; readonly revision: string } {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const keys = Object.keys(value);
  const save = value as Record<string, unknown>;
  return (
    keys.length === 2 &&
    typeof save.text === "string" &&
    save.text.length <= MAX_SETTINGS_TEXT_LENGTH &&
    typeof save.revision === "string" &&
    save.revision.length > 0 &&
    save.revision.length <= 128
  );
}

const MAX_SETTINGS_MESSAGE_LENGTH = 65_536;
const isBoundedText = (value: unknown, max = MAX_SETTINGS_MESSAGE_LENGTH) =>
  typeof value === "string" && value.length <= max;

export function isSettingsSnapshot(value: unknown): value is SettingsSnapshot {
  if (typeof value !== "object" || value === null) return false;
  const snapshot = value as Record<string, unknown>;
  const values = snapshot.values;
  return (
    isBoundedText(snapshot.configurationPath) &&
    isBoundedText(snapshot.platform, 32) &&
    isBoundedText(snapshot.revision, 128) &&
    (snapshot.text === null ||
      isBoundedText(snapshot.text, MAX_SETTINGS_TEXT_LENGTH)) &&
    (snapshot.problem === undefined || isSettingsMessage(snapshot.problem)) &&
    typeof values === "object" &&
    values !== null &&
    Object.keys(values).every(isSettingsPath)
  );
}

export function isSettingsResult(value: unknown): value is SettingsResult {
  if (typeof value !== "object" || value === null) return false;
  const result = value as Record<string, unknown>;
  if (!isSettingsSnapshot(result.snapshot)) return false;
  if (result.status === "saved") {
    const application = result.application as Record<string, unknown> | null;
    return (
      typeof application === "object" &&
      application !== null &&
      Array.isArray(result.lifetimes) &&
      result.lifetimes.length <= 3 &&
      result.lifetimes.every(
        (lifetime: unknown) =>
          typeof lifetime === "string" &&
          ["new-tabs", "new-windows", "restart"].includes(lifetime),
      ) &&
      (application.applied === true
        ? Array.isArray(application.notices) &&
          application.notices.every(isSettingsMessage)
        : application.applied === false &&
          isSettingsMessage(application.notice))
    );
  }
  return (
    ["rejected", "conflict", "failed"].includes(result.status as string) &&
    isSettingsMessage(result.message)
  );
}
