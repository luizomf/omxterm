import { createHash, randomBytes } from "node:crypto";
import {
  mkdir,
  lstat,
  open,
  readFile,
  realpath,
  rename,
  rm,
} from "node:fs/promises";
import { constants, type Stats } from "node:fs";
import path from "node:path";
import {
  SETTINGS_FIELDS,
  type SettingsLifetime,
  type SettingsChange,
  type SettingsPath,
  type SettingsResult,
  type SettingsSnapshot,
} from "../shared/settings";
import type { UserConfiguration } from "../shared/user-configuration";
import type { SettingsThemesResult } from "../shared/settings-themes";
import { discoverSettingsThemes } from "./settings-themes";
import { createSettingsQueue } from "./settings-queue";
import type { SettingsMessage } from "../shared/settings-messages";
import {
  TERMINAL_ACTION_NAMES,
  terminalDefaultKeybinds,
  type TerminalActionName,
  type TerminalKeybinds,
} from "../shared/terminal-keybinds";
import type {
  KeybindState,
  SettingsKeybind,
  SettingsKeybindChange,
} from "../shared/settings-keybinds";
import type { UserConfigurationReloadOutcome } from "./user-configuration-reloader";
import {
  DEFAULT_USER_CONFIGURATION,
  loadUserConfiguration,
  resolveUserConfigurationPath,
  type LoadUserConfigurationOptions,
} from "./user-configuration";

interface SettingsFile {
  readonly target: string;
  readonly bytes: Uint8Array | null;
  readonly mode?: number;
}

export interface SettingsFiles {
  read(filePath: string): Promise<SettingsFile>;
  // False means a concurrent edit or retargeting was detected; no replacement occurred.
  replace(
    filePath: string,
    text: string,
    expected: SettingsFile,
  ): Promise<boolean>;
}

export interface SettingsService {
  snapshot(): Promise<SettingsSnapshot>;
  themes(): Promise<SettingsThemesResult>;
  change(change: SettingsChange): Promise<SettingsResult>;
  saveText(text: string, revision: string): Promise<SettingsResult>;
  changeKeybind(change: SettingsKeybindChange): Promise<SettingsResult>;
}

interface CurrentDocument {
  readonly revision: string;
  readonly text: string | null;
  readonly file?: SettingsFile;
  readonly document?: Record<string, unknown>;
  readonly configuration?: UserConfiguration;
  readonly problem?: SettingsMessage;
}

const encoder = new TextEncoder();
const RESTART_SUFFIX = " Fix the file and restart OMXTerm.";

// Persistence adapted from ruscher/omxterm PR #622's preferences service at
// b3c3a4ad6c1f2224bded65873ba0b09a07ec5d38 (MIT).
// Explicit, user-requested writes to config.json. Requests run one at a time;
// consecutive not-started theme/transparency choices coalesce to the latest value.
// A graphical change rereads the file and changes only its own field, so other
// entries, including external edits, are kept; a raw JSON save must start from
// the file's current revision. Every candidate passes the same loader as
// startup before it is written, and nothing is written on open.
export function createSettingsService(options: {
  readonly loadOptions: LoadUserConfigurationOptions;
  readonly reload: () => Promise<UserConfigurationReloadOutcome>;
  readonly files?: SettingsFiles;
}): SettingsService {
  const files = options.files ?? nodeSettingsFiles;
  const configurationPath = resolveUserConfigurationPath(
    options.loadOptions.environment,
    options.loadOptions.homeDirectory,
  );
  const validate = (bytes: Uint8Array) =>
    loadUserConfiguration({ ...options.loadOptions, read: fixedRead(bytes) });

  const readCurrent = async (): Promise<CurrentDocument> => {
    let file: SettingsFile;
    try {
      file = await files.read(configurationPath);
    } catch (cause) {
      return {
        revision: "unreadable",
        text: null,
        problem: { kind: settingsFileError(cause, "read") },
      };
    }
    const revision = revisionOf(file);
    const { bytes } = file;
    if (bytes === null) return { revision, text: null, file };
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      return {
        revision,
        text: null,
        file,
        problem: { kind: "utf8" },
      };
    }
    let document: unknown;
    try {
      document = JSON.parse(text);
    } catch {
      return { revision, text, file, problem: { kind: "json" } };
    }
    if (!isRecord(document))
      return { revision, text, file, problem: { kind: "object" } };
    const load = await loadUserConfiguration({
      ...options.loadOptions,
      read: fixedRead(bytes),
    });
    return load.fallback
      ? {
          revision,
          text,
          file,
          document,
          problem: describe(load.fallback.error),
        }
      : { revision, text, file, document, configuration: load.configuration };
  };

  const snapshotOf = (current: CurrentDocument): SettingsSnapshot => ({
    configurationPath,
    platform: options.loadOptions.platform ?? process.platform,
    revision: current.revision,
    text: current.text,
    values: settingsValues(
      current.configuration ?? DEFAULT_USER_CONFIGURATION,
      current.document,
    ),
    ...(current.problem ? { problem: current.problem } : {}),
    keybinds: settingsKeybinds(
      current.configuration?.keybinds ??
        terminalDefaultKeybinds(
          options.loadOptions.platform ?? process.platform,
        ),
      current.document,
    ),
  });

  const conflict = async (): Promise<SettingsResult> => ({
    status: "conflict",
    message: { kind: "conflict" },
    snapshot: snapshotOf(await readCurrent()),
  });

  const commit = async (
    text: string,
    current: CurrentDocument,
  ): Promise<SettingsResult> => {
    // A read failure has no safe destination or revision, including for raw saves.
    if (!current.file)
      return {
        status: "rejected",
        message: current.problem ?? { kind: "read" },
        snapshot: snapshotOf(current),
      };
    const bytes = encoder.encode(text);
    const candidate = await validate(bytes);
    if (candidate.fallback)
      return {
        status: "rejected",
        message: describe(candidate.fallback.error),
        snapshot: snapshotOf(await readCurrent()),
      };
    // Build the response before writing, using the same UTF-8 decoding as the
    // loader/read snapshots (including BOM removal). Its revision identifies
    // the destination and exact submitted bytes; parsing happens before persistence.
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const savedSnapshot = snapshotOf({
      revision: revisionOf({ ...current.file, bytes }),
      text: decoded,
      document: JSON.parse(decoded) as Record<string, unknown>,
      configuration: candidate.configuration,
    });
    const lifetimes = changedLifetimes(
      current.configuration ?? DEFAULT_USER_CONFIGURATION,
      candidate.configuration,
      options.loadOptions.platform ?? process.platform,
    );
    try {
      if (!(await files.replace(configurationPath, text, current.file)))
        return conflict();
    } catch (cause) {
      if (cause instanceof SettingsFileError && cause.kind === "conflict")
        return conflict();
      return {
        status: "failed",
        message: { kind: settingsFileError(cause, "write") },
        snapshot: snapshotOf(await readCurrent()),
      };
    }
    // Persistence already succeeded. Exceptional consumer/transport failure
    // cannot turn it into a "not saved" response or imply rollback.
    let application: UserConfigurationReloadOutcome;
    try {
      application = await options.reload();
    } catch {
      application = {
        applied: false,
        notice: { kind: "application" },
      };
    }
    return {
      status: "saved",
      // This snapshot belongs to the bytes we saved, not an external edit that
      // might arrive while reload applies. New typing must retain that base.
      snapshot: savedSnapshot,
      application,
      lifetimes,
    };
  };

  // A graphical edit rereads the file and changes only its own entry.
  const edit = async (
    mutate: (document: Record<string, unknown>) => void,
  ): Promise<SettingsResult> => {
    const current = await readCurrent();
    // A parsed but invalid document may be repaired by this very change;
    // the candidate still passes full validation before it is written.
    if (current.problem && !current.document)
      return {
        status: "rejected",
        message: current.problem,
        snapshot: snapshotOf(current),
      };
    const document = structuredClone(current.document ?? { version: 1 });
    mutate(document);
    return commit(`${JSON.stringify(document, null, 2)}\n`, current);
  };

  const queue = createSettingsQueue((change) =>
    edit((document) => setField(document, change.path, change.value)),
  );

  return {
    snapshot: () => queue.run(async () => snapshotOf(await readCurrent())),
    themes: () => queue.run(() => discoverSettingsThemes(configurationPath)),
    change: queue.change,
    changeKeybind: (change) =>
      queue.run(() => edit((document) => setKeybind(document, change))),
    saveText: (text, revision) =>
      queue.run(async () => {
        const current = await readCurrent();
        if (current.revision !== revision)
          return {
            status: "conflict",
            message: { kind: "conflict" },
            snapshot: snapshotOf(current),
          };
        return commit(text, current);
      }),
  };
}

// Sets one dotted path, or removes it (null) together with emptied groups.
export function setField(
  document: Record<string, unknown>,
  fieldPath: SettingsPath,
  value: unknown,
): void {
  const keys = fieldPath.split(".");
  const last = keys.pop()!;
  const parents: Record<string, unknown>[] = [document];
  for (const key of keys) {
    const parent = parents.at(-1)!;
    if (!isRecord(parent[key])) {
      if (value === null) return;
      parent[key] = {};
    }
    parents.push(parent[key] as Record<string, unknown>);
  }
  const target = parents.at(-1)!;
  if (value !== null) {
    target[last] = value;
    return;
  }
  delete target[last];
  for (let index = keys.length - 1; index >= 0; index -= 1) {
    const group = parents[index + 1]!;
    if (Object.keys(group).length > 0) break;
    delete parents[index]![keys[index]!];
  }
}

function settingsValues(
  configuration: UserConfiguration,
  document: Record<string, unknown> | undefined,
): SettingsSnapshot["values"] {
  const theme = isRecord(document?.theme) ? document.theme.path : undefined;
  return {
    language: configuration.language,
    confirmClose: configuration.confirmClose,
    logLevel: configuration.logLevel,
    windowsShell: configuration.windowsShell ?? "",
    "font.family": configuration.fontFamily ?? "",
    "font.size": configuration.fontSize,
    "font.lineHeight": configuration.fontLineHeight,
    "font.ligatures": configuration.fontLigatures,
    "terminal.contextMenuEnabled": configuration.terminalContextMenuEnabled,
    "terminal.padding.top": configuration.terminalPadding.top,
    "terminal.padding.right": configuration.terminalPadding.right,
    "terminal.padding.bottom": configuration.terminalPadding.bottom,
    "terminal.padding.left": configuration.terminalPadding.left,
    "scrollback.lines": configuration.scrollbackLines,
    "keyboard.optionAsAlt": configuration.optionKeyMode,
    "window.auxiliaryPanelSide": configuration.auxiliaryPanelSide,
    "window.transparency": configuration.transparency,
    "window.blur": configuration.blur,
    "window.alwaysOnTop": configuration.alwaysOnTop,
    "window.showTitleBar": configuration.showTitleBar,
    "window.showTabBar": configuration.showTabBar,
    "theme.path": typeof theme === "string" ? theme : "",
  };
}

// Inherit removes the action's entry (and an emptied keybinds group); unbound
// writes null; custom writes the accelerator. Other entries are kept.
export function setKeybind(
  document: Record<string, unknown>,
  change: SettingsKeybindChange,
): void {
  const keybinds = isRecord(document.keybinds) ? document.keybinds : {};
  if (change.choice.state === "inherit") delete keybinds[change.action];
  else
    keybinds[change.action] =
      change.choice.state === "unbound" ? null : change.choice.accelerator;
  if (Object.keys(keybinds).length > 0) document.keybinds = keybinds;
  else delete document.keybinds;
}

function settingsKeybinds(
  effective: TerminalKeybinds,
  document: Record<string, unknown> | undefined,
): Partial<Record<TerminalActionName, SettingsKeybind>> {
  const entries = isRecord(document?.keybinds) ? document.keybinds : {};
  return Object.fromEntries(
    TERMINAL_ACTION_NAMES.map((action) => {
      const entry = Object.hasOwn(entries, action)
        ? entries[action]
        : undefined;
      const state: KeybindState =
        entry === undefined ? "inherit" : entry === null ? "unbound" : "custom";
      return [action, { effective: effective[action], state }];
    }),
  );
}

// Serves the candidate bytes to the startup loader instead of the disk.
function fixedRead(bytes: Uint8Array): typeof readFile {
  return (async () => Buffer.from(bytes)) as unknown as typeof readFile;
}

function describe(error: { readonly message: string }): string {
  return error.message.replace(RESTART_SUFFIX, "");
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isNotFound(cause: unknown): boolean {
  return (
    typeof cause === "object" &&
    cause !== null &&
    (cause as { code?: unknown }).code === "ENOENT"
  );
}

// Compare validated effective values, not document spelling: removing an entry
// can change its lifetime, while explicitly writing its default may be a no-op.
function changedLifetimes(
  before: UserConfiguration,
  after: UserConfiguration,
  platform: string,
): Exclude<SettingsLifetime, "live">[] {
  const previous = settingsValues(before, undefined);
  const next = settingsValues(after, undefined);
  return [
    ...new Set(
      (Object.keys(SETTINGS_FIELDS) as SettingsPath[])
        .filter((field) => field !== "windowsShell" || platform === "win32")
        .filter((field) => previous[field] !== next[field])
        .map((field) => SETTINGS_FIELDS[field].lifetime)
        .filter((lifetime) => lifetime !== "live"),
    ),
  ];
}

function revisionOf(file: SettingsFile): string {
  const hash = createHash("sha256").update(file.target).update("\0");
  if (file.bytes === null) hash.update("0");
  else hash.update("1").update(file.bytes);
  return hash.digest("hex");
}

class SettingsFileError extends Error {
  constructor(readonly kind: "symlink" | "target" | "conflict" | "cleanup") {
    super(kind);
  }
}

function settingsFileError(
  cause: unknown,
  fallback: "read" | "write",
): "symlink" | "target" | "conflict" | "cleanup" | "read" | "write" {
  return cause instanceof SettingsFileError ? cause.kind : fallback;
}

// Resolve existing links with the OS, including relative links and linked
// parents. An absent ordinary path is allowed; an existing dangling link is not.
async function settingsTarget(filePath: string): Promise<string> {
  let current = path.resolve(filePath);
  const missing: string[] = [];
  for (;;) {
    try {
      return path.join(await realpath(current), ...missing);
    } catch (cause) {
      if (!isNotFound(cause)) {
        const code = (cause as NodeJS.ErrnoException).code;
        if (code === "ELOOP") throw new SettingsFileError("symlink");
        if (code === "ENOTDIR") throw new SettingsFileError("target");
        throw cause;
      }
      try {
        await lstat(current);
        // An entry exists but its resolution failed: do not create its target.
        throw new SettingsFileError("symlink");
      } catch (entryError) {
        if (!isNotFound(entryError)) throw entryError;
      }
      const parent = path.dirname(current);
      if (parent === current) throw cause;
      missing.unshift(path.basename(current));
      current = parent;
    }
  }
}

function sameSettingsFile(first: SettingsFile, second: SettingsFile): boolean {
  return revisionOf(first) === revisionOf(second) && first.mode === second.mode;
}

function sameTemporary(entry: Stats, original: Stats | undefined): boolean {
  return (
    original !== undefined &&
    entry.isFile() &&
    entry.dev === original.dev &&
    entry.ino === original.ino
  );
}

export const nodeSettingsFiles: SettingsFiles = {
  async read(filePath) {
    const target = await settingsTarget(filePath);
    let entry;
    try {
      entry = await lstat(target);
    } catch (cause) {
      if (!isNotFound(cause)) throw cause;
    }
    let bytes: Uint8Array | null = null;
    let mode: number | undefined;
    if (entry) {
      if (entry.isSymbolicLink()) throw new SettingsFileError("conflict");
      if (!entry.isFile()) throw new SettingsFileError("target");
      // Non-blocking open and fstat prevent a swapped FIFO or device from
      // being read. The resolved final component must not become a link.
      const handle = await open(
        target,
        constants.O_RDONLY | constants.O_NONBLOCK | (constants.O_NOFOLLOW ?? 0),
      );
      try {
        const status = await handle.stat();
        if (!status.isFile()) throw new SettingsFileError("target");
        mode = status.mode & 0o777;
        bytes = await handle.readFile();
      } finally {
        await handle.close();
      }
    }
    if ((await settingsTarget(filePath)) !== target)
      throw new SettingsFileError("conflict");
    return { target, bytes, ...(mode === undefined ? {} : { mode }) };
  },
  async replace(filePath, text, expected) {
    if (!sameSettingsFile(await nodeSettingsFiles.read(filePath), expected))
      return false;
    await mkdir(path.dirname(expected.target), { recursive: true });
    const temporary = path.join(
      path.dirname(expected.target),
      `.omxterm-settings-${randomBytes(6).toString("hex")}.tmp`,
    );
    let created = false;
    let replaced = false;
    let identity: Stats | undefined;
    try {
      // The target may be private even when the process has a permissive umask.
      const handle = await open(temporary, "wx", 0o600);
      created = true;
      try {
        identity = await handle.stat();
        await handle.writeFile(text, "utf8");
        const latest = await nodeSettingsFiles.read(filePath);
        if (!sameSettingsFile(latest, expected)) return false;
        // Use the owned handle, never a path that another process can replace.
        if (expected.mode !== undefined) await handle.chmod(expected.mode);
      } finally {
        await handle.close();
      }
      if (!sameSettingsFile(await nodeSettingsFiles.read(filePath), expected))
        return false;
      if (!sameTemporary(await lstat(temporary), identity))
        throw new SettingsFileError("conflict");
      // These checks minimize races, but are not a cross-process atomic CAS:
      // either pathname can still change between its final check and rename.
      await rename(temporary, expected.target);
      replaced = true;
      return true;
    } finally {
      if (created && !replaced) {
        try {
          const entry = await lstat(temporary);
          // Never delete a replacement entry belonging to another writer.
          if (!sameTemporary(entry, identity))
            throw new Error("temporary changed");
          await rm(temporary);
        } catch (cause) {
          if (!isNotFound(cause)) throw new SettingsFileError("cleanup");
        }
      }
    }
  },
};
