import path from "node:path";
import type {
  PreferencesFile,
  PreferencesPatch,
  PreferencesSaveResult,
  PreferencesScheme,
  PreferencesSnapshot,
} from "../shared/preferences";
import {
  DEFAULT_TERMINAL_SCHEME_ID,
  TERMINAL_SCHEMES,
  terminalScheme,
} from "../shared/terminal-schemes";
import type { TerminalTheme } from "../shared/terminal-theme";
import { terminalDefaultKeybinds } from "../shared/terminal-keybinds";
import {
  DEFAULT_USER_CONFIGURATION,
  type UserConfigurationLoad,
} from "./user-configuration";
import type { UserConfiguration } from "../shared/user-configuration";
import { validateTerminalTheme } from "./terminal-theme";
import { completeConfigurationText } from "./complete-configuration";
import {
  applyPreferencesPatch,
  defaultPreferencesDocument,
  preferencesValues,
  type PreferencesExtras,
} from "./preferences-document";

export interface PreferencesFiles {
  read(filePath: string): Promise<Uint8Array>;
  // Atomic: a crash leaves the old or the new file, never a partial one.
  write(filePath: string, text: string): Promise<void>;
  list(directory: string): Promise<readonly string[]>;
}

export interface PreferencesServiceOptions {
  readonly configurationPath: string;
  readonly platform: string;
  readonly files: PreferencesFiles;
  // Validates candidate config.json bytes exactly as a reload would.
  readonly validate: (bytes: Uint8Array) => Promise<UserConfigurationLoad>;
  readonly active: () => {
    readonly configuration: UserConfiguration;
    readonly userFileErrors: readonly string[];
  };
  readonly reload: () => Promise<void>;
  readonly extras: {
    get(): PreferencesExtras;
    setRestoreWindows(enabled: boolean): Promise<void>;
    setHighlightOutput(enabled: boolean): Promise<void>;
  };
  readonly fontFamilies: () => Promise<readonly string[]>;
}

export interface PreferencesService {
  snapshot(): Promise<PreferencesSnapshot>;
  save(patch: PreferencesPatch): Promise<PreferencesSaveResult>;
  reset(): Promise<PreferencesSaveResult>;
  // config.json as text for the built-in editor, and replacing it whole.
  readFile(): Promise<PreferencesFile>;
  writeFile(text: string): Promise<PreferencesSaveResult>;
}

const EMPTY_CONFIGURATION = '{\n  "version": 1\n}\n';

const THEME_FILE = /^[\w .-]{1,96}\.json$/u;
const MAX_THEME_FILES = 64;
const MAX_THEME_BYTES = 64 * 1024;

const sameTheme = (first: TerminalTheme, second: TerminalTheme) =>
  first.name === second.name &&
  JSON.stringify(first.colors) === JSON.stringify(second.colors);

function schemeOption(
  id: string,
  theme: TerminalTheme,
  builtIn: boolean,
): PreferencesScheme {
  const { colors } = theme;
  return {
    id,
    name: theme.name,
    builtIn,
    background: colors.background.slice(0, 7),
    foreground: colors.foreground.slice(0, 7),
    palette: [
      colors.red,
      colors.green,
      colors.yellow,
      colors.blue,
      colors.magenta,
      colors.cyan,
    ].map((color) => color.slice(0, 7)),
  };
}

// config.json always lists every setting; written values stay as written.
async function writeCompleteConfiguration(
  options: Pick<PreferencesServiceOptions, "configurationPath" | "files">,
  document: Record<string, unknown>,
  configuration: UserConfiguration,
): Promise<void> {
  await options.files.write(
    options.configurationPath,
    await completeConfigurationText(
      options.configurationPath,
      document,
      configuration,
      options.files,
    ),
  );
}

// Edits config.json for the Preferences dialog: every change is validated as
// a reload would validate it, written atomically, and then reloaded so all
// windows apply it.
export function createPreferencesService(
  options: PreferencesServiceOptions,
): PreferencesService {
  const directory = path.dirname(options.configurationPath);
  const themes = path.join(directory, "themes");
  const defaultKeybinds = terminalDefaultKeybinds(options.platform);
  let queue: Promise<unknown> = Promise.resolve();
  const serialized = <T>(task: () => Promise<T>): Promise<T> => {
    const run = queue.then(task, task);
    queue = run.catch(() => undefined);
    return run;
  };

  // Valid theme files in themes/, except copies of built-in schemes.
  const customThemes = async () => {
    const names = await options.files.list(themes).catch(() => []);
    const found: { file: string; theme: TerminalTheme }[] = [];
    for (const file of names.filter((name) => THEME_FILE.test(name)).sort()) {
      if (found.length >= MAX_THEME_FILES) break;
      try {
        const bytes = await options.files.read(path.join(themes, file));
        if (bytes.byteLength > MAX_THEME_BYTES) continue;
        const theme = validateTerminalTheme(
          JSON.parse(new TextDecoder().decode(bytes)) as unknown,
          path.join(themes, file),
        );
        if (!TERMINAL_SCHEMES.some((scheme) => sameTheme(scheme.theme, theme)))
          found.push({ file, theme });
      } catch {
        // Invalid or unreadable themes are not offered.
      }
    }
    return found;
  };

  const snapshot = async (): Promise<PreferencesSnapshot> => {
    const { configuration, userFileErrors } = options.active();
    const custom = await customThemes();
    const active = configuration.terminalTheme;
    const scheme =
      TERMINAL_SCHEMES.find((candidate) => sameTheme(candidate.theme, active))
        ?.id ??
      custom
        .filter((candidate) => sameTheme(candidate.theme, active))
        .map((candidate) => `file:${candidate.file}`)[0] ??
      DEFAULT_TERMINAL_SCHEME_ID;
    const defaults = {
      ...DEFAULT_USER_CONFIGURATION,
      keybinds: defaultKeybinds,
    };
    return {
      values: preferencesValues(configuration, scheme, options.extras.get()),
      defaults: preferencesValues(defaults, DEFAULT_TERMINAL_SCHEME_ID, {
        restoreWindows: false,
        highlightOutput: false,
      }),
      schemes: [
        ...TERMINAL_SCHEMES.map((candidate) =>
          schemeOption(candidate.id, candidate.theme, true),
        ),
        ...custom.map((candidate) =>
          schemeOption(`file:${candidate.file}`, candidate.theme, false),
        ),
      ],
      fontFamilies: await options.fontFamilies().catch(() => []),
      platform: options.platform,
      ...(userFileErrors[0]
        ? { problem: userFileErrors[0].slice(0, 4_096) }
        : {}),
    };
  };

  const readDocument = async (): Promise<Record<string, unknown>> => {
    let bytes: Uint8Array;
    try {
      bytes = await options.files.read(options.configurationPath);
    } catch {
      return { version: 1 };
    }
    let document: unknown;
    try {
      document = JSON.parse(new TextDecoder().decode(bytes));
    } catch {
      document = undefined;
    }
    if (
      typeof document !== "object" ||
      document === null ||
      Array.isArray(document)
    )
      throw new Error(
        "config.json is not a valid JSON object. Fix it in a text editor or choose Restore Defaults.",
      );
    return document as Record<string, unknown>;
  };

  // The theme file for a scheme, relative to config.json. A built-in scheme
  // is written to themes/<id>.json unless that file holds a different theme,
  // which is kept; then themes/<id>.builtin.json is used.
  const themePathFor = async (id: string): Promise<string | null> => {
    if (id === DEFAULT_TERMINAL_SCHEME_ID) return null;
    if (id.startsWith("file:")) {
      const file = id.slice(5);
      if (!(await customThemes()).some((candidate) => candidate.file === file))
        throw new Error("The selected theme file is no longer available");
      return `themes/${file}`;
    }
    const scheme = terminalScheme(id);
    if (!scheme) throw new Error("Unknown color scheme");
    const text = `${JSON.stringify(scheme.theme, null, 2)}\n`;
    for (const file of [`${id}.json`, `${id}.builtin.json`]) {
      const target = path.join(themes, file);
      const existing = await options.files
        .read(target)
        .then((bytes) => new TextDecoder().decode(bytes))
        .catch(() => undefined);
      if (existing === undefined || file.endsWith(".builtin.json")) {
        if (existing !== text) await options.files.write(target, text);
        return `themes/${file}`;
      }
      try {
        const theme = validateTerminalTheme(JSON.parse(existing), target);
        if (sameTheme(theme, scheme.theme)) return `themes/${file}`;
      } catch {
        // An invalid file of the same name is the user's; leave it.
      }
    }
    throw new Error("Unreachable");
  };

  const writeComplete = (
    document: Record<string, unknown>,
    configuration: UserConfiguration,
  ) => writeCompleteConfiguration(options, document, configuration);

  const commit = async (
    document: Record<string, unknown>,
  ): Promise<string | undefined> => {
    const text = `${JSON.stringify(document, null, 2)}\n`;
    const load = await options.validate(new TextEncoder().encode(text));
    // The field and reason only: the dialog says the change was not saved.
    if (load.fallback) {
      const { location, reason } = load.fallback.error;
      return location ? `${location}: ${reason}` : reason;
    }
    await writeComplete(document, load.configuration);
    await options.reload();
    return undefined;
  };

  const result = async (error?: string): Promise<PreferencesSaveResult> =>
    error === undefined
      ? { ok: true, snapshot: await snapshot() }
      : { ok: false, error: error.slice(0, 4_096), snapshot: await snapshot() };

  const writeFile = async (text: string): Promise<PreferencesSaveResult> => {
    let parsed: unknown;
    try {
      parsed = JSON.parse(text);
    } catch (cause) {
      return result(
        `JSON: ${cause instanceof Error ? cause.message : "invalid"}`,
      );
    }
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))
      return result("config.json must hold a JSON object");
    const finalText = text.endsWith("\n") ? text : `${text}\n`;
    const load = await options.validate(new TextEncoder().encode(finalText));
    if (load.fallback) {
      const { location, reason } = load.fallback.error;
      return result(location ? `${location}: ${reason}` : reason);
    }
    // The replaced file stays next to it as config.json.bak.
    const previous = await options.files
      .read(options.configurationPath)
      .catch(() => undefined);
    if (previous)
      await options.files.write(
        `${options.configurationPath}.bak`,
        new TextDecoder().decode(previous),
      );
    await writeComplete(parsed as Record<string, unknown>, load.configuration);
    await options.reload();
    return result();
  };

  return {
    snapshot: () => serialized(snapshot),
    readFile: () =>
      serialized(async () => ({
        path: options.configurationPath,
        text: await options.files
          .read(options.configurationPath)
          .then((bytes) => new TextDecoder().decode(bytes))
          .catch(() => EMPTY_CONFIGURATION),
      })),
    writeFile: (text) =>
      serialized(async () => {
        try {
          return await writeFile(text);
        } catch (cause) {
          return await result(
            cause instanceof Error
              ? cause.message
              : "config.json was not saved",
          );
        }
      }),
    save: (patch) =>
      serialized(async () => {
        const { restoreWindows, highlightOutput, scheme, ...rest } = patch;
        try {
          if (restoreWindows !== undefined)
            await options.extras.setRestoreWindows(restoreWindows);
          if (highlightOutput !== undefined)
            await options.extras.setHighlightOutput(highlightOutput);
          if (Object.keys(rest).length === 0 && scheme === undefined)
            return await result();
          const themePath =
            scheme === undefined ? undefined : await themePathFor(scheme);
          const document = applyPreferencesPatch(
            await readDocument(),
            rest,
            defaultKeybinds,
            themePath,
          );
          return await result(await commit(document));
        } catch (cause) {
          return await result(
            cause instanceof Error
              ? cause.message
              : "The change could not be saved",
          );
        }
      }),
    reset: () =>
      serialized(async () => {
        try {
          // The replaced file stays next to it as config.json.bak.
          const previous = await options.files
            .read(options.configurationPath)
            .catch(() => undefined);
          if (previous)
            await options.files.write(
              `${options.configurationPath}.bak`,
              new TextDecoder().decode(previous),
            );
          const original = await readDocument().catch(() => ({}));
          return await result(
            await commit(defaultPreferencesDocument(original)),
          );
        } catch (cause) {
          return await result(
            cause instanceof Error
              ? cause.message
              : "Defaults could not be restored",
          );
        }
      }),
  };
}
