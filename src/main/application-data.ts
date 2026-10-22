import { randomBytes } from "node:crypto";
import {
  mkdir,
  open,
  readFile,
  rename,
  rm,
  type FileHandle,
} from "node:fs/promises";
import {
  closeSync,
  fsyncSync,
  mkdirSync,
  openSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";

// Application Data is state that OMXTerm itself owns and writes (saved
// sessions, custom commands, highlight rules, workspace layout). It lives next
// to, but never inside, the user-authored config.json (ADR 0034).
export const MAX_APPLICATION_DATA_BYTES = 4 * 1024 * 1024;

export function resolveApplicationDataDirectory(
  environment: Readonly<Record<string, string | undefined>>,
  homeDirectory: string,
): string {
  const root =
    environment.XDG_CONFIG_HOME || path.join(homeDirectory, ".config");
  return path.join(root, "omxterm");
}

export class ApplicationDataError extends Error {
  readonly reason: "unreadable" | "too-large" | "invalid" | "newer-version";

  constructor(reason: ApplicationDataError["reason"], message: string) {
    super(message);
    this.name = "ApplicationDataError";
    this.reason = reason;
  }
}

export interface ApplicationDocumentSchema<T> {
  readonly fileName: string;
  readonly version: number;
  readonly empty: () => T;
  // Upgrades an older document to the current version, or returns undefined
  // when the version is unknown. Migrations never touch the source file until
  // the next explicit save writes the upgraded shape.
  readonly migrate?: (document: unknown, version: number) => unknown;
  readonly validate: (document: unknown) => T;
}

export interface ApplicationDocumentLoad<T> {
  readonly value: T;
  readonly recovered?: {
    readonly reason: ApplicationDataError["reason"];
    readonly quarantinedAs?: string;
  };
}

export interface ApplicationDocumentStore<T> {
  readonly path: string;
  load(): Promise<ApplicationDocumentLoad<T>>;
  save(value: T): Promise<void>;
  // For the last write while the application exits, when no promise can be
  // awaited: the same validation and atomic replace, synchronously.
  saveSync(value: T): void;
  // Reads a document in this store's file format, such as one from a
  // backup, without touching the stored file. Throws ApplicationDataError.
  decode(bytes: Uint8Array): T;
}

export interface ApplicationDocumentStoreOptions {
  readonly directory: string;
  readonly fileSystem?: Partial<ApplicationDataFileSystem>;
}

export interface ApplicationDataFileSystem {
  readonly readFile: typeof readFile;
  readonly open: typeof open;
  readonly rename: typeof rename;
  readonly rm: typeof rm;
  readonly mkdir: typeof mkdir;
}

export function createApplicationDocumentStore<T>(
  schema: ApplicationDocumentSchema<T>,
  options: ApplicationDocumentStoreOptions,
): ApplicationDocumentStore<T> {
  const fs: ApplicationDataFileSystem = {
    readFile,
    open,
    rename,
    rm,
    mkdir,
    ...options.fileSystem,
  };
  const documentPath = path.join(options.directory, schema.fileName);
  // Saves are serialized so a slower earlier write can never replace a later one.
  let queue: Promise<void> = Promise.resolve();

  const quarantine = async (): Promise<string | undefined> => {
    const target = `${documentPath}.corrupt-${Date.now()}`;
    try {
      await fs.rename(documentPath, target);
      return target;
    } catch {
      return undefined;
    }
  };

  return {
    path: documentPath,
    async load() {
      let bytes: Uint8Array;
      try {
        bytes = await fs.readFile(documentPath);
      } catch (cause) {
        if (isNotFound(cause)) return { value: schema.empty() };
        return { value: schema.empty(), recovered: { reason: "unreadable" } };
      }
      try {
        return { value: decodeDocument(bytes, schema) };
      } catch (cause) {
        if (!(cause instanceof ApplicationDataError)) throw cause;
        // A newer file is never quarantined: a downgrade must not destroy it.
        if (cause.reason === "newer-version")
          return { value: schema.empty(), recovered: { reason: cause.reason } };
        const quarantinedAs = await quarantine();
        return {
          value: schema.empty(),
          recovered: {
            reason: cause.reason,
            ...(quarantinedAs ? { quarantinedAs } : {}),
          },
        };
      }
    },
    decode: (bytes) => decodeDocument(bytes, schema),
    save(value: T) {
      // Validation throws synchronously; only an oversized document rejects.
      const text = encodeDocument(value, schema);
      if (Buffer.byteLength(text, "utf8") > MAX_APPLICATION_DATA_BYTES)
        return Promise.reject(tooLarge());
      const write = queue.then(() => writeAtomically(fs, documentPath, text));
      queue = write.catch(() => undefined);
      return write;
    },
    saveSync(value: T) {
      const text = encodeDocument(value, schema);
      if (Buffer.byteLength(text, "utf8") > MAX_APPLICATION_DATA_BYTES)
        throw tooLarge();
      mkdirSync(path.dirname(documentPath), { recursive: true, mode: 0o700 });
      const temporary = `${documentPath}.${randomBytes(6).toString("hex")}.tmp`;
      try {
        const descriptor = openSync(temporary, "wx", 0o600);
        try {
          writeFileSync(descriptor, text, "utf8");
          fsyncSync(descriptor);
        } finally {
          closeSync(descriptor);
        }
        renameSync(temporary, documentPath);
      } catch (cause) {
        rmSync(temporary, { force: true });
        throw cause;
      }
    },
  };
}

function encodeDocument<T>(
  value: T,
  schema: ApplicationDocumentSchema<T>,
): string {
  const validated = schema.validate(
    JSON.parse(JSON.stringify(value)) as unknown,
  );
  const text = `${JSON.stringify(
    { version: schema.version, data: validated },
    null,
    2,
  )}\n`;
  return text;
}

const tooLarge = () =>
  new ApplicationDataError("too-large", "Application data is too large");

function decodeDocument<T>(
  bytes: Uint8Array,
  schema: ApplicationDocumentSchema<T>,
): T {
  if (bytes.byteLength > MAX_APPLICATION_DATA_BYTES)
    throw new ApplicationDataError(
      "too-large",
      "Application data is too large",
    );
  let document: unknown;
  try {
    document = JSON.parse(
      new TextDecoder("utf-8", { fatal: true }).decode(bytes),
    ) as unknown;
  } catch {
    throw new ApplicationDataError("invalid", "Application data is not JSON");
  }
  if (
    typeof document !== "object" ||
    document === null ||
    Array.isArray(document)
  )
    throw new ApplicationDataError("invalid", "Application data is malformed");
  const { version, data } = document as Record<string, unknown>;
  if (!Number.isSafeInteger(version) || (version as number) < 1)
    throw new ApplicationDataError(
      "invalid",
      "Application data has no version",
    );
  if ((version as number) > schema.version)
    throw new ApplicationDataError(
      "newer-version",
      "Application data was written by a newer OMXTerm",
    );
  let current = data;
  if ((version as number) < schema.version) {
    current = schema.migrate?.(data, version as number);
    if (current === undefined)
      throw new ApplicationDataError("invalid", "Application data is outdated");
  }
  try {
    return schema.validate(current);
  } catch (cause) {
    throw new ApplicationDataError(
      "invalid",
      cause instanceof Error ? cause.message : "Application data is invalid",
    );
  }
}

// Write to a private sibling, flush it, then rename over the target so a crash
// leaves either the old or the new document, never a truncated one.
export async function writeAtomically(
  fs: Pick<ApplicationDataFileSystem, "mkdir" | "open" | "rename" | "rm">,
  documentPath: string,
  text: string,
): Promise<void> {
  await fs.mkdir(path.dirname(documentPath), { recursive: true, mode: 0o700 });
  const temporary = `${documentPath}.${randomBytes(6).toString("hex")}.tmp`;
  let handle: FileHandle | undefined;
  try {
    handle = await fs.open(temporary, "wx", 0o600);
    await handle.writeFile(text, "utf8");
    await handle.sync();
    await handle.close();
    handle = undefined;
    await fs.rename(temporary, documentPath);
  } catch (cause) {
    await handle?.close().catch(() => undefined);
    await fs.rm(temporary, { force: true }).catch(() => undefined);
    throw cause;
  }
}

function isNotFound(cause: unknown): boolean {
  return (
    typeof cause === "object" &&
    cause !== null &&
    "code" in cause &&
    cause.code === "ENOENT"
  );
}

// Shared validation helpers for Application Data schemas.
export function requireRecord(
  value: unknown,
  location: string,
): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new TypeError(`${location} must be an object`);
  return value as Record<string, unknown>;
}

export function requireString(
  value: unknown,
  location: string,
  maxLength: number,
  { allowEmpty = false }: { readonly allowEmpty?: boolean } = {},
): string {
  if (
    typeof value !== "string" ||
    (!allowEmpty && value.length === 0) ||
    value.length > maxLength ||
    value.includes("\0")
  )
    throw new TypeError(
      `${location} must be a string of at most ${maxLength} characters`,
    );
  return value;
}

export function optionalString(
  value: unknown,
  location: string,
  maxLength: number,
): string | undefined {
  return value === undefined
    ? undefined
    : requireString(value, location, maxLength, { allowEmpty: true });
}

export function optionalBoolean(
  value: unknown,
  location: string,
  fallback: boolean,
): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== "boolean")
    throw new TypeError(`${location} must be a boolean`);
  return value;
}

export function requireArray(
  value: unknown,
  location: string,
  maxLength: number,
): readonly unknown[] {
  if (!Array.isArray(value) || value.length > maxLength)
    throw new TypeError(`${location} must be a list of at most ${maxLength}`);
  return value;
}
