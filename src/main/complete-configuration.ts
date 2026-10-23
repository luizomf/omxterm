import path from "node:path";
import { TERMINAL_ACTION_NAMES } from "../shared/terminal-keybinds";
import { DEFAULT_TERMINAL_THEME } from "../shared/terminal-theme";
import type { UserConfiguration } from "../shared/user-configuration";

type Document = Record<string, unknown>;

export interface CompleteConfigurationFiles {
  read(filePath: string): Promise<Uint8Array>;
  // Atomic: a crash leaves the old or the new file, never a partial one.
  write(filePath: string, text: string): Promise<void>;
}

export const DEFAULT_THEME_PATH = "themes/omtheme.json";

const isRecord = (value: unknown): value is Document =>
  typeof value === "object" && value !== null && !Array.isArray(value);

// Every setting of an active configuration, in reference order. The bundled
// font has no family name (an absent family selects it) and the Windows shell
// is written only when one is configured.
export function completeConfigurationDocument(
  configuration: UserConfiguration,
  themePath: string | undefined,
): Document {
  return {
    version: 1,
    confirmClose: configuration.confirmClose,
    logLevel: configuration.logLevel,
    ...(configuration.windowsShell === undefined
      ? {}
      : { windowsShell: configuration.windowsShell }),
    font: {
      ...(configuration.fontFamily === undefined
        ? {}
        : { family: configuration.fontFamily }),
      size: configuration.fontSize,
      lineHeight: configuration.fontLineHeight,
      ligatures: configuration.fontLigatures,
    },
    terminal: {
      padding: { ...configuration.terminalPadding },
      filePreview: configuration.filePreview,
    },
    scrollback: { lines: configuration.scrollbackLines },
    keyboard: { optionAsAlt: configuration.optionKeyMode },
    window: {
      alwaysOnTop: configuration.alwaysOnTop,
      blur: configuration.blur,
      transparency: configuration.transparency,
      showTitleBar: configuration.showTitleBar,
      showTabBar: configuration.showTabBar,
      cornerRadius: configuration.cornerRadius,
      autoHideTitleBar: configuration.autoHideTitleBar,
    },
    ...(themePath === undefined ? {} : { theme: { path: themePath } }),
    keybinds: Object.fromEntries(
      TERMINAL_ACTION_NAMES.map((action) => [
        action,
        configuration.keybinds[action],
      ]),
    ),
  };
}

// The complete document's order and settings, with every value the user
// wrote kept exactly as written (and keys OMXTerm does not know kept too).
export function fillConfiguration(
  complete: Document,
  written: Document,
): Document {
  const filled: Document = {};
  for (const [key, value] of Object.entries(complete)) {
    const existing = written[key];
    filled[key] =
      isRecord(value) && isRecord(existing)
        ? fillConfiguration(value, existing)
        : key in written
          ? existing
          : value;
  }
  for (const [key, value] of Object.entries(written))
    if (!(key in filled)) filled[key] = value;
  return filled;
}

// True when the written document lacks a setting the complete one has.
export function missesSettings(complete: Document, written: Document): boolean {
  return Object.entries(complete).some(([key, value]) => {
    if (!(key in written)) return true;
    const existing = written[key];
    return isRecord(value) && isRecord(existing)
      ? missesSettings(value, existing)
      : false;
  });
}

// The theme config.json names. A document without one uses the bundled
// theme; it is named through themes/omtheme.json, which is created when
// absent, unless that file holds a different theme (then none is named).
export async function configurationThemePath(
  configurationPath: string,
  written: Document,
  configuration: UserConfiguration,
  files: CompleteConfigurationFiles,
): Promise<string | undefined> {
  if (isRecord(written.theme) && typeof written.theme.path === "string")
    return written.theme.path;
  const bundled = JSON.stringify(DEFAULT_TERMINAL_THEME);
  if (JSON.stringify(configuration.terminalTheme) !== bundled) return undefined;
  const themeFile = path.join(
    path.dirname(configurationPath),
    DEFAULT_THEME_PATH,
  );
  const existing = await files
    .read(themeFile)
    .then((bytes) => new TextDecoder().decode(bytes))
    .catch(() => undefined);
  if (existing === undefined) {
    await files.write(
      themeFile,
      `${JSON.stringify(DEFAULT_TERMINAL_THEME, null, 2)}\n`,
    );
    return DEFAULT_THEME_PATH;
  }
  try {
    return JSON.stringify(JSON.parse(existing)) === bundled
      ? DEFAULT_THEME_PATH
      : undefined;
  } catch {
    return undefined;
  }
}

// The text to write for a validated document: every setting present.
export async function completeConfigurationText(
  configurationPath: string,
  written: Document,
  configuration: UserConfiguration,
  files: CompleteConfigurationFiles,
): Promise<string> {
  const themePath = await configurationThemePath(
    configurationPath,
    written,
    configuration,
    files,
  ).catch(() => undefined);
  const complete = completeConfigurationDocument(configuration, themePath);
  return `${JSON.stringify(fillConfiguration(complete, written), null, 2)}\n`;
}

// At startup: a valid config.json missing settings is rewritten with all of
// them, keeping every written value. Unreadable or invalid files are left
// alone (the loader already reported them).
export async function completeConfigurationFile(
  configurationPath: string,
  configuration: UserConfiguration,
  files: CompleteConfigurationFiles,
): Promise<boolean> {
  let written: unknown;
  try {
    written = JSON.parse(
      new TextDecoder().decode(await files.read(configurationPath)),
    );
  } catch {
    return false;
  }
  if (!isRecord(written)) return false;
  const themePath = await configurationThemePath(
    configurationPath,
    written,
    configuration,
    files,
  ).catch(() => undefined);
  const complete = completeConfigurationDocument(configuration, themePath);
  if (!missesSettings(complete, written)) return false;
  await files.write(
    configurationPath,
    `${JSON.stringify(fillConfiguration(complete, written), null, 2)}\n`,
  );
  return true;
}
