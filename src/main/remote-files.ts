import type { ChildProcess } from "node:child_process";
import { open as openLocal, rm, stat as statLocal } from "node:fs/promises";
import path from "node:path";
import type { Readable, Writable } from "node:stream";
import {
  MAX_DIRECTORY_ENTRIES,
  type DirectoryListing,
  type FileEntry,
} from "../shared/file-browser";
import {
  CHUNK_SIZE,
  createSftpClient,
  isDirectoryMode,
  isRegularMode,
  isSymlinkMode,
  OPEN_FLAGS,
  sftpErrorMessage,
  type SftpAttributes,
  type SftpClient,
} from "./sftp-client";

// One SFTP connection per destination, opened on demand through the user's
// OpenSSH and closed after a quiet period.
export interface RemoteTarget {
  // Identifies equivalent connections (the ssh arguments).
  readonly key: string;
  readonly argv: readonly string[];
}

export interface RemoteFilesOptions {
  readonly spawn: (argv: readonly string[]) => ChildProcess;
  readonly idleMs?: number;
}

export interface TransferProgress {
  (transferred: number, total: number | undefined): void;
}

const IN_FLIGHT = 16;
const MAX_REMOVED_ITEMS = 10_000;
const MAX_STDERR = 4_096;

const posix = path.posix;

function modeString(permissions: number | undefined): string {
  if (permissions === undefined) return "";
  return Array.from({ length: 9 }, (_, index) =>
    permissions & (0o400 >> index) ? "rwx"[index % 3] : "-",
  ).join("");
}

function entryOf(name: string, attributes: SftpAttributes): FileEntry {
  const kind: FileEntry["kind"] = isDirectoryMode(attributes.permissions)
    ? "directory"
    : isSymlinkMode(attributes.permissions)
      ? "symlink"
      : isRegularMode(attributes.permissions) ||
          attributes.permissions === undefined
        ? "file"
        : "other";
  return {
    name,
    kind,
    size: attributes.size ?? 0,
    modified: attributes.modified ?? 0,
    mode: modeString(attributes.permissions),
  };
}

// The last meaningful line ssh printed, for a connection that failed.
function connectionMessage(stderr: string): string {
  const line = stderr
    .split(/\r?\n/u)
    .map((text) => text.trim())
    .filter(Boolean)
    .at(-1);
  if (!line) return "The SFTP connection could not be opened.";
  if (/permission denied/iu.test(line))
    return "The server refused the login. Password sessions can be browsed while their terminal is connected with connection sharing on.";
  if (/host key verification failed/iu.test(line))
    return "The host key is not trusted yet. Connect in a terminal first to verify it.";
  if (/subsystem request failed/iu.test(line))
    return "The server does not offer SFTP.";
  return line.slice(0, 512);
}

export function createRemoteFiles(options: RemoteFilesOptions) {
  const idleMs = options.idleMs ?? 120_000;
  const connections = new Map<
    string,
    {
      readonly ready: Promise<SftpClient>;
      readonly child: ChildProcess;
      timer?: ReturnType<typeof setTimeout>;
    }
  >();

  const drop = (key: string) => {
    const connection = connections.get(key);
    if (!connection) return;
    connections.delete(key);
    clearTimeout(connection.timer);
    connection.child.kill();
  };
  const connect = (target: RemoteTarget): Promise<SftpClient> => {
    const existing = connections.get(target.key);
    if (existing) {
      clearTimeout(existing.timer);
      existing.timer = setTimeout(() => drop(target.key), idleMs);
      return existing.ready;
    }
    const child = options.spawn(target.argv);
    let stderr = "";
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr = `${stderr}${chunk.toString("utf8")}`.slice(-MAX_STDERR);
    });
    const exited = new Promise<never>((_resolve, reject) => {
      child.once("error", () => reject(new Error(connectionMessage(stderr))));
      child.once("exit", () => reject(new Error(connectionMessage(stderr))));
    });
    const ready = Promise.race([
      createSftpClient(child.stdout as Readable, child.stdin as Writable),
      exited,
    ]);
    const connection: {
      ready: Promise<SftpClient>;
      child: ChildProcess;
      timer?: ReturnType<typeof setTimeout>;
    } = { ready, child };
    connection.timer = setTimeout(() => drop(target.key), idleMs);
    connections.set(target.key, connection);
    child.once("exit", () => {
      if (connections.get(target.key) === connection) drop(target.key);
    });
    ready.catch(() => drop(target.key));
    return ready;
  };
  const run = async <T>(
    target: RemoteTarget,
    task: (client: SftpClient) => Promise<T>,
  ): Promise<T> => task(await connect(target));

  const removeTree = async (
    client: SftpClient,
    remotePath: string,
    budget: { left: number },
  ): Promise<void> => {
    budget.left -= 1;
    if (budget.left < 0) throw new Error("Too many items to delete at once.");
    const attributes = await client.lstat(remotePath);
    if (isDirectoryMode(attributes.permissions)) {
      for (const child of await client.list(remotePath))
        await removeTree(
          client,
          posix.join(remotePath, child.filename),
          budget,
        );
      await client.rmdir(remotePath);
    } else await client.remove(remotePath);
  };

  return {
    home: (target: RemoteTarget) =>
      run(target, (client) => client.realpath(".")),

    list: (
      target: RemoteTarget,
      directory: string,
    ): Promise<DirectoryListing> =>
      run(target, async (client) => {
        const resolved = await client.realpath(directory);
        const names = await client.list(resolved);
        const entries = await Promise.all(
          names.slice(0, MAX_DIRECTORY_ENTRIES).map(async (name) => {
            const entry = entryOf(name.filename, name.attributes);
            if (entry.kind !== "symlink") return entry;
            const target = await client
              .stat(posix.join(resolved, name.filename))
              .catch(() => undefined);
            return {
              ...entry,
              targetKind: target
                ? isDirectoryMode(target.permissions)
                  ? ("directory" as const)
                  : ("file" as const)
                : ("missing" as const),
            };
          }),
        );
        const parent = posix.dirname(resolved);
        return {
          path: resolved,
          ...(parent === resolved ? {} : { parent }),
          entries,
          truncated: names.length > MAX_DIRECTORY_ENTRIES,
        };
      }),

    createFolder: (target: RemoteTarget, parent: string, name: string) =>
      run(target, async (client) => {
        const created = posix.join(parent, name);
        await client.mkdir(created);
        return created;
      }),

    createFile: (target: RemoteTarget, parent: string, name: string) =>
      run(target, async (client) => {
        const created = posix.join(parent, name);
        const handle = await client.open(
          created,
          OPEN_FLAGS.write | OPEN_FLAGS.create | OPEN_FLAGS.exclusive,
          0o644,
        );
        await client.close(handle);
        return created;
      }),

    rename: (target: RemoteTarget, remotePath: string, name: string) =>
      run(target, async (client) => {
        const renamed = posix.join(posix.dirname(remotePath), name);
        if (renamed !== remotePath) await client.rename(remotePath, renamed);
        return renamed;
      }),

    move: (
      target: RemoteTarget,
      sources: readonly string[],
      directory: string,
    ) =>
      run(target, async (client) => {
        for (const source of sources) {
          const moved = posix.join(directory, posix.basename(source));
          if (moved !== source) await client.rename(source, moved);
        }
      }),

    // Remote files have no trash: callers confirm a permanent deletion.
    remove: (target: RemoteTarget, paths: readonly string[]) =>
      run(target, async (client) => {
        const budget = { left: MAX_REMOVED_ITEMS };
        for (const remotePath of paths)
          await removeTree(client, remotePath, budget);
      }),

    // Copies a remote file to a new local file; an existing file is never
    // replaced and a failed transfer leaves nothing behind.
    download: (
      target: RemoteTarget,
      remotePath: string,
      localPath: string,
      progress: TransferProgress,
      signal: AbortSignal,
    ) =>
      run(target, async (client) => {
        const total = (await client.stat(remotePath)).size;
        const handle = await client.open(remotePath, OPEN_FLAGS.read);
        const file = await openLocal(localPath, "wx", 0o644);
        let complete = false;
        try {
          await pipelinedRead(
            client,
            handle,
            signal,
            async (data, position) => {
              await file.write(data, 0, data.length, position);
            },
            (transferred) => progress(transferred, total),
          );
          complete = true;
        } finally {
          await file.close();
          await client.close(handle).catch(() => undefined);
          if (!complete) await rm(localPath, { force: true });
        }
      }),

    // Copies a local file to the remote host. exclusive refuses to replace
    // an existing remote file; remote editing saves over its own file.
    upload: (
      target: RemoteTarget,
      localPath: string,
      remotePath: string,
      progress: TransferProgress,
      signal: AbortSignal,
      exclusive = true,
    ) =>
      run(target, async (client) => {
        const total = (await statLocal(localPath)).size;
        const file = await openLocal(localPath, "r");
        const handle = await client.open(
          remotePath,
          OPEN_FLAGS.write |
            OPEN_FLAGS.create |
            (exclusive ? OPEN_FLAGS.exclusive : OPEN_FLAGS.truncate),
          0o644,
        );
        let complete = false;
        try {
          let position = 0;
          let transferred = 0;
          const inFlight = new Set<Promise<void>>();
          for (;;) {
            if (signal.aborted) throw new Error("Cancelled.");
            const buffer = Buffer.alloc(CHUNK_SIZE);
            const { bytesRead } = await file.read(
              buffer,
              0,
              CHUNK_SIZE,
              position,
            );
            if (bytesRead === 0) break;
            const offset = position;
            position += bytesRead;
            const write: Promise<void> = client
              .write(handle, offset, buffer.subarray(0, bytesRead))
              .then(() => {
                transferred += bytesRead;
                progress(transferred, total);
              })
              .finally(() => inFlight.delete(write));
            inFlight.add(write);
            if (inFlight.size >= IN_FLIGHT) await Promise.race(inFlight);
          }
          await Promise.all(inFlight);
          complete = true;
        } finally {
          await file.close();
          await client.close(handle).catch(() => undefined);
          if (!complete && exclusive)
            await client.remove(remotePath).catch(() => undefined);
        }
      }),

    message: sftpErrorMessage,

    dispose() {
      for (const key of [...connections.keys()]) drop(key);
    },
  };
}

export type RemoteFiles = ReturnType<typeof createRemoteFiles>;

// Keeps IN_FLIGHT reads outstanding and writes each chunk at its position.
// A short read (allowed by the protocol) is completed before going on.
async function pipelinedRead(
  client: SftpClient,
  handle: Buffer,
  signal: AbortSignal,
  write: (data: Buffer, position: number) => Promise<void>,
  progress: (transferred: number) => void,
): Promise<void> {
  let next = 0;
  let transferred = 0;
  let ended = false;
  const queue: { position: number; read: Promise<Buffer | undefined> }[] = [];
  const issue = () => {
    queue.push({ position: next, read: client.read(handle, next, CHUNK_SIZE) });
    next += CHUNK_SIZE;
  };
  for (let count = 0; count < IN_FLIGHT; count += 1) issue();
  while (queue.length > 0) {
    if (signal.aborted) {
      await Promise.allSettled(queue.map((item) => item.read));
      throw new Error("Cancelled.");
    }
    const { position, read } = queue.shift()!;
    let data = await read;
    if (data === undefined) {
      ended = true;
      continue;
    }
    let filled = data.length;
    await write(data, position);
    while (filled < CHUNK_SIZE && !ended) {
      data = await client.read(handle, position + filled, CHUNK_SIZE - filled);
      if (data === undefined) {
        ended = true;
        break;
      }
      await write(data, position + filled);
      filled += data.length;
    }
    transferred += filled;
    progress(transferred);
    if (!ended) issue();
  }
}
