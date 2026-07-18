import { readFile, stat } from "node:fs/promises";
import {
  MAX_TERMINAL_THEME_NAME_CODE_POINTS,
  TERMINAL_THEME_COLOR_KEYS,
  TERMINAL_THEME_VERSION,
  isTerminalThemeColor,
  isTerminalThemeName,
  type TerminalTheme,
} from "../shared/terminal-theme";

export class TerminalThemeError extends Error {
  constructor(
    readonly themePath: string,
    readonly location: string | undefined,
    readonly reason: string,
  ) {
    const field = location ? ` at ${JSON.stringify(location)}` : "";
    super(`Terminal Theme ${JSON.stringify(themePath)}${field} ${reason}`);
    this.name = "TerminalThemeError";
  }
}

export async function loadTerminalTheme(
  themePath: string,
): Promise<TerminalTheme> {
  let fileStatus;
  try {
    fileStatus = await stat(themePath);
  } catch {
    fail(themePath, undefined, "could not be read");
  }
  if (!fileStatus.isFile())
    fail(themePath, undefined, "must be a regular file");

  let bytes: Uint8Array;
  try {
    bytes = await readFile(themePath);
  } catch {
    fail(themePath, undefined, "could not be read");
  }

  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    fail(themePath, undefined, "is not valid UTF-8");
  }

  let document: unknown;
  try {
    document = JSON.parse(text) as unknown;
  } catch {
    fail(themePath, undefined, "is not valid JSON");
  }
  return validateTerminalTheme(document, themePath);
}

export function validateTerminalTheme(
  document: unknown,
  themePath: string,
): TerminalTheme {
  const root = requireObject(document, themePath, "$", "must be an object");
  rejectUnknownKeys(root, themePath, "$", ["version", "name", "colors"]);
  requireKeys(root, themePath, "$", ["version", "name", "colors"]);
  if (root.version !== TERMINAL_THEME_VERSION)
    fail(themePath, "version", "must be 1");
  if (!isTerminalThemeName(root.name))
    fail(
      themePath,
      "name",
      `must be a non-empty printable single line of at most ${MAX_TERMINAL_THEME_NAME_CODE_POINTS} Unicode code points`,
    );

  const colors = requireObject(
    root.colors,
    themePath,
    "colors",
    "must be an object",
  );
  rejectUnknownKeys(colors, themePath, "colors", TERMINAL_THEME_COLOR_KEYS);
  requireKeys(colors, themePath, "colors", TERMINAL_THEME_COLOR_KEYS);
  for (const key of TERMINAL_THEME_COLOR_KEYS) {
    if (!isTerminalThemeColor(colors[key]))
      fail(
        themePath,
        `colors.${key}`,
        "must be a CSS hexadecimal #RRGGBB color",
      );
  }

  return Object.freeze({
    version: TERMINAL_THEME_VERSION,
    name: root.name,
    colors: Object.freeze({ ...colors }) as TerminalTheme["colors"],
  });
}

function requireObject(
  value: unknown,
  themePath: string,
  location: string,
  reason: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    fail(themePath, location, reason);
  return value as Record<string, unknown>;
}

function rejectUnknownKeys(
  value: Record<string, unknown>,
  themePath: string,
  location: string,
  allowed: readonly string[],
): void {
  const unknown = Object.keys(value).find((key) => !allowed.includes(key));
  if (unknown)
    fail(
      themePath,
      location === "$" ? `$.${unknown}` : `${location}.${unknown}`,
      "is unknown",
    );
}

function requireKeys(
  value: Record<string, unknown>,
  themePath: string,
  location: string,
  required: readonly string[],
): void {
  const missing = required.find((key) => !(key in value));
  if (missing)
    fail(
      themePath,
      location === "$" ? missing : `${location}.${missing}`,
      "is required",
    );
}

function fail(
  themePath: string,
  location: string | undefined,
  reason: string,
): never {
  throw new TerminalThemeError(themePath, location, reason);
}
