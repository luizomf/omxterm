import { createHash, randomBytes } from "node:crypto";
import { constants, type Stats } from "node:fs";
import {
  mkdir,
  lstat,
  open,
  realpath,
  rename,
  rm,
  type FileHandle,
} from "node:fs/promises";
import path from "node:path";

// Guarded persistence extracted from Settings, adapted from ruscher/omxterm
// PR #622 at b3c3a4ad6c1f2224bded65873ba0b09a07ec5d38 (MIT).
export interface SettingsFile {
  readonly target: string;
  readonly bytes: Uint8Array | null;
  readonly mode?: number;
}

export interface SettingsFiles {
  read(filePath: string): Promise<SettingsFile>;
  // False means a concurrent edit or retargeting was detected.
  replace(
    filePath: string,
    text: string,
    expected: SettingsFile,
  ): Promise<boolean>;
}

export class SettingsFileError extends Error {
  constructor(
    readonly kind: "symlink" | "target" | "conflict" | "cleanup" | "size",
  ) {
    super(kind);
  }
}

export function revisionOf(file: SettingsFile): string {
  const hash = createHash("sha256").update(file.target).update("\0");
  if (file.bytes === null) hash.update("0");
  else hash.update("1").update(file.bytes);
  return hash.digest("hex");
}

export function isNotFound(cause: unknown): boolean {
  return (
    typeof cause === "object" &&
    cause !== null &&
    (cause as NodeJS.ErrnoException).code === "ENOENT"
  );
}

// Resolve intentional links, including linked parents. Never heal a broken link.
export async function settingsTarget(filePath: string): Promise<string> {
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

export function sameTemporary(
  entry: Stats,
  original: Stats | undefined,
): boolean {
  return (
    original !== undefined &&
    entry.isFile() &&
    entry.dev === original.dev &&
    entry.ino === original.ino
  );
}

export async function removeSettingsTemporary(
  temporary: string,
  identity: Stats | undefined,
): Promise<void> {
  try {
    if (!sameTemporary(await lstat(temporary), identity))
      throw new SettingsFileError("cleanup");
    await rm(temporary);
  } catch (cause) {
    if (!isNotFound(cause)) throw new SettingsFileError("cleanup");
  }
}

async function readBounded(
  handle: FileHandle,
  status: Stats,
  maxBytes: number,
): Promise<Uint8Array> {
  if (status.size > maxBytes) throw new SettingsFileError("size");
  const buffer = Buffer.allocUnsafe(maxBytes + 1);
  let length = 0;
  while (length < buffer.length) {
    const read = await handle.read(
      buffer,
      length,
      buffer.length - length,
      null,
    );
    if (read.bytesRead === 0) break;
    length += read.bytesRead;
  }
  if (length > maxBytes) throw new SettingsFileError("size");
  const after = await handle.stat();
  if (
    status.size !== after.size ||
    status.mtimeMs !== after.mtimeMs ||
    status.ctimeMs !== after.ctimeMs
  )
    throw new SettingsFileError("conflict");
  return buffer.subarray(0, length);
}

// Configuration retains its existing unbounded reader; theme callers select a
// byte cap which also applies to every comparison during guarded replacement.
export function createNodeSettingsFiles(maxBytes?: number): SettingsFiles {
  const files: SettingsFiles = {
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
        if (maxBytes !== undefined && entry.size > maxBytes)
          throw new SettingsFileError("size");
        const handle = await open(
          target,
          constants.O_RDONLY |
            constants.O_NONBLOCK |
            (constants.O_NOFOLLOW ?? 0),
        );
        try {
          const status = await handle.stat();
          if (!status.isFile()) throw new SettingsFileError("target");
          if (
            maxBytes !== undefined &&
            (status.dev !== entry.dev || status.ino !== entry.ino)
          )
            throw new SettingsFileError("conflict");
          mode = status.mode & 0o777;
          bytes =
            maxBytes === undefined
              ? await handle.readFile()
              : await readBounded(handle, status, maxBytes);
        } finally {
          await handle.close();
        }
      }
      if ((await settingsTarget(filePath)) !== target)
        throw new SettingsFileError("conflict");
      return { target, bytes, ...(mode === undefined ? {} : { mode }) };
    },
    async replace(filePath, text, expected) {
      if (!sameSettingsFile(await files.read(filePath), expected)) return false;
      await mkdir(path.dirname(expected.target), { recursive: true });
      const temporary = path.join(
        path.dirname(expected.target),
        `.omxterm-settings-${randomBytes(6).toString("hex")}.tmp`,
      );
      let created = false;
      let replaced = false;
      let identity: Stats | undefined;
      try {
        const handle = await open(temporary, "wx", 0o600);
        created = true;
        try {
          identity = await handle.stat();
          await handle.writeFile(text, "utf8");
          if (!sameSettingsFile(await files.read(filePath), expected))
            return false;
          // Only the owned handle may change permissions.
          if (expected.mode !== undefined) await handle.chmod(expected.mode);
        } finally {
          await handle.close();
        }
        if (!sameSettingsFile(await files.read(filePath), expected))
          return false;
        if (!sameTemporary(await lstat(temporary), identity))
          throw new SettingsFileError("conflict");
        // Guarded replacement is not cross-process CAS: paths can still change
        // between their last checks and rename. Inode/ACL preservation is not promised.
        await rename(temporary, expected.target);
        replaced = true;
        return true;
      } finally {
        if (created && !replaced)
          await removeSettingsTemporary(temporary, identity);
      }
    },
  };
  return files;
}

export const nodeSettingsFiles = createNodeSettingsFiles();
