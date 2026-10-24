import { createHash, randomBytes } from "node:crypto";
import {
  chmod,
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import type {
  SettingsChange,
  SettingsPath,
  SettingsResult,
  SettingsSnapshot,
} from "../shared/settings";
import type { UserConfiguration } from "../shared/user-configuration";
import type { UserConfigurationReloadOutcome } from "./user-configuration-reloader";
import {
  DEFAULT_USER_CONFIGURATION,
  loadUserConfiguration,
  resolveUserConfigurationPath,
  type LoadUserConfigurationOptions,
} from "./user-configuration";

export interface SettingsFiles {
  read(filePath: string): Promise<Uint8Array>;
  // Replaces filePath atomically with text, keeping an existing file's mode.
  replace(filePath: string, text: string): Promise<void>;
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
  readonly problem?: string;
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

  const validate = async (text: string) => {
    const load = await loadUserConfiguration({
      ...options.loadOptions,
      read: fixedRead(encoder.encode(text)),
    });
    return load.fallback ? describe(load.fallback.error) : undefined;
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
        problem: "config.json could not be read",
      };
    }
    const revision = createHash("sha256").update(bytes).digest("hex");
    let text: string;
    try {
      text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
    } catch {
      return {
        revision,
        text: null,
        problem: "config.json is not valid UTF-8",
      };
    }
    let document: unknown;
    try {
      document = JSON.parse(text);
    } catch {
      return { revision, text, problem: "config.json is not valid JSON" };
    }
    if (!isRecord(document))
      return { revision, text, problem: "config.json must hold an object" };
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

  const commit = async (text: string): Promise<SettingsResult> => {
    const invalid = await validate(text);
    if (invalid !== undefined)
      return {
        status: "rejected",
        message: invalid,
        snapshot: snapshotOf(await readCurrent()),
      };
    try {
      await files.replace(configurationPath, text);
    } catch {
      return {
        status: "failed",
        message: "config.json could not be written. Nothing was changed.",
        snapshot: snapshotOf(await readCurrent()),
      };
    }
    const application = await options.reload();
    return {
      status: "saved",
      snapshot: snapshotOf(await readCurrent()),
      application,
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
            message: `${current.problem}. Fix it in the Config File page first.`,
            snapshot: snapshotOf(current),
          };
        const document = structuredClone(current.document ?? { version: 1 });
        setField(document, change.path, change.value);
        return commit(`${JSON.stringify(document, null, 2)}\n`);
      }),
    saveText: (text, revision) =>
      serialize(async () => {
        const current = await readCurrent();
        if (current.revision !== revision)
          return {
            status: "conflict",
            message:
              "config.json changed since this draft was opened. Copy your draft, reload the file and apply your edits again.",
            snapshot: snapshotOf(current),
          };
        return commit(text);
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

export const nodeSettingsFiles: SettingsFiles = {
  read: (filePath) => readFile(filePath),
  async replace(filePath, text) {
    await mkdir(path.dirname(filePath), { recursive: true });
    const mode = await stat(filePath).then(
      (stats) => stats.mode & 0o777,
      () => undefined,
    );
    const temporary = `${filePath}.${randomBytes(6).toString("hex")}.tmp`;
    try {
      await writeFile(temporary, text, { encoding: "utf8", flag: "wx" });
      if (mode !== undefined) await chmod(temporary, mode);
      await rename(temporary, filePath);
    } catch (cause) {
      await rm(temporary, { force: true });
      throw cause;
    }
  },
};
