// Turns a key press into an Electron accelerator string, the format of the
// keybinds in config.json. Main still validates the result and rejects
// conflicts; this only spells what was pressed.
const CODE_KEYS: Readonly<Record<string, string>> = {
  Comma: ",",
  Period: ".",
  Slash: "/",
  Semicolon: ";",
  Quote: "'",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  Minus: "-",
  Equal: "=",
  Backquote: "`",
  Space: "Space",
  Tab: "Tab",
  Enter: "Enter",
  Backspace: "Backspace",
  Delete: "Delete",
  Insert: "Insert",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  NumpadAdd: "numadd",
  NumpadSubtract: "numsub",
  NumpadMultiply: "nummult",
  NumpadDivide: "numdiv",
  NumpadDecimal: "numdec",
};

const MODIFIER_KEYS = new Set(["Shift", "Control", "Alt", "Meta", "AltGraph"]);

function keyName(code: string): string | undefined {
  if (/^Key[A-Z]$/u.test(code)) return code.slice(3);
  if (/^Digit[0-9]$/u.test(code)) return code.slice(5);
  if (/^Numpad[0-9]$/u.test(code)) return `num${code.slice(6)}`;
  if (/^F([1-9]|1[0-9]|2[0-4])$/u.test(code)) return code;
  return CODE_KEYS[code];
}

export function acceleratorFromKeyEvent(
  event: Pick<
    KeyboardEvent,
    "key" | "code" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey"
  >,
  platform: string,
): string | undefined {
  if (MODIFIER_KEYS.has(event.key)) return undefined;
  const key = keyName(event.code);
  if (!key) return undefined;
  const parts: string[] = [];
  if (event.metaKey) parts.push(platform === "darwin" ? "Command" : "Super");
  if (event.ctrlKey) parts.push("Control");
  if (event.altKey) parts.push("Alt");
  if (event.shiftKey) parts.push("Shift");
  return [...parts, key].join("+");
}

// How an accelerator reads on this platform: Cmd/Ctrl spelled out.
export function displayAccelerator(
  accelerator: string,
  platform: string,
): string {
  const mac = platform === "darwin";
  return accelerator
    .split("+")
    .map((part) => {
      switch (part.toLowerCase()) {
        case "commandorcontrol":
        case "cmdorctrl":
          return mac ? "⌘" : "Ctrl";
        case "command":
        case "cmd":
          return mac ? "⌘" : "Super";
        case "control":
        case "ctrl":
          return mac ? "⌃" : "Ctrl";
        case "alt":
        case "option":
          return mac ? "⌥" : "Alt";
        case "shift":
          return mac ? "⇧" : "Shift";
        case "plus":
          return "+";
        default:
          return part.length === 1 ? part.toUpperCase() : part;
      }
    })
    .join(mac ? "" : "+");
}
