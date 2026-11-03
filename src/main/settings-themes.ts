import { constants } from "node:fs";
import { lstat, open, opendir, realpath } from "node:fs/promises";
import path from "node:path";
import {
  MAX_SETTINGS_THEMES,
  MAX_SETTINGS_THEME_PATH_LENGTH,
  MAX_SETTINGS_THEME_REASON_LENGTH,
  SETTINGS_THEME_COLOR_KEYS,
  type SettingsTheme,
  type SettingsThemesResult,
} from "../shared/settings-themes";
import { MAX_SETTINGS_TEXT_LENGTH } from "../shared/settings";
import {
  TERMINAL_THEME_APPEARANCE_KEYS,
  TERMINAL_THEME_COLOR_KEYS,
} from "../shared/terminal-theme";
import { TerminalThemeError, validateTerminalTheme } from "./terminal-theme";
import { isUserConfigurationPathAbsent } from "./user-configuration-path";

// Cap directory work even when entries do not match *.json. Read one extra
// entry/byte to distinguish a full result from an actually truncated one.
export const MAX_SETTINGS_THEME_DIRECTORY_ENTRIES = 2_048;
export const MAX_SETTINGS_THEME_FILE_BYTES = 256 * 1_024;
const MAX_CONFIGURATION_BYTES = 4 * MAX_SETTINGS_TEXT_LENGTH;

class LocalReadError extends Error {
  constructor(readonly kind: "size" | "type" | "changed") {
    super(kind);
  }
}

// Follow intentional file/directory links, but never block on a swapped FIFO
// and never read a non-regular target. Checks reduce races; filesystem changes
// after the last check cannot be made atomic with later Settings saves.
async function readBounded(
  filePath: string,
  maxBytes: number,
): Promise<Buffer> {
  const target = await realpath(filePath);
  const before = await lstat(target);
  if (!before.isFile()) throw new LocalReadError("type");
  if (before.size > maxBytes) throw new LocalReadError("size");
  const handle = await open(
    target,
    constants.O_RDONLY | constants.O_NONBLOCK | (constants.O_NOFOLLOW ?? 0),
  );
  try {
    const opened = await handle.stat();
    if (!opened.isFile()) throw new LocalReadError("type");
    if (opened.dev !== before.dev || opened.ino !== before.ino)
      throw new LocalReadError("changed");
    if (opened.size > maxBytes) throw new LocalReadError("size");
    const bytes = Buffer.allocUnsafe(maxBytes + 1);
    let length = 0;
    while (length < bytes.length) {
      const read = await handle.read(
        bytes,
        length,
        bytes.length - length,
        null,
      );
      if (read.bytesRead === 0) break;
      length += read.bytesRead;
    }
    if (length > maxBytes) throw new LocalReadError("size");
    const after = await handle.stat();
    if (
      opened.size !== after.size ||
      opened.mtimeMs !== after.mtimeMs ||
      opened.ctimeMs !== after.ctimeMs ||
      (await realpath(filePath)) !== target
    )
      throw new LocalReadError("changed");
    return bytes.subarray(0, length);
  } finally {
    await handle.close();
  }
}

function isNotFound(cause: unknown): boolean {
  return (
    typeof cause === "object" &&
    cause !== null &&
    (cause as NodeJS.ErrnoException).code === "ENOENT"
  );
}

// Do not load the configured theme here: it might be an arbitrary custom path,
// and the normal configuration loader has different (unbounded) read behavior.
// Preserve Settings' existing practice of showing the parsed document's own
// theme path even when another setting makes the document invalid.
async function configuredThemePath(
  configurationPath: string,
): Promise<
  { normalized?: string; source?: string; absoluteParent?: string } | undefined
> {
  let bytes: Buffer;
  try {
    bytes = await readBounded(configurationPath, MAX_CONFIGURATION_BYTES);
  } catch (cause) {
    if (
      isNotFound(cause) &&
      (await isUserConfigurationPathAbsent(configurationPath))
    )
      return undefined;
    throw cause;
  }
  const document: unknown = JSON.parse(
    new TextDecoder("utf-8", { fatal: true }).decode(bytes),
  );
  if (!isRecord(document)) throw new Error("Invalid configuration");
  if (document.theme === undefined) return undefined;
  if (
    !isRecord(document.theme) ||
    typeof document.theme.path !== "string" ||
    document.theme.path.length === 0 ||
    document.theme.path.includes("\0")
  )
    return {};
  const configured = document.theme.path;
  const absolute = path.isAbsolute(configured);
  // An absolute path is used as written by the loader; a trailing separator
  // cannot designate one of the regular files in the picker.
  if (
    absolute &&
    (configured.endsWith(path.sep) ||
      (path.sep === "\\" && configured.endsWith("/")))
  )
    return {};
  const normalized = path.resolve(path.dirname(configurationPath), configured);
  return {
    normalized,
    source: absolute ? configured : normalized,
    ...(absolute ? { absoluteParent: path.dirname(configured) } : {}),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function validationReason(cause: TerminalThemeError): string {
  const knownLocations = new Set([
    "$",
    "version",
    "name",
    "colors",
    "appearance",
    ...TERMINAL_THEME_COLOR_KEYS.map((key) => `colors.${key}`),
    ...TERMINAL_THEME_APPEARANCE_KEYS.map((key) => `appearance.${key}`),
  ]);
  const location =
    cause.location && knownLocations.has(cause.location)
      ? `${cause.location}: `
      : "Theme: ";
  return `${location}${cause.reason}`
    .replace(/[\p{Cc}\p{Cf}\p{Cs}\p{Cn}\p{Zl}\p{Zp}]/gu, " ")
    .slice(0, MAX_SETTINGS_THEME_REASON_LENGTH);
}

function failureReason(
  cause: unknown,
): Omit<SettingsThemesResult["invalid"][number], "path"> {
  if (cause instanceof LocalReadError) return { reason: cause.kind };
  if (cause instanceof TerminalThemeError) {
    // Unknown field names are untrusted theme content; do not expose them.
    if (cause.reason === "is unknown") return { reason: "unknown" };
    return { reason: "invalid", detail: validationReason(cause) };
  }
  return { reason: "read" };
}

async function readTheme(
  filePath: string,
  selectablePath: string,
): Promise<SettingsTheme> {
  const bytes = await readBounded(filePath, MAX_SETTINGS_THEME_FILE_BYTES);
  let text: string;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new TerminalThemeError("", undefined, "is not valid UTF-8");
  }
  let document: unknown;
  try {
    document = JSON.parse(text);
  } catch {
    throw new TerminalThemeError("", undefined, "is not valid JSON");
  }
  const theme = validateTerminalTheme(document, "");
  const colors = Object.fromEntries(
    SETTINGS_THEME_COLOR_KEYS.map((key) => [key, theme.colors[key]]),
  ) as SettingsTheme["colors"];
  return { path: selectablePath, name: theme.name, colors };
}

// Match OS-equivalent spellings only when the containing directory and the
// directory entry itself match. lstat keeps distinct symlinks to one target
// separate; ambiguous case/Unicode-equivalent names are never guessed.
async function equivalentEntry(
  source: string,
  directory: string,
  names: readonly string[],
  themes: readonly SettingsTheme[],
): Promise<string | undefined> {
  const key = (name: string) => name.normalize("NFD").toLowerCase();
  const matching = names.filter(
    (name) => key(name) === key(path.basename(source)),
  );
  if (matching.length !== 1) return undefined;
  const candidate = themes.find(
    (theme) => theme.path === `themes/${matching[0]}`,
  );
  if (!candidate) return undefined;
  try {
    if ((await realpath(path.dirname(source))) !== (await realpath(directory)))
      return undefined;
    const [configured, discovered] = await Promise.all([
      lstat(source),
      lstat(path.join(directory, matching[0]!)),
    ]);
    if (
      configured.ino !== 0 &&
      configured.dev === discovered.dev &&
      configured.ino === discovered.ino
    )
      return candidate.path;
  } catch {
    // A missing or changed entry is not a selection.
  }
  return undefined;
}

async function checkAbsoluteParent(
  selectedPath: string | undefined,
  absoluteParent: string | undefined,
  directory: string,
): Promise<string | undefined> {
  if (!selectedPath || !absoluteParent) return selectedPath;
  try {
    return (await realpath(absoluteParent)) === (await realpath(directory))
      ? selectedPath
      : undefined;
  } catch {
    return undefined;
  }
}

const unavailable = (hasConfiguredTheme?: boolean): SettingsThemesResult => ({
  status: "unavailable",
  themes: [],
  invalid: [],
  truncated: false,
  ...(hasConfiguredTheme === undefined ? {} : { hasConfiguredTheme }),
});

// Only the logical configuration directory determines the directory to scan.
// Returned paths are never realpathed and remain usable as config.json values.
export async function discoverSettingsThemes(
  configurationPath: string,
): Promise<SettingsThemesResult> {
  let selected: Awaited<ReturnType<typeof configuredThemePath>>;
  try {
    selected = await configuredThemePath(configurationPath);
  } catch {
    return unavailable();
  }
  const directory = path.join(path.dirname(configurationPath), "themes");
  const candidates: string[] = [];
  const names: string[] = [];
  let truncated = false;
  try {
    const entries = await opendir(directory);
    let count = 0;
    for await (const entry of entries) {
      if (++count > MAX_SETTINGS_THEME_DIRECTORY_ENTRIES) {
        truncated = true;
        break;
      }
      names.push(entry.name);
      if (!entry.name.endsWith(".json")) continue;
      if (candidates.length >= MAX_SETTINGS_THEMES) {
        truncated = true;
        break;
      }
      const selectable = `themes/${entry.name}`;
      if (selectable.length > MAX_SETTINGS_THEME_PATH_LENGTH) {
        truncated = true;
        continue;
      }
      candidates.push(selectable);
    }
  } catch (cause) {
    if (isNotFound(cause) && (await isUserConfigurationPathAbsent(directory)))
      return {
        status: "missing",
        themes: [],
        invalid: [],
        truncated: false,
        hasConfiguredTheme: selected !== undefined,
      };
    return unavailable(selected !== undefined);
  }

  const themes: SettingsTheme[] = [];
  const invalid: SettingsThemesResult["invalid"][number][] = [];
  for (const selectable of candidates.sort()) {
    try {
      themes.push(
        await readTheme(
          path.resolve(path.dirname(configurationPath), selectable),
          selectable,
        ),
      );
    } catch (cause) {
      invalid.push({ path: selectable, ...failureReason(cause) });
    }
  }
  let selectedPath = selected?.normalized
    ? themes.find(
        (theme) =>
          path.resolve(path.dirname(configurationPath), theme.path) ===
          selected.normalized,
      )?.path
    : undefined;
  // Unlike relative paths, the loader passes absolute paths to the OS as
  // written. A symlink or missing component before ".." can make a lexical
  // match refer to a different directory, or no file at all. Check only the
  // parent of an otherwise matching absolute path; never read a custom theme.
  selectedPath = await checkAbsoluteParent(
    selectedPath,
    selected?.absoluteParent,
    directory,
  );
  if (!selectedPath && selected?.source && !truncated)
    selectedPath = await equivalentEntry(
      selected.source,
      directory,
      names,
      themes,
    );
  return {
    status: "ok",
    themes,
    invalid,
    truncated,
    hasConfiguredTheme: selected !== undefined,
    ...(selectedPath === undefined ? {} : { selectedPath }),
  };
}
