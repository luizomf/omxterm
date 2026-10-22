// AshyTerm color specifications ("bold red", "underline cyan",
// "bold white on_red", "bright_green") as SGR parameters. Colors use the
// 16-color palette so they follow the active Terminal Theme.
const FOREGROUND: Readonly<Record<string, number>> = {
  black: 30,
  red: 31,
  green: 32,
  yellow: 33,
  blue: 34,
  magenta: 35,
  cyan: 36,
  white: 37,
  bright_black: 90,
  bright_red: 91,
  bright_green: 92,
  bright_yellow: 93,
  bright_blue: 94,
  bright_magenta: 95,
  bright_cyan: 96,
  bright_white: 97,
};

const MODIFIERS: Readonly<Record<string, number>> = {
  bold: 1,
  dim: 2,
  italic: 3,
  underline: 4,
  blink: 5,
  reverse: 7,
  strikethrough: 9,
};

export const HIGHLIGHT_COLOR_NAMES = Object.keys(FOREGROUND);
export const HIGHLIGHT_MODIFIER_NAMES = Object.keys(MODIFIERS);

// Returns SGR parameters ("1;31") or undefined for an unknown token.
export function colorSpecSgr(spec: string): string | undefined {
  const codes: number[] = [];
  for (const token of spec.trim().toLowerCase().split(/\s+/u)) {
    if (token === "") continue;
    if (token in MODIFIERS) codes.push(MODIFIERS[token]!);
    else if (token in FOREGROUND) codes.push(FOREGROUND[token]!);
    else if (token.startsWith("on_") && token.slice(3) in FOREGROUND)
      codes.push(FOREGROUND[token.slice(3)]! + 10);
    else return undefined;
  }
  return codes.length > 0 ? codes.join(";") : undefined;
}
