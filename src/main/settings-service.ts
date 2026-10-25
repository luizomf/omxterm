import { createHash, randomBytes } from "node:crypto";
import {
  chmod,
  mkdir,
  lstat,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
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
import type { SettingsMessage } from "../shared/settings-messages";
import type { UserConfigurationReloadOutcome } from "./user-configuration-reloader";
import {
  DEFAULT_USER_CONFIGURATION,
  loadUserConfiguration,
  resolveUserConfigurationPath,
  type LoadUserConfigurationOptions,
} from "./user-configuration";

export interface SettingsFiles {
  read(filePath: string): Promise<Uint8Array>;
  // Prepare text, then check the revision immediately before atomic replacement.
  // False means a concurrent edit was detected; no replacement was performed.
  replace(filePath: string, text: string, revision: string): Promise<boolean>;
}

export interface SettingsService {
  snapshot(): Promise<SettingsSnapshot>;
  change(change: SettingsChange): Promise<SettingsResult>;
  saveText(text: string, revision: string): Promise<SettingsResult>;
}

interface CurrentDocument {
  readonly revision: string;
  readonly text: string | null;
  readonly document?: Record<string, unknown>;
  readonly configuration?: UserConfiguration;
  readonly problem?: SettingsMessage;
}

const encoder = new TextEncoder();
const RESTART_SUFFIX = " Fix the file and restart OMXTerm.";

// Persistence adapted from ruscher/omxterm PR #622's preferences service at
// b3c3a4ad6c1f2224bded65873ba0b09a07ec5d38 (MIT).
// Explicit, user-requested writes to config.json. Requests run one at a time.
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
  let queue: Promise<unknown> = Promise.resolve();
  const serialize = <Result>(task: () => Promise<Result>) => {
    const run = queue.then(task, task);
    queue = run.catch(() => {});
    return run;
  };

  const validate = async (bytes: Uint8Array) => {
    const load = await loadUserConfiguration({
      ...options.loadOptions,
      read: fixedRead(bytes),
    });
    return load;
  };

  const readCurrent = async (): Promise<CurrentDocument> => {
    let bytes: Uint8Array;
    try {
      bytes = await files.read(configurationPath);
    } catch (cause) {
      if (isNotFound(cause)) return { revision: "absent", text: null };
      return {
        revision: "unreadable",
        text: null,
        problem: {
          kind: cause instanceof SettingsSymlinkError ? "symlink" : "read",
        },
      };
    }
    const revision = revisionOf(bytes);
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      return {
        revision,
        text: null,
        problem: { kind: "utf8" },
      };
    }
    let document: unknown;
    try {
      document = JSON.parse(text);
    } catch {
      return { revision, text, problem: { kind: "json" } };
    }
    if (!isRecord(document))
      return { revision, text, problem: { kind: "object" } };
    const load = await loadUserConfiguration({
      ...options.loadOptions,
      read: fixedRead(bytes),
    });
    return load.fallback
      ? { revision, text, document, problem: describe(load.fallback.error) }
      : { revision, text, document, configuration: load.configuration };
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
    const bytes = encoder.encode(text);
    const candidate = await validate(bytes);
    if (candidate.fallback)
      return {
        status: "rejected",
        message: describe(candidate.fallback.error),
        snapshot: snapshotOf(await readCurrent()),
      };
    // Build the response before writing, using the same UTF-8 decoding as the
    // loader/read snapshots (including BOM removal). Its revision still names
    // the exact submitted bytes; parsing cannot fail after persistence.
    const decoded = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    const savedSnapshot = snapshotOf({
      revision: revisionOf(bytes),
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
      if (!(await files.replace(configurationPath, text, current.revision)))
        return conflict();
    } catch (cause) {
      return {
        status: "failed",
        message: {
          kind: cause instanceof SettingsSymlinkError ? "symlink" : "write",
        },
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

  return {
    snapshot: () => serialize(async () => snapshotOf(await readCurrent())),
    change: (change) =>
      serialize(async () => {
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
        setField(document, change.path, change.value);
        return commit(`${JSON.stringify(document, null, 2)}\n`, current);
      }),
    saveText: (text, revision) =>
      serialize(async () => {
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
    "terminal.padding.top": configuration.terminalPadding.top,
    "terminal.padding.right": configuration.terminalPadding.right,
    "terminal.padding.bottom": configuration.terminalPadding.bottom,
    "terminal.padding.left": configuration.terminalPadding.left,
    "scrollback.lines": configuration.scrollbackLines,
    "keyboard.optionAsAlt": configuration.optionKeyMode,
    "window.alwaysOnTop": configuration.alwaysOnTop,
    "window.showTitleBar": configuration.showTitleBar,
    "window.showTabBar": configuration.showTabBar,
    "theme.path": typeof theme === "string" ? theme : "",
  };
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

function revisionOf(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

class SettingsSymlinkError extends Error {
  constructor() {
    super("Settings does not write through configuration symlinks");
  }
}

export const nodeSettingsFiles: SettingsFiles = {
  async read(filePath) {
    if ((await lstat(filePath)).isSymbolicLink())
      throw new SettingsSymlinkError();
    return readFile(filePath);
  },
  async replace(filePath, text, revision) {
    await mkdir(path.dirname(filePath), { recursive: true });
    const mode = await stat(filePath).then(
      (stats) => stats.mode & 0o777,
      () => undefined,
    );
    const temporary = `${filePath}.${randomBytes(6).toString("hex")}.tmp`;
    let replaced = false;
    try {
      await writeFile(temporary, text, { encoding: "utf8", flag: "wx" });
      if (mode !== undefined) await chmod(temporary, mode);
      const latest = await nodeSettingsFiles
        .read(filePath)
        .then(revisionOf, (cause: unknown) => {
          if (isNotFound(cause)) return "absent";
          throw cause;
        });
      // This closes validation/preparation races, not arbitrary cross-process
      // compare-and-swap: an external writer can still race this final rename.
      if (latest !== revision) return false;
      await rename(temporary, filePath);
      replaced = true;
      return true;
    } finally {
      // A successful rename already consumed the temporary entry. No later
      // cleanup failure may turn a persisted write into a failed result.
      if (!replaced) await rm(temporary, { force: true });
    }
  },
};
