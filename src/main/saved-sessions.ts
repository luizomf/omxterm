import { randomBytes } from "node:crypto";
import { statSync } from "node:fs";
import path from "node:path";
import {
  parseSshTarget,
  validateFolder,
  validateSession,
  validateSessionDocument,
  type SavedSessionsDocument,
  type SessionDefinition,
  type SessionFolder,
  type SshSessionDefinition,
} from "../shared/saved-sessions";
import {
  createApplicationDocumentStore,
  type ApplicationDocumentLoad,
  type ApplicationDocumentStore,
} from "./application-data";
import type { LocalTerminalSessionOptions } from "./local-terminal-session";
import {
  expandHome,
  sftpSubsystemArguments,
  sshArguments,
  sshDisplayTarget,
} from "./ssh-command";
import { readSshConfigHosts, type SshConfigHost } from "./ssh-config-import";

export type SessionLaunchBase = Omit<
  LocalTerminalSessionOptions,
  "launchRequest" | "workingDirectory" | "initialInput" | "title"
>;

export interface SavedSessionService {
  load(): Promise<ApplicationDocumentLoad<SavedSessionsDocument>>;
  current(): SavedSessionsDocument;
  saveSession(value: unknown): Promise<SessionDefinition>;
  deleteSession(id: string): Promise<void>;
  saveFolder(value: unknown): Promise<SessionFolder>;
  // Deleting a folder deletes its subfolders and every session inside them.
  deleteFolder(id: string): Promise<void>;
  markUsed(id: string): Promise<void>;
  importDocument(value: unknown): Promise<{ readonly added: number }>;
  exportDocument(): string;
  importSshConfig(): Promise<{ readonly added: number }>;
  // Ephemeral Quick Connect definition: validated, never stored.
  quickConnect(target: string): SshSessionDefinition | undefined;
  launchOptions(
    id: string | SessionDefinition,
    base: SessionLaunchBase,
  ): LocalTerminalSessionOptions;
  // How the Files panel reaches an SSH session's files: the ssh executable
  // and arguments for its SFTP subsystem, with a label for the panel.
  // undefined for a local session or one that no longer exists.
  sftpCommand(reference: string | SshSessionDefinition):
    | {
        readonly executable: string;
        readonly arguments: readonly string[];
        readonly label: string;
      }
    | undefined;
  subscribe(listener: (document: SavedSessionsDocument) => void): () => void;
  // Decodes a backup's document now (throwing if it is invalid) and returns
  // the commit that replaces the current one, run in mutation order.
  prepareRestore(bytes: Uint8Array): () => Promise<void>;
}

export interface SavedSessionServiceOptions {
  readonly directory: string;
  readonly homeDirectory: string;
  readonly platform: string;
  readonly sshExecutable: () => string;
  readonly controlDirectory?: string;
  readonly now?: () => number;
  readonly store?: ApplicationDocumentStore<SavedSessionsDocument>;
  readonly readSshConfig?: typeof readSshConfigHosts;
  // The askpass environment of a password session with a stored password.
  readonly passwordEnvironment?: (
    sessionId: string,
  ) => Readonly<Record<string, string>> | undefined;
}

export class SavedSessionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SavedSessionError";
  }
}

export function newSavedSessionId(): string {
  return randomBytes(9).toString("base64url");
}

export function createSavedSessionService(
  options: SavedSessionServiceOptions,
): SavedSessionService {
  const store =
    options.store ??
    createApplicationDocumentStore<SavedSessionsDocument>(
      {
        fileName: "sessions.json",
        version: 1,
        empty: () => ({ folders: [], sessions: [] }),
        validate: validateSessionDocument,
      },
      { directory: options.directory },
    );
  const now = options.now ?? Date.now;
  let document: SavedSessionsDocument = { folders: [], sessions: [] };
  const listeners = new Set<(document: SavedSessionsDocument) => void>();
  // Serialize mutations: each one validates and saves the complete document.
  let queue: Promise<unknown> = Promise.resolve();

  const commit = <T>(
    mutate: (current: SavedSessionsDocument) => {
      readonly next: SavedSessionsDocument;
      readonly result: T;
    },
  ): Promise<T> => {
    const run = queue.then(async () => {
      const { next, result } = mutate(document);
      const validated = validateSessionDocument(next);
      await store.save(validated);
      document = validated;
      for (const listener of listeners) listener(document);
      return result;
    });
    queue = run.catch(() => undefined);
    return run;
  };

  const find = (id: string) =>
    document.sessions.find((session) => session.id === id);
  const markUsed = (id: string) => {
    if (!find(id)) return Promise.resolve();
    return commit((current) => ({
      next: {
        ...current,
        sessions: current.sessions.map((session) =>
          session.id === id ? { ...session, lastUsedAt: now() } : session,
        ),
      },
      result: undefined,
    }));
  };

  return {
    async load() {
      const loaded = await store.load();
      document = loaded.value;
      return loaded;
    },
    current: () => document,
    async saveSession(value) {
      const candidate = withId(value);
      const session = validateSession(candidate);
      return commit((current) => {
        const index = current.sessions.findIndex(
          (item) => item.id === session.id,
        );
        const sessions =
          index < 0
            ? [...current.sessions, session]
            : current.sessions.map((item, position) =>
                position === index ? session : item,
              );
        return { next: { ...current, sessions }, result: session };
      });
    },
    deleteSession(id) {
      return commit((current) => ({
        next: {
          ...current,
          sessions: current.sessions.filter((session) => session.id !== id),
        },
        result: undefined,
      }));
    },
    async saveFolder(value) {
      const folder = validateFolder(withId(value));
      return commit((current) => {
        const exists = current.folders.some((item) => item.id === folder.id);
        const folders = exists
          ? current.folders.map((item) =>
              item.id === folder.id ? folder : item,
            )
          : [...current.folders, folder];
        return { next: { ...current, folders }, result: folder };
      });
    },
    deleteFolder(id) {
      return commit((current) => {
        const removed = descendantFolders(current.folders, id);
        return {
          next: {
            folders: current.folders.filter(
              (folder) => !removed.has(folder.id),
            ),
            sessions: current.sessions.filter(
              (session) =>
                session.folderId === undefined ||
                !removed.has(session.folderId),
            ),
          },
          result: undefined,
        };
      });
    },
    markUsed,
    async importDocument(value) {
      const imported = validateSessionDocument(value);
      return commit((current) => {
        const merged = mergeDocuments(current, imported);
        return {
          next: merged,
          result: { added: merged.sessions.length - current.sessions.length },
        };
      });
    },
    exportDocument() {
      // Exports carry definitions only; secrets live in the Credential Store.
      return `${JSON.stringify(
        { format: "omxterm-sessions", version: 1, ...document },
        null,
        2,
      )}\n`;
    },
    async importSshConfig() {
      const hosts = await (options.readSshConfig ?? readSshConfigHosts)(
        path.join(options.homeDirectory, ".ssh", "config"),
        options.homeDirectory,
      );
      return commit((current) => {
        const existing = new Set(
          current.sessions
            .filter((session) => session.kind === "ssh")
            .map((session) => (session as SshSessionDefinition).host),
        );
        const additions = hosts
          .filter((host) => !existing.has(host.alias))
          .map((host) => sessionFromSshConfig(host));
        return {
          next: { ...current, sessions: [...current.sessions, ...additions] },
          result: { added: additions.length },
        };
      });
    },
    quickConnect(target) {
      const parsed = parseSshTarget(target);
      if (!parsed) return undefined;
      return {
        id: "quick-connect",
        kind: "ssh",
        name: sshDisplayTarget(parsed),
        authentication: "agent",
        ...parsed,
      };
    },
    launchOptions(reference, base) {
      const session =
        typeof reference === "string" ? find(reference) : reference;
      if (!session)
        throw new SavedSessionError("The Saved Session no longer exists");
      if (typeof reference === "string")
        void markUsed(reference).catch(() => {});
      if (session.kind === "local") {
        const workingDirectory = session.workingDirectory
          ? expandHome(
              session.workingDirectory,
              options.homeDirectory,
              options.platform,
            )
          : undefined;
        if (workingDirectory !== undefined && !isDirectory(workingDirectory))
          throw new SavedSessionError(
            "The session's working directory does not exist",
          );
        return {
          ...base,
          title: session.name,
          ...(workingDirectory === undefined ? {} : { workingDirectory }),
          ...(session.program
            ? {
                launchRequest: {
                  kind: "explicit-command" as const,
                  executable: session.program,
                  arguments: session.arguments ?? [],
                },
              }
            : {}),
          ...(session.initialInput
            ? { initialInput: withLineEnding(session.initialInput) }
            : {}),
        };
      }
      const command = sshArguments(session, {
        platform: options.platform,
        homeDirectory: options.homeDirectory,
        ...(options.controlDirectory
          ? { controlDirectory: options.controlDirectory }
          : {}),
      });
      const askpass =
        session.authentication === "password"
          ? options.passwordEnvironment?.(session.id)
          : undefined;
      return {
        ...base,
        title: session.name,
        ...(askpass
          ? { extraEnvironment: { ...base.extraEnvironment, ...askpass } }
          : {}),
        launchRequest: {
          kind: "explicit-command",
          executable: options.sshExecutable(),
          arguments: command.arguments,
        },
      };
    },
    sftpCommand(reference) {
      const session =
        typeof reference === "string" ? find(reference) : reference;
      if (!session || session.kind !== "ssh") return undefined;
      return {
        executable: options.sshExecutable(),
        arguments: sftpSubsystemArguments(session, {
          platform: options.platform,
          homeDirectory: options.homeDirectory,
          ...(options.controlDirectory
            ? { controlDirectory: options.controlDirectory }
            : {}),
        }),
        label: sshDisplayTarget(session),
      };
    },
    prepareRestore(bytes) {
      const next = store.decode(bytes);
      return () => commit(() => ({ next, result: undefined }));
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function withId(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return value;
  const record = value as Record<string, unknown>;
  return record.id === undefined
    ? { ...record, id: newSavedSessionId() }
    : record;
}

function descendantFolders(
  folders: readonly SessionFolder[],
  rootId: string,
): Set<string> {
  const removed = new Set([rootId]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const folder of folders)
      if (
        folder.parentId &&
        removed.has(folder.parentId) &&
        !removed.has(folder.id)
      ) {
        removed.add(folder.id);
        changed = true;
      }
  }
  return removed;
}

// Imported items keep their ids unless they collide, in which case they get
// fresh ids (and their folder references follow).
function mergeDocuments(
  current: SavedSessionsDocument,
  imported: SavedSessionsDocument,
): SavedSessionsDocument {
  const taken = new Set([
    ...current.folders.map((folder) => folder.id),
    ...current.sessions.map((session) => session.id),
  ]);
  const remap = new Map<string, string>();
  const fresh = (id: string) => {
    const next = taken.has(id) ? newSavedSessionId() : id;
    taken.add(next);
    remap.set(id, next);
    return next;
  };
  const folders = imported.folders.map((folder) => ({
    ...folder,
    id: fresh(folder.id),
  }));
  const remappedFolders = folders.map((folder) =>
    folder.parentId
      ? { ...folder, parentId: remap.get(folder.parentId)! }
      : folder,
  );
  const sessions = imported.sessions.map((session) => ({
    ...session,
    id: fresh(session.id),
    ...(session.folderId ? { folderId: remap.get(session.folderId)! } : {}),
  }));
  return {
    folders: [...current.folders, ...remappedFolders],
    sessions: [...current.sessions, ...sessions],
  };
}

function sessionFromSshConfig(host: SshConfigHost): SshSessionDefinition {
  // The alias stays the destination so ssh applies the full Host block
  // (including directives OMXTerm does not model, such as ProxyCommand).
  return {
    id: newSavedSessionId(),
    kind: "ssh",
    name: host.alias,
    host: host.alias,
    authentication: "agent",
    ...(host.forwardX11 ? { x11: true } : {}),
  };
}

function isDirectory(directory: string): boolean {
  try {
    return statSync(directory).isDirectory();
  } catch {
    return false;
  }
}

function withLineEnding(text: string): string {
  return /[\r\n]$/u.test(text)
    ? text.replace(/\r?\n/gu, "\r")
    : `${text.replace(/\r?\n/gu, "\r")}\r`;
}
