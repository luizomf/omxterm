import { isSavedSessionId } from "./terminal-launch";
import { validateForward } from "./saved-session-forwards";
import {
  isValidHost,
  isValidJumpHosts,
  isValidPort,
  isValidUser,
  SessionValidationError,
} from "./saved-session-primitives";

export {
  isValidHost,
  isValidJumpHosts,
  isValidPort,
  isValidUser,
  parseSshTarget,
  SessionValidationError,
  type SshTarget,
} from "./saved-session-primitives";

export {
  formatForward,
  parseForwardLine,
  validateForward,
} from "./saved-session-forwards";

// Saved Session definitions: reusable launch descriptions, never running
// processes. Restoring one always starts a new shell or connection.
export const MAX_SAVED_SESSIONS = 1_000;
export const MAX_SESSION_FOLDERS = 200;
export const MAX_SESSION_NAME_LENGTH = 128;
export const MAX_SESSION_TEXT_LENGTH = 4_096;
export const MAX_SESSION_LIST_ITEMS = 32;

export type SessionColor = string;
export const SESSION_COLOR = /^#[0-9a-fA-F]{6}$/u;

export interface SessionFolder {
  readonly id: string;
  readonly name: string;
  readonly parentId?: string;
}

export type PortForwardKind = "local" | "remote" | "dynamic";
export interface PortForward {
  readonly kind: PortForwardKind;
  readonly bindAddress?: string;
  readonly listenPort: number;
  // Absent only for dynamic (SOCKS) forwards.
  readonly host?: string;
  readonly hostPort?: number;
}

export type SshAuthentication = "agent" | "key" | "password";
export type HostKeyPolicy = "ask" | "accept-new" | "yes";

interface SessionCommon {
  readonly id: string;
  readonly name: string;
  readonly folderId?: string;
  readonly color?: SessionColor;
  readonly favorite?: boolean;
  readonly description?: string;
  readonly lastUsedAt?: number;
}

export interface LocalSessionDefinition extends SessionCommon {
  readonly kind: "local";
  readonly workingDirectory?: string;
  // An executable and literal argument vector; absent means the Default Shell.
  readonly program?: string;
  readonly arguments?: readonly string[];
  readonly initialInput?: string;
}

export interface SshSessionDefinition extends SessionCommon {
  readonly kind: "ssh";
  readonly host: string;
  readonly port?: number;
  readonly user?: string;
  readonly authentication: SshAuthentication;
  readonly identityFile?: string;
  readonly proxyJump?: string;
  readonly forwardAgent?: boolean;
  readonly x11?: boolean;
  readonly compression?: boolean;
  readonly multiplex?: boolean;
  readonly hostKeyPolicy?: HostKeyPolicy;
  readonly keepAliveInterval?: number;
  readonly connectTimeout?: number;
  readonly forwards?: readonly PortForward[];
  readonly remoteCommand?: string;
  readonly options?: readonly string[];
}

export type SessionDefinition = LocalSessionDefinition | SshSessionDefinition;

export interface SavedSessionsDocument {
  readonly folders: readonly SessionFolder[];
  readonly sessions: readonly SessionDefinition[];
}

const OPTION_NAME = /^[A-Za-z][A-Za-z0-9]{1,63}$/u;
// Options that make ssh run local programs or bypass host verification. They
// belong in the user's own ~/.ssh/config, which ssh still reads.
export const FORBIDDEN_SSH_OPTIONS: ReadonlySet<string> = new Set([
  "proxycommand",
  "localcommand",
  "permitlocalcommand",
  "knownhostscommand",
  "pkcs11provider",
  "securitykeyprovider",
  "controlpath",
  "include",
  "match",
  "userknownhostsfile",
  "globalknownhostsfile",
  "stricthostkeychecking",
]);

export function validateSessionDocument(value: unknown): SavedSessionsDocument {
  const record = requireRecord(value, "sessions document");
  const folders = requireList(
    record.folders,
    "folders",
    MAX_SESSION_FOLDERS,
  ).map((folder, index) => validateFolder(folder, `folders[${index}]`));
  const folderIds = new Set(folders.map((folder) => folder.id));
  if (folderIds.size !== folders.length)
    throw new SessionValidationError("folders", "contain duplicate ids");
  for (const folder of folders) {
    if (folder.parentId !== undefined && !folderIds.has(folder.parentId))
      throw new SessionValidationError("folders", "reference a missing parent");
  }
  rejectFolderCycles(folders);
  const sessions = requireList(
    record.sessions,
    "sessions",
    MAX_SAVED_SESSIONS,
  ).map((session, index) => validateSession(session, `sessions[${index}]`));
  if (new Set(sessions.map((session) => session.id)).size !== sessions.length)
    throw new SessionValidationError("sessions", "contain duplicate ids");
  for (const session of sessions)
    if (session.folderId !== undefined && !folderIds.has(session.folderId))
      throw new SessionValidationError(
        "sessions",
        "reference a missing folder",
      );
  return { folders, sessions };
}

export function validateFolder(
  value: unknown,
  location = "folder",
): SessionFolder {
  const record = requireRecord(value, location);
  rejectUnknown(record, location, ["id", "name", "parentId"]);
  const id = requireId(record.id, `${location}.id`);
  const name = requireName(record.name, `${location}.name`);
  const parentId =
    record.parentId === undefined
      ? undefined
      : requireId(record.parentId, `${location}.parentId`);
  return { id, name, ...(parentId === undefined ? {} : { parentId }) };
}

const COMMON_KEYS = [
  "id",
  "kind",
  "name",
  "folderId",
  "color",
  "favorite",
  "description",
  "lastUsedAt",
];

export function validateSession(
  value: unknown,
  location = "session",
): SessionDefinition {
  const record = requireRecord(value, location);
  const common = validateCommon(record, location);
  if (record.kind === "local") {
    rejectUnknown(record, location, [
      ...COMMON_KEYS,
      "workingDirectory",
      "program",
      "arguments",
      "initialInput",
    ]);
    return {
      ...common,
      kind: "local",
      ...optionalText(record, location, "workingDirectory", 1024),
      ...optionalText(record, location, "program", 1024),
      ...optionalTextList(record, location, "arguments"),
      ...optionalText(
        record,
        location,
        "initialInput",
        MAX_SESSION_TEXT_LENGTH,
      ),
    };
  }
  if (record.kind === "ssh") return validateSsh(record, location, common);
  throw new SessionValidationError(`${location}.kind`, "must be local or ssh");
}

function validateSsh(
  record: Record<string, unknown>,
  location: string,
  common: SessionCommon,
): SshSessionDefinition {
  rejectUnknown(record, location, [
    ...COMMON_KEYS,
    "host",
    "port",
    "user",
    "authentication",
    "identityFile",
    "proxyJump",
    "forwardAgent",
    "x11",
    "compression",
    "multiplex",
    "hostKeyPolicy",
    "keepAliveInterval",
    "connectTimeout",
    "forwards",
    "remoteCommand",
    "options",
  ]);
  if (!isValidHost(record.host))
    throw new SessionValidationError(`${location}.host`, "must be a host name");
  if (record.port !== undefined && !isValidPort(record.port))
    throw new SessionValidationError(
      `${location}.port`,
      "must be 1 through 65535",
    );
  if (record.user !== undefined && !isValidUser(record.user))
    throw new SessionValidationError(`${location}.user`, "must be a user name");
  if (!["agent", "key", "password"].includes(record.authentication as string))
    throw new SessionValidationError(
      `${location}.authentication`,
      "must be agent, key or password",
    );
  if (record.proxyJump !== undefined && !isValidJumpHosts(record.proxyJump))
    throw new SessionValidationError(
      `${location}.proxyJump`,
      "must list hosts",
    );
  if (
    record.hostKeyPolicy !== undefined &&
    !["ask", "accept-new", "yes"].includes(record.hostKeyPolicy as string)
  )
    throw new SessionValidationError(
      `${location}.hostKeyPolicy`,
      "must be ask, accept-new or yes",
    );
  const forwards =
    record.forwards === undefined
      ? undefined
      : requireList(
          record.forwards,
          `${location}.forwards`,
          MAX_SESSION_LIST_ITEMS,
        ).map((forward, index) =>
          validateForward(forward, `${location}.forwards[${index}]`),
        );
  const options =
    record.options === undefined
      ? undefined
      : requireList(
          record.options,
          `${location}.options`,
          MAX_SESSION_LIST_ITEMS,
        ).map((option, index) =>
          validateSshOption(option, `${location}.options[${index}]`),
        );
  return {
    ...common,
    kind: "ssh",
    host: record.host,
    ...(record.port === undefined ? {} : { port: record.port as number }),
    ...(record.user === undefined ? {} : { user: record.user as string }),
    authentication: record.authentication as SshAuthentication,
    ...optionalText(record, location, "identityFile", 1024),
    ...(record.proxyJump === undefined ? {} : { proxyJump: record.proxyJump }),
    ...optionalFlags(record, location, [
      "forwardAgent",
      "x11",
      "compression",
      "multiplex",
    ]),
    // Sharing is on unless turned off, so an explicit false is kept.
    ...(record.multiplex === false ? { multiplex: false } : {}),
    ...(record.hostKeyPolicy === undefined
      ? {}
      : { hostKeyPolicy: record.hostKeyPolicy as HostKeyPolicy }),
    ...optionalSeconds(record, location, "keepAliveInterval", 0, 3600),
    ...optionalSeconds(record, location, "connectTimeout", 1, 600),
    ...(forwards === undefined ? {} : { forwards }),
    ...optionalText(record, location, "remoteCommand", MAX_SESSION_TEXT_LENGTH),
    ...(options === undefined ? {} : { options }),
  } as SshSessionDefinition;
}

export function validateSshOption(value: unknown, location = "option"): string {
  if (typeof value !== "string" || value.length > 512 || /\p{Cc}/u.test(value))
    throw new SessionValidationError(location, "must be Name=value");
  const separator = value.indexOf("=");
  const name = separator > 0 ? value.slice(0, separator) : "";
  const optionValue = value.slice(separator + 1);
  if (!OPTION_NAME.test(name) || optionValue.length === 0)
    throw new SessionValidationError(location, "must be Name=value");
  if (FORBIDDEN_SSH_OPTIONS.has(name.toLowerCase()))
    throw new SessionValidationError(
      location,
      "is not allowed here; configure it in ~/.ssh/config",
    );
  return value;
}

function validateCommon(
  record: Record<string, unknown>,
  location: string,
): SessionCommon {
  const id = requireId(record.id, `${location}.id`);
  const name = requireName(record.name, `${location}.name`);
  const folderId =
    record.folderId === undefined
      ? undefined
      : requireId(record.folderId, `${location}.folderId`);
  if (
    record.color !== undefined &&
    !(typeof record.color === "string" && SESSION_COLOR.test(record.color))
  )
    throw new SessionValidationError(`${location}.color`, "must be #rrggbb");
  if (record.favorite !== undefined && typeof record.favorite !== "boolean")
    throw new SessionValidationError(
      `${location}.favorite`,
      "must be a boolean",
    );
  if (
    record.lastUsedAt !== undefined &&
    !(
      Number.isSafeInteger(record.lastUsedAt) &&
      (record.lastUsedAt as number) >= 0
    )
  )
    throw new SessionValidationError(
      `${location}.lastUsedAt`,
      "must be a timestamp",
    );
  return {
    id,
    name,
    ...(folderId === undefined ? {} : { folderId }),
    ...(record.color === undefined ? {} : { color: record.color as string }),
    ...(record.favorite === true ? { favorite: true } : {}),
    ...optionalText(record, location, "description", MAX_SESSION_TEXT_LENGTH),
    ...(record.lastUsedAt === undefined
      ? {}
      : { lastUsedAt: record.lastUsedAt as number }),
  };
}

function rejectFolderCycles(folders: readonly SessionFolder[]): void {
  const parents = new Map(
    folders.map((folder) => [folder.id, folder.parentId]),
  );
  for (const folder of folders) {
    const seen = new Set<string>();
    let current: string | undefined = folder.id;
    while (current !== undefined) {
      if (seen.has(current))
        throw new SessionValidationError("folders", "contain a cycle");
      seen.add(current);
      current = parents.get(current);
    }
  }
}

function requireRecord(
  value: unknown,
  location: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new SessionValidationError(location, "must be an object");
  return value as Record<string, unknown>;
}

function requireList(
  value: unknown,
  location: string,
  max: number,
): readonly unknown[] {
  if (!Array.isArray(value) || value.length > max)
    throw new SessionValidationError(
      location,
      `must be a list of at most ${max}`,
    );
  return value;
}

function requireId(value: unknown, location: string): string {
  if (!isSavedSessionId(value))
    throw new SessionValidationError(location, "must be an identifier");
  return value;
}

function requireName(value: unknown, location: string): string {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > MAX_SESSION_NAME_LENGTH ||
    /\p{Cc}/u.test(value)
  )
    throw new SessionValidationError(location, "must be a name");
  return value.trim();
}

function rejectUnknown(
  record: Record<string, unknown>,
  location: string,
  allowed: readonly string[],
): void {
  const unknown = Object.keys(record).find((key) => !allowed.includes(key));
  if (unknown !== undefined)
    throw new SessionValidationError(`${location}.${unknown}`, "is unknown");
}

function optionalText(
  record: Record<string, unknown>,
  location: string,
  key: string,
  max: number,
): Record<string, string> {
  const value = record[key];
  if (value === undefined || value === "") return {};
  if (typeof value !== "string" || value.length > max || value.includes("\0"))
    throw new SessionValidationError(`${location}.${key}`, "must be text");
  return { [key]: value };
}

function optionalTextList(
  record: Record<string, unknown>,
  location: string,
  key: string,
): Record<string, readonly string[]> {
  const value = record[key];
  if (value === undefined) return {};
  const list = requireList(value, `${location}.${key}`, 256);
  if (
    !list.every(
      (item) =>
        typeof item === "string" && item.length <= 4096 && !item.includes("\0"),
    )
  )
    throw new SessionValidationError(`${location}.${key}`, "must be text");
  return list.length === 0 ? {} : { [key]: list as readonly string[] };
}

function optionalFlags(
  record: Record<string, unknown>,
  location: string,
  keys: readonly string[],
): Record<string, boolean> {
  const flags: Record<string, boolean> = {};
  for (const key of keys) {
    const value = record[key];
    if (value === undefined) continue;
    if (typeof value !== "boolean")
      throw new SessionValidationError(
        `${location}.${key}`,
        "must be a boolean",
      );
    if (value) flags[key] = true;
  }
  return flags;
}

function optionalSeconds(
  record: Record<string, unknown>,
  location: string,
  key: string,
  min: number,
  max: number,
): Record<string, number> {
  const value = record[key];
  if (value === undefined) return {};
  if (
    !Number.isInteger(value) ||
    (value as number) < min ||
    (value as number) > max
  )
    throw new SessionValidationError(
      `${location}.${key}`,
      `must be ${min} through ${max}`,
    );
  return { [key]: value as number };
}
