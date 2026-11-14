// Matching for the Shortcuts filter. A query finds a row by what the row
// shows: its text, or the keys of its binding in any order and spelling.

const MODIFIER_SYMBOLS: Readonly<Record<string, string>> = {
  "⌘": "cmd",
  "⌃": "ctrl",
  "⌥": "alt",
  "⎇": "alt",
  "⇧": "shift",
};

const KEY_ALIASES: Readonly<Record<string, string>> = {
  command: "cmd",
  meta: "cmd",
  super: "cmd",
  win: "cmd",
  control: "ctrl",
  option: "alt",
  opt: "alt",
};

// Case and accents never decide a match: "divisao" finds "Divisão".
const fold = (text: string) =>
  text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();

const words = (text: string) => fold(text).split(/\s+/u).filter(Boolean);

const keys = (text: string) =>
  fold(text.replace(/[⌘⌃⌥⎇⇧]/gu, (symbol) => ` ${MODIFIER_SYMBOLS[symbol]} `))
    .split(/[\s+]+/u)
    .filter(Boolean)
    .map((key) => KEY_ALIASES[key] ?? key);

export interface ShortcutFilterRow {
  /** Everything the row says in words: the action name and its state. */
  readonly text: string;
  /** The binding as displayed, such as "Cmd+Shift+D"; absent when unbound. */
  readonly binding?: string;
}

export function matchesShortcutFilter(
  query: string,
  row: ShortcutFilterRow,
): boolean {
  const wanted = words(query);
  if (wanted.length === 0) return true;
  const text = fold(row.text);
  if (wanted.every((word) => text.includes(word))) return true;
  if (row.binding === undefined) return false;
  const bound = keys(row.binding);
  // One character is a whole key ("d" is not "Down"); longer parts may still
  // be in the middle of being typed ("shi", "cmd+").
  return keys(query).every((part) =>
    bound.some((key) =>
      part.length === 1 ? key === part : key.startsWith(part),
    ),
  );
}
