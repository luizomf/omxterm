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
  "zoomIn",
  "zoomOut",
  "actualSize",
  "toggleFullScreen",
] as const;

export type TerminalActionName = (typeof TERMINAL_ACTION_NAMES)[number];

export type TerminalKeybinds = Readonly<Record<TerminalActionName, string>>;

export const DEFAULT_TERMINAL_KEYBINDS: TerminalKeybinds = Object.freeze({
  quit: "CommandOrControl+Q",
  copy: "CommandOrControl+C",
  paste: "CommandOrControl+V",
  selectAll: "CommandOrControl+A",
  newWindow: "CommandOrControl+N",
  closeWindow: "CommandOrControl+W",
  zoomIn: "CommandOrControl+Plus",
  zoomOut: "CommandOrControl+-",
  actualSize: "CommandOrControl+0",
  toggleFullScreen: "Control+Command+F",
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
