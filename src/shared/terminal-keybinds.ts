// User-facing keybind action vocabulary. These names are the stable
// configuration keys in config.json; future actions (snippets sidebar toggle,
// tab actions) join this list without a schema change.
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
});

export const MAX_ACCELERATOR_LENGTH = 64;

// Electron accelerator grammar, case-insensitive. Shift alone is excluded from
// the required modifiers: a bare or Shift-only accelerator would swallow plain
// typing before it reaches the terminal.
const COMMAND_MODIFIERS = new Set([
  "command",
  "cmd",
  "commandorcontrol",
  "cmdorctrl",
  "super",
  "meta",
]);
const CONTROL_MODIFIERS = new Set(["control", "ctrl"]);
const ALT_MODIFIERS = new Set(["alt", "option", "altgr"]);
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
  readonly modifiers: ReadonlySet<"cmd" | "ctrl" | "alt" | "shift">;
  readonly key: string;
}

function parseAccelerator(value: string): ParsedAccelerator | undefined {
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
  const modifiers = new Set<"cmd" | "ctrl" | "alt" | "shift">();
  for (const segment of segments) {
    const modifier = segment.toLowerCase();
    if (COMMAND_MODIFIERS.has(modifier)) modifiers.add("cmd");
    else if (CONTROL_MODIFIERS.has(modifier)) modifiers.add("ctrl");
    else if (ALT_MODIFIERS.has(modifier)) modifiers.add("alt");
    else if (SHIFT_MODIFIERS.has(modifier)) modifiers.add("shift");
    else return undefined;
  }
  if (!modifiers.has("cmd") && !modifiers.has("ctrl") && !modifiers.has("alt"))
    return undefined;
  const key = rawKey.toLowerCase();
  const isSingleCharacter =
    rawKey.length === 1 && rawKey >= "!" && rawKey <= "~";
  if (!isSingleCharacter && !NAMED_KEYS.has(key)) return undefined;
  return { modifiers, key: canonicalKey(key) };
}

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
  readonly control: boolean;
  readonly meta: boolean;
  readonly alt: boolean;
  readonly shift: boolean;
}

// Resolves a key event against the effective keybind map with the shipped
// macOS semantics of canonicalAccelerator: CommandOrControl, Super, and Meta
// count as Command. Modifiers must match exactly so Control+Shift+Tab never
// resolves to a bare Control+Tab binding.
export function terminalActionForKeyboardInput(
  keybinds: TerminalKeybinds,
  input: AcceleratorKeyboardInput,
): TerminalActionName | undefined {
  const key = acceleratorKeyForInputKey(input.key);
  if (key === undefined) return undefined;
  for (const action of TERMINAL_ACTION_NAMES) {
    const parsed = parseAccelerator(keybinds[action]);
    if (
      parsed !== undefined &&
      parsed.key === key &&
      parsed.modifiers.has("cmd") === input.meta &&
      parsed.modifiers.has("ctrl") === input.control &&
      parsed.modifiers.has("alt") === input.alt &&
      parsed.modifiers.has("shift") === input.shift
    )
      return action;
  }
  return undefined;
}

function acceleratorKeyForInputKey(inputKey: string): string | undefined {
  if (inputKey === " ") return "space";
  if (inputKey.length === 1) return canonicalKey(inputKey.toLowerCase());
  const key = inputKey.toLowerCase();
  // DOM names arrows "ArrowUp"; the accelerator grammar names them "Up".
  if (key.startsWith("arrow")) return key.slice("arrow".length);
  return NAMED_KEYS.has(key) ? canonicalKey(key) : undefined;
}

// Canonical form for duplicate detection on the shipped platform (macOS),
// where CommandOrControl, Super, and Meta all resolve to Command.
export function canonicalAccelerator(value: string): string | undefined {
  const parsed = parseAccelerator(value);
  if (!parsed) return undefined;
  const modifiers = (["cmd", "ctrl", "alt", "shift"] as const).filter(
    (modifier) => parsed.modifiers.has(modifier),
  );
  return [...modifiers, parsed.key].join("+");
}
