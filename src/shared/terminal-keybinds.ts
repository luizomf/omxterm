// User-facing keybind action vocabulary. These names are the stable
// configuration keys in config.json; future actions join this list without a
// schema change.
export const TERMINAL_ACTION_NAMES = [
  "quit",
  "copy",
  "paste",
  "selectAll",
  "newWindow",
  "closeWindow",
  "newTab",
  "closeTab",
  "nextTab",
  "previousTab",
  "selectTab1",
  "selectTab2",
  "selectTab3",
  "selectTab4",
  "selectTab5",
  "selectTab6",
  "selectTab7",
  "selectTab8",
  "selectTab9",
  "zoomIn",
  "zoomOut",
  "actualSize",
  "toggleFullScreen",
  "toggleSnippets",
  "toggleTabBar",
  "toggleTitleBar",
  "reloadConfig",
  "splitRight",
  "splitDown",
  "closePane",
  "focusNextPane",
  "focusPreviousPane",
  "focusPaneLeft",
  "focusPaneRight",
  "focusPaneUp",
  "focusPaneDown",
  "toggleMaximizePane",
  "equalizePanes",
  "toggleBroadcast",
  "toggleSessions",
  "toggleCommands",
  "commandPalette",
  "find",
  "preferences",
  "toggleFiles",
  "toggleAssistant",
  "roundMore",
  "roundLess",
  "autoHideTitleBar",
  "alwaysShowTitleBar",
  "toggleAlwaysOnTop",
  "toggleDevTools",
  "openLocalImage",
  "toggleHighlighting",
  "highlightRules",
  "backUpSettings",
  "restoreSettings",
  "toggleRestoreWindows",
  "about",
] as const;

export type TerminalActionName = (typeof TERMINAL_ACTION_NAMES)[number];

export type TerminalKeybinds = Readonly<Record<TerminalActionName, string>>;

// Following the macOS convention, Cmd+W closes the selected tab and closing
// the window moved to Cmd+Shift+W (ADR 0016).
export const DEFAULT_TERMINAL_KEYBINDS: TerminalKeybinds = Object.freeze({
  quit: "CommandOrControl+Q",
  copy: "CommandOrControl+C",
  paste: "CommandOrControl+V",
  selectAll: "CommandOrControl+A",
  newWindow: "CommandOrControl+N",
  closeWindow: "CommandOrControl+Shift+W",
  newTab: "CommandOrControl+T",
  closeTab: "CommandOrControl+W",
  nextTab: "Control+Tab",
  previousTab: "Control+Shift+Tab",
  selectTab1: "CommandOrControl+1",
  selectTab2: "CommandOrControl+2",
  selectTab3: "CommandOrControl+3",
  selectTab4: "CommandOrControl+4",
  selectTab5: "CommandOrControl+5",
  selectTab6: "CommandOrControl+6",
  selectTab7: "CommandOrControl+7",
  selectTab8: "CommandOrControl+8",
  selectTab9: "CommandOrControl+9",
  zoomIn: "CommandOrControl+Plus",
  zoomOut: "CommandOrControl+-",
  actualSize: "CommandOrControl+0",
  toggleFullScreen: "Control+Command+F",
  toggleSnippets: "CommandOrControl+Shift+S",
  toggleTabBar: "CommandOrControl+Shift+B",
  toggleTitleBar: "CommandOrControl+Shift+D",
  reloadConfig: "CommandOrControl+Shift+,",
  splitRight: "Command+D",
  splitDown: "Command+Shift+E",
  closePane: "Command+Alt+W",
  focusNextPane: "Command+]",
  focusPreviousPane: "Command+[",
  focusPaneLeft: "Command+Alt+Left",
  focusPaneRight: "Command+Alt+Right",
  focusPaneUp: "Command+Alt+Up",
  focusPaneDown: "Command+Alt+Down",
  toggleMaximizePane: "Command+Shift+Enter",
  equalizePanes: "Command+Alt+0",
  toggleBroadcast: "Command+Alt+I",
  toggleSessions: "Command+Shift+J",
  toggleCommands: "Command+Shift+M",
  commandPalette: "Command+Shift+P",
  find: "Command+F",
  preferences: "Command+,",
  toggleFiles: "Command+Shift+L",
  toggleAssistant: "Command+Shift+Y",
  // Every menu item has a shortcut; the rarer ones use Cmd+Option+Shift.
  roundMore: "Command+Alt+Shift+R",
  roundLess: "Command+Alt+Shift+E",
  autoHideTitleBar: "Command+Alt+Shift+H",
  alwaysShowTitleBar: "Command+Alt+Shift+V",
  toggleAlwaysOnTop: "Command+Alt+Shift+T",
  toggleDevTools: "Command+Alt+Shift+I",
  openLocalImage: "Command+Alt+Shift+O",
  toggleHighlighting: "Command+Alt+Shift+C",
  highlightRules: "Command+Alt+Shift+G",
  backUpSettings: "Command+Alt+Shift+B",
  restoreSettings: "Command+Alt+Shift+U",
  toggleRestoreWindows: "Command+Alt+Shift+W",
  about: "Command+Alt+Shift+A",
});

// Linux and Windows share the conventional shifted terminal shortcuts so
// ordinary Ctrl shell and TUI input remains PTY input (#61).
const SHIFTED_TERMINAL_KEYBINDS: TerminalKeybinds = Object.freeze({
  quit: "Control+Alt+Shift+Q",
  copy: "Control+Shift+C",
  paste: "Control+Shift+V",
  selectAll: "Control+Shift+A",
  newWindow: "Control+Shift+N",
  closeWindow: "Control+Shift+Q",
  newTab: "Control+Shift+T",
  closeTab: "Control+Shift+W",
  nextTab: "Control+PageDown",
  previousTab: "Control+PageUp",
  selectTab1: "Alt+1",
  selectTab2: "Alt+2",
  selectTab3: "Alt+3",
  selectTab4: "Alt+4",
  selectTab5: "Alt+5",
  selectTab6: "Alt+6",
  selectTab7: "Alt+7",
  selectTab8: "Alt+8",
  selectTab9: "Alt+9",
  zoomIn: "Control+Plus",
  zoomOut: "Control+-",
  actualSize: "Control+0",
  toggleFullScreen: "Control+Shift+F",
  toggleSnippets: "Control+Shift+S",
  toggleTabBar: "Control+Shift+B",
  toggleTitleBar: "Control+Shift+D",
  reloadConfig: "Control+Shift+,",
  // Pane shortcuts follow AshyTerm where they do not collide with OMXTerm's
  // own defaults, and avoid Alt+Arrow (fish word movement) and Ctrl+Alt+Arrow
  // (GNOME workspace switching).
  splitRight: "Control+Shift+O",
  splitDown: "Control+Shift+E",
  closePane: "Control+Shift+K",
  focusNextPane: "Control+Shift+]",
  focusPreviousPane: "Control+Shift+[",
  focusPaneLeft: "Alt+Shift+Left",
  focusPaneRight: "Alt+Shift+Right",
  focusPaneUp: "Alt+Shift+Up",
  focusPaneDown: "Alt+Shift+Down",
  toggleMaximizePane: "Control+Shift+Z",
  equalizePanes: "Control+Shift+0",
  toggleBroadcast: "Control+Shift+I",
  // AshyTerm's Sessions sidebar shortcut.
  toggleSessions: "Control+Shift+H",
  // AshyTerm's Command Manager shortcut.
  toggleCommands: "Control+Shift+M",
  // AshyTerm's command palette shortcut.
  commandPalette: "Control+Shift+P",
  // Ctrl+Shift+F is Toggle Full Screen here.
  find: "Control+Shift+G",
  // Ctrl+, would take the physical comma key from some keyboard layouts and
  // Ctrl+Shift+, is Reload Configuration here.
  preferences: "Control+Shift+X",
  // AshyTerm's Ctrl+Shift+E is Split Down here.
  toggleFiles: "Control+Shift+L",
  toggleAssistant: "Control+Shift+Y",
  // Every menu item has a shortcut; the rarer ones use Ctrl+Alt+Shift, which
  // no terminal program reads.
  roundMore: "Control+Alt+Shift+R",
  roundLess: "Control+Alt+Shift+E",
  autoHideTitleBar: "Control+Alt+Shift+H",
  alwaysShowTitleBar: "Control+Alt+Shift+V",
  toggleAlwaysOnTop: "Control+Alt+Shift+T",
  toggleDevTools: "Control+Alt+Shift+I",
  openLocalImage: "Control+Alt+Shift+O",
  toggleHighlighting: "Control+Alt+Shift+C",
  highlightRules: "Control+Alt+Shift+G",
  backUpSettings: "Control+Alt+Shift+B",
  restoreSettings: "Control+Alt+Shift+U",
  toggleRestoreWindows: "Control+Alt+Shift+W",
  about: "Control+Alt+Shift+A",
});

export function terminalDefaultKeybinds(platform: string): TerminalKeybinds {
  return platform === "linux" || platform === "win32"
    ? SHIFTED_TERMINAL_KEYBINDS
    : DEFAULT_TERMINAL_KEYBINDS;
}

export const MAX_ACCELERATOR_LENGTH = 64;

// Electron accelerator grammar, case-insensitive. Shift alone is excluded from
// the required modifiers: a bare or Shift-only accelerator would swallow plain
// typing before it reaches the terminal.
const COMMAND_MODIFIERS = new Set(["command", "cmd", "super", "meta"]);
const COMMAND_OR_CONTROL_MODIFIERS = new Set(["commandorcontrol", "cmdorctrl"]);
const CONTROL_MODIFIERS = new Set(["control", "ctrl"]);
const ALT_MODIFIERS = new Set(["alt", "option"]);
const SHIFT_MODIFIERS = new Set(["shift"]);

const NAMED_KEYS = new Set([
  "plus",
  "space",
  "tab",
  "capslock",
  "numlock",
  "scrolllock",
  "backspace",
  "delete",
  "insert",
  "return",
  "enter",
  "up",
  "down",
  "left",
  "right",
  "home",
  "end",
  "pageup",
  "pagedown",
  "escape",
  "esc",
  "volumeup",
  "volumedown",
  "volumemute",
  "medianexttrack",
  "mediaprevioustrack",
  "mediastop",
  "mediaplaypause",
  "printscreen",
  ...Array.from({ length: 24 }, (_, index) => `f${index + 1}`),
  ...Array.from({ length: 10 }, (_, index) => `num${index}`),
  "numdec",
  "numadd",
  "numsub",
  "nummult",
  "numdiv",
]);

interface ParsedAccelerator {
  readonly modifiers: ReadonlySet<"cmd" | "ctrl" | "alt" | "altgr" | "shift">;
  readonly key: string;
  readonly logicalKey: string;
  readonly logicalShift: boolean;
}

function parseAccelerator(
  value: string,
  platform: string = "darwin",
): ParsedAccelerator | undefined {
  if (
    value.length === 0 ||
    value.length > MAX_ACCELERATOR_LENGTH ||
    value !== value.trim()
  )
    return undefined;
  const segments = value.split("+");
  // "Cmd+-" parses as ["Cmd", "-"]; a trailing empty segment means the key
  // itself was "+", which must be written as "Plus".
  const rawKey = segments.pop();
  if (rawKey === undefined || rawKey.length === 0) return undefined;
  const modifiers = new Set<"cmd" | "ctrl" | "alt" | "altgr" | "shift">();
  for (const segment of segments) {
    const modifier = segment.toLowerCase();
    if (COMMAND_MODIFIERS.has(modifier)) modifiers.add("cmd");
    else if (COMMAND_OR_CONTROL_MODIFIERS.has(modifier))
      modifiers.add(platform === "darwin" ? "cmd" : "ctrl");
    else if (CONTROL_MODIFIERS.has(modifier)) modifiers.add("ctrl");
    else if (ALT_MODIFIERS.has(modifier)) modifiers.add("alt");
    else if (modifier === "altgr") modifiers.add("altgr");
    else if (SHIFT_MODIFIERS.has(modifier)) modifiers.add("shift");
    else return undefined;
  }
  if (
    !modifiers.has("cmd") &&
    !modifiers.has("ctrl") &&
    !modifiers.has("alt") &&
    !modifiers.has("altgr")
  )
    return undefined;
  const key = rawKey.toLowerCase();
  const isSingleCharacter =
    rawKey.length === 1 && rawKey >= "!" && rawKey <= "~";
  if (!isSingleCharacter && !NAMED_KEYS.has(key)) return undefined;
  return nativeAccelerator(canonicalKey(key), modifiers);
}

function nativeAccelerator(
  key: string,
  modifiers: Set<"cmd" | "ctrl" | "alt" | "altgr" | "shift">,
): ParsedAccelerator {
  const logicalShift = modifiers.has("shift");
  const nativeKey = INTRINSIC_SHIFT_KEYS.get(key);
  if (nativeKey) modifiers.add("shift");
  return {
    modifiers,
    key: nativeKey?.key ?? key,
    logicalKey: key,
    logicalShift,
  };
}

// Electron 43.4.1 KeyboardCodeFromCharCode/KeyboardCodeFromKeyIdentifier.
// This is accelerator identity, not a keyboard-layout translation table.
const INTRINSIC_SHIFT_KEYS: ReadonlyMap<string, { key: string; code: string }> =
  new Map([
    ["!", { key: "1", code: "Digit1" }],
    ['"', { key: "'", code: "Quote" }],
    ["#", { key: "3", code: "Digit3" }],
    ["$", { key: "4", code: "Digit4" }],
    ["%", { key: "5", code: "Digit5" }],
    ["&", { key: "7", code: "Digit7" }],
    ["(", { key: "9", code: "Digit9" }],
    [")", { key: "0", code: "Digit0" }],
    ["*", { key: "8", code: "Digit8" }],
    ["+", { key: "=", code: "Equal" }],
    [":", { key: ";", code: "Semicolon" }],
    ["<", { key: ",", code: "Comma" }],
    [">", { key: ".", code: "Period" }],
    ["?", { key: "/", code: "Slash" }],
    ["@", { key: "2", code: "Digit2" }],
    ["^", { key: "6", code: "Digit6" }],
    ["_", { key: "-", code: "Minus" }],
    ["{", { key: "[", code: "BracketLeft" }],
    ["|", { key: "\\", code: "Backslash" }],
    ["}", { key: "]", code: "BracketRight" }],
    ["~", { key: "`", code: "Backquote" }],
  ]);

function canonicalKey(key: string): string {
  if (key === "return") return "enter";
  if (key === "esc") return "escape";
  if (key === "plus") return "+";
  return key;
}

export function isValidAccelerator(value: string): boolean {
  return parseAccelerator(value) !== undefined;
}

// Modifier and key state of one keyboard event, as Electron's
// before-input-event reports it (DOM KeyboardEvent key values).
export interface AcceleratorKeyboardInput {
  readonly key: string;
  readonly code?: string;
  readonly control: boolean;
  readonly meta: boolean;
  readonly alt: boolean;
  readonly altGr?: boolean;
  readonly shift: boolean;
}

// Resolves the same native identity as duplicate detection. Shifted symbols
// require their logical character and native position to agree; this does not
// infer arbitrary layout characters from physical positions. Plus additionally
// retains the deliberate logical-key convenience of ADR 0018.
export function terminalActionForKeyboardInput(
  keybinds: TerminalKeybinds,
  input: AcceleratorKeyboardInput,
  platform: string = "darwin",
): TerminalActionName | undefined {
  const logicalKey = acceleratorKeyForInputKey(input.key);
  if (logicalKey === undefined) return undefined;
  const keypadKey = keypadKeyForInput(logicalKey, input.code);
  const nativeKey = INTRINSIC_SHIFT_KEYS.get(logicalKey);
  const key =
    keypadKey ??
    (nativeKey && input.code === nativeKey.code ? nativeKey.key : logicalKey);
  let logicalFallback: TerminalActionName | undefined;
  for (const action of TERMINAL_ACTION_NAMES) {
    const parsed = parseAccelerator(keybinds[action], platform);
    if (
      parsed === undefined ||
      parsed.modifiers.has("cmd") !== input.meta ||
      parsed.modifiers.has("ctrl") !== input.control ||
      parsed.modifiers.has("alt") !== input.alt ||
      parsed.modifiers.has("altgr") !== (input.altGr ?? false)
    )
      continue;
    const shifted = parsed.modifiers.has("shift");
    if (parsed.key === key && shifted === input.shift) return action;

    // Preserve logical keypad delivery (e.g. keypad Minus for zoomOut), but
    // prefer any specific keypad binding's native identity over this fallback.
    const logicalKeypad =
      keypadKey !== undefined &&
      parsed.logicalKey === logicalKey &&
      parsed.logicalShift === input.shift;
    // Plus is also a deliberate logical-key convenience, not another native
    // accelerator. Without explicit Shift it accepts unshifted +; Ctrl+= is
    // still not an unrequested zoom shortcut.
    const logicalPlus =
      parsed.logicalKey === "+" &&
      logicalKey === "+" &&
      (input.shift || !parsed.logicalShift);
    if (logicalKeypad || logicalPlus) logicalFallback ??= action;
  }
  return logicalFallback;
}

function keypadKeyForInput(
  key: string,
  code: string | undefined,
): string | undefined {
  if (code === `Numpad${key}` && /^[0-9]$/.test(key)) return `num${key}`;
  const operators: Readonly<Record<string, readonly [string, string]>> = {
    NumpadAdd: ["+", "numadd"],
    NumpadSubtract: ["-", "numsub"],
    NumpadMultiply: ["*", "nummult"],
    NumpadDivide: ["/", "numdiv"],
    NumpadDecimal: [".", "numdec"],
  };
  const operator = code === undefined ? undefined : operators[code];
  return operator?.[0] === key ? operator[1] : undefined;
}

function acceleratorKeyForInputKey(inputKey: string): string | undefined {
  if (inputKey === " ") return "space";
  if (inputKey.length === 1) return canonicalKey(inputKey.toLowerCase());
  const key = inputKey.toLowerCase();
  // DOM names arrows "ArrowUp"; the accelerator grammar names them "Up".
  if (key.startsWith("arrow")) return key.slice("arrow".length);
  return NAMED_KEYS.has(key) ? canonicalKey(key) : undefined;
}

// PTY control keys that a bare Ctrl+<key> accelerator intercepts before the
// terminal (delivery consumes the event, so the byte never reaches the shell).
// The set is explicit so a deliberate remap that merely uses Control without
// hitting one of these keys never warns. Values label the shadowed effect for
// the load-time portability warning.
const SHADOWED_PTY_CONTROL_KEYS: ReadonlyMap<string, string> = new Map([
  ["c", "SIGINT (interrupt)"],
  ["d", "end-of-input (EOF)"],
  ["z", "SIGTSTP (suspend)"],
  ["\\", "SIGQUIT (quit)"],
  ["u", "kill line"],
  ["w", "delete previous word"],
  ["a", "start of line"],
  ["e", "end of line"],
]);

export interface ShadowedControlKeyBinding {
  readonly action: TerminalActionName;
  readonly controlKey: string;
  readonly shadows: string;
}

// Reports keybinds that resolve, on the given platform, to a bare Ctrl+<key>
// accelerator shadowing a PTY control key. CommandOrControl becomes Control on
// every non-macOS platform, so a macOS-authored map turns terminal-hostile
// there (#102); an explicit Control+<key> shadows on macOS too. The bindings
// stay active — this only surfaces the foot-gun (warn-and-keep).
export function shadowedControlKeyBindings(
  keybinds: TerminalKeybinds,
  platform: string = "darwin",
): readonly ShadowedControlKeyBinding[] {
  const shadowed: ShadowedControlKeyBinding[] = [];
  for (const action of TERMINAL_ACTION_NAMES) {
    const parsed = parseAccelerator(keybinds[action], platform);
    if (parsed === undefined) continue;
    if (parsed.modifiers.size !== 1 || !parsed.modifiers.has("ctrl")) continue;
    const shadows = SHADOWED_PTY_CONTROL_KEYS.get(parsed.key);
    if (shadows === undefined) continue;
    shadowed.push({
      action,
      controlKey: `Ctrl+${parsed.key.toUpperCase()}`,
      shadows,
    });
  }
  return shadowed;
}

// Canonical form for native duplicate detection. CommandOrControl resolves to
// Command on macOS and Control elsewhere; Super and Meta remain the Command
// accelerator family represented by Electron's `meta` key-event flag.
export function canonicalAccelerator(
  value: string,
  platform: string = "darwin",
): string | undefined {
  const parsed = parseAccelerator(value, platform);
  if (!parsed) return undefined;
  const modifiers = (["cmd", "ctrl", "alt", "altgr", "shift"] as const).filter(
    (modifier) => parsed.modifiers.has(modifier),
  );
  return [...modifiers, parsed.key].join("+");
}
