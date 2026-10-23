import type {
  PreferencesPatch,
  PreferencesValues,
} from "../shared/preferences";
import type { TerminalKeybinds } from "../shared/terminal-keybinds";
import type { UserConfiguration } from "../shared/user-configuration";

type Document = Record<string, unknown>;

export interface PreferencesExtras {
  readonly restoreWindows: boolean;
  readonly highlightOutput: boolean;
}

// What the Preferences dialog shows for an active User Configuration.
export function preferencesValues(
  configuration: UserConfiguration,
  scheme: string,
  extras: PreferencesExtras,
): PreferencesValues {
  return {
    scheme,
    fontFamily: configuration.fontFamily ?? "",
    fontSize: configuration.fontSize,
    fontLineHeight: configuration.fontLineHeight,
    fontLigatures: configuration.fontLigatures,
    padding: { ...configuration.terminalPadding },
    transparency: configuration.transparency,
    blur: configuration.blur,
    scrollbackLines: configuration.scrollbackLines,
    optionKeyMode: configuration.optionKeyMode,
    showTitleBar: configuration.showTitleBar,
    showTabBar: configuration.showTabBar,
    alwaysOnTop: configuration.alwaysOnTop,
    confirmClose: configuration.confirmClose,
    logLevel: configuration.logLevel,
    keybinds: { ...configuration.keybinds },
    restoreWindows: extras.restoreWindows,
    highlightOutput: extras.highlightOutput,
  };
}

function section(document: Document, key: string): Document {
  const existing = document[key];
  if (
    typeof existing === "object" &&
    existing !== null &&
    !Array.isArray(existing)
  )
    return existing as Document;
  const created: Document = {};
  document[key] = created;
  return created;
}

// Writes a patch into a copy of the config.json document. Keys the dialog
// does not manage (windowsShell, unknown future keys) are kept as they are.
// Keybinds equal to the platform default are removed instead of written.
export function applyPreferencesPatch(
  original: Document,
  patch: PreferencesPatch,
  defaultKeybinds: TerminalKeybinds,
  themePath: string | null | undefined,
): Document {
  const document = structuredClone(original);
  document.version = 1;
  const set = (key: string, field: string, value: unknown) => {
    section(document, key)[field] = value;
  };
  if (patch.confirmClose !== undefined)
    document.confirmClose = patch.confirmClose;
  if (patch.logLevel !== undefined) document.logLevel = patch.logLevel;
  if (patch.fontFamily !== undefined) {
    if (patch.fontFamily.trim() === "") delete section(document, "font").family;
    else set("font", "family", patch.fontFamily.trim());
  }
  if (patch.fontSize !== undefined) set("font", "size", patch.fontSize);
  if (patch.fontLineHeight !== undefined)
    set("font", "lineHeight", patch.fontLineHeight);
  if (patch.fontLigatures !== undefined)
    set("font", "ligatures", patch.fontLigatures);
  if (patch.padding !== undefined) {
    const padding = section(section(document, "terminal"), "padding");
    Object.assign(padding, patch.padding);
  }
  if (patch.scrollbackLines !== undefined)
    set("scrollback", "lines", patch.scrollbackLines);
  if (patch.optionKeyMode !== undefined)
    set("keyboard", "optionAsAlt", patch.optionKeyMode);
  for (const field of [
    "alwaysOnTop",
    "blur",
    "transparency",
    "showTitleBar",
    "showTabBar",
  ] as const)
    if (patch[field] !== undefined) set("window", field, patch[field]);
  if (patch.keybinds !== undefined) {
    const keybinds = section(document, "keybinds");
    for (const [action, accelerator] of Object.entries(patch.keybinds)) {
      if (accelerator === defaultKeybinds[action as keyof TerminalKeybinds])
        delete keybinds[action];
      else keybinds[action] = accelerator;
    }
    if (Object.keys(keybinds).length === 0) delete document.keybinds;
  }
  // null selects the bundled theme; undefined leaves the theme alone.
  if (themePath === null) delete document.theme;
  else if (themePath !== undefined) document.theme = { path: themePath };
  for (const key of ["font", "terminal", "scrollback", "keyboard", "window"])
    if (
      typeof document[key] === "object" &&
      document[key] !== null &&
      Object.keys(document[key]).length === 0
    )
      delete document[key];
  return document;
}

// Restore Defaults keeps only what the dialog does not manage.
export function defaultPreferencesDocument(original: Document): Document {
  return {
    version: 1,
    ...(typeof original.windowsShell === "string"
      ? { windowsShell: original.windowsShell }
      : {}),
  };
}
