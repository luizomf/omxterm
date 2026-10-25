import {
  isValidAccelerator,
  MAX_ACCELERATOR_LENGTH,
  TERMINAL_ACTION_NAMES,
  type TerminalActionName,
} from "./terminal-keybinds";

// How one action's shortcut is set in config.json: inherited from the
// built-in default (no entry), explicitly unbound (null) or custom.
export type KeybindState = "inherit" | "unbound" | "custom";

export type KeybindChoice =
  | { readonly state: "inherit" }
  | { readonly state: "unbound" }
  | { readonly state: "custom"; readonly accelerator: string };

export interface SettingsKeybindChange {
  readonly action: TerminalActionName;
  readonly choice: KeybindChoice;
}

// What the Shortcuts page shows for one action.
export interface SettingsKeybind {
  readonly effective: string | null;
  readonly state: KeybindState;
}

// A key recorded by main while capture owns the keyboard: the accelerator it
// spells and the end of capture, a cancellation (Escape or timeout), or a key
// that cannot be a shortcut on its own, after which capture continues.
export type CapturedShortcut =
  | { readonly accelerator: string }
  | { readonly cancelled: true }
  | { readonly invalid: true };

const ACTIONS = new Set<string>(TERMINAL_ACTION_NAMES);

export function isTerminalActionName(
  value: unknown,
): value is TerminalActionName {
  return typeof value === "string" && ACTIONS.has(value);
}

const isAccelerator = (value: unknown): value is string =>
  typeof value === "string" &&
  value.length <= MAX_ACCELERATOR_LENGTH &&
  isValidAccelerator(value);

export function isSettingsKeybindChange(
  value: unknown,
): value is SettingsKeybindChange {
  if (!hasExactKeys(value, ["action", "choice"])) return false;
  const choice = value.choice;
  return (
    isTerminalActionName(value.action) &&
    ((hasExactKeys(choice, ["state"]) &&
      (choice.state === "inherit" || choice.state === "unbound")) ||
      (hasExactKeys(choice, ["state", "accelerator"]) &&
        choice.state === "custom" &&
        isAccelerator(choice.accelerator)))
  );
}

export function isSettingsKeybinds(
  value: unknown,
): value is Readonly<Partial<Record<TerminalActionName, SettingsKeybind>>> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  return Object.entries(value).every(
    ([action, keybind]) =>
      isTerminalActionName(action) &&
      hasExactKeys(keybind, ["effective", "state"]) &&
      (keybind.effective === null || isAccelerator(keybind.effective)) &&
      (keybind.state === "inherit" ||
        keybind.state === "unbound" ||
        keybind.state === "custom"),
  );
}

export function isCapturedShortcut(value: unknown): value is CapturedShortcut {
  return (
    (hasExactKeys(value, ["accelerator"]) &&
      isAccelerator(value.accelerator)) ||
    (hasExactKeys(value, ["cancelled"]) && value.cancelled === true) ||
    (hasExactKeys(value, ["invalid"]) && value.invalid === true)
  );
}

function hasExactKeys<Key extends string>(
  value: unknown,
  keys: readonly Key[],
): value is Record<Key, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const actual = Object.keys(value);
  return (
    actual.length === keys.length && keys.every((key) => actual.includes(key))
  );
}
