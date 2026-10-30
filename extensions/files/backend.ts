import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { lstat, mkdir, open, opendir, realpath, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { Value } from "../../src/extension-runtime/protocol.js";

export type FilesServices = {
  moveNoReplace(source: string, destination: string): Promise<void>;
  trash?(target: string, signal: AbortSignal): Promise<void>;
};
type Row = { name: string; kind: string; size: number; modified: number };
const limit = 5_000;
const batch = 100;
function record(value: Value): Record<string, Value> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("invalid-request");
  return value;
}
function pathname(value: Value | undefined): string {
  if (
    typeof value !== "string" ||
    value.length > 4096 ||
    value.includes("\0") ||
    !path.isAbsolute(value)
  )
    throw new Error("invalid-path");
  return path.normalize(value);
}
function failure(error: unknown): string {
  const code =
    error && typeof error === "object" && "code" in error
      ? error.code
      : undefined;
  switch (code) {
    case "EEXIST":
    case "ENOTEMPTY":
      return "conflict";
    case "EXDEV":
      return "cross-device";
    case "ENOSYS":
    case "ENOTSUP":
      return "unsupported";
    case "EACCES":
    case "EPERM":
      return "permission";
    case "ENOENT":
      return "not-found";
    default:
      return "failed";
  }
}
async function systemTrash(target: string, signal: AbortSignal): Promise<void> {
  if (process.platform !== "linux")
    throw Object.assign(new Error("unsupported"), { code: "ENOTSUP" });
  await new Promise<void>((resolve, reject) => {
    // Literal arguments; never shell commands. Failure never falls back to rm.
    execFile(
      "/usr/bin/gio",
      ["trash", "--", target],
      { signal, timeout: 8_000, maxBuffer: 16 * 1024, windowsHide: true },
      (error) => (error ? reject(error) : resolve()),
    );
  });
}

/** Separately built extension backend, not imported by application main. */
export function activate(context: {
  signal: AbortSignal;
  files: FilesServices;
}) {
  const listings = new Map<
    string,
    { rows: Row[]; offset: number; directory: string; truncated: boolean }
  >();
  const deletions = new Map<
    string,
    { target: string; device: number; inode: number }
  >();
  let active = 0;
  let pendingListings = 0;
  const check = (signal: AbortSignal) => {
    if (signal.aborted || context.signal.aborted) throw new Error("cancelled");
  };
  const page = (token: string) => {
    const listing = listings.get(token);
    if (!listing) throw new Error("expired-listing");
    const rows = listing.rows.slice(listing.offset, listing.offset + batch);
    listing.offset += rows.length;
    const done = listing.offset >= listing.rows.length;
    if (done) listings.delete(token);
    return {
      directory: listing.directory,
      rows,
      truncated: listing.truncated,
      total: listing.rows.length,
      cursor: done ? null : token,
    };
  };
  async function list(directory: string, signal: AbortSignal) {
    if (listings.size + pendingListings >= 8) {
      // Completed snapshots are revocable, not permanent reservations held by
      // disappeared views. Never evict an in-flight read or rebind an old token.
      const oldest = listings.keys().next().value;
      if (!oldest) throw new Error("busy");
      listings.delete(oldest);
    }
    pendingListings++;
    try {
      return await readListing(directory, signal);
    } finally {
      pendingListings--;
    }
  }
  async function readListing(directory: string, signal: AbortSignal) {
    const canonical = await realpath(directory);
    const rows: Row[] = [];
    let truncated = false;
    let visited = 0;
    const entries = await opendir(canonical);
    for await (const entry of entries) {
      check(signal);
      if (visited++ === limit) {
        truncated = true;
        break;
      }
      try {
        // Sequential lstat intentionally bounds metadata concurrency to one.
        const stat = await lstat(path.join(canonical, entry.name));
        rows.push({
          name: entry.name,
          kind: stat.isSymbolicLink()
            ? "link"
            : stat.isDirectory()
              ? "directory"
              : stat.isFile()
                ? "file"
                : "other",
          size: stat.size,
          modified: stat.mtimeMs,
        });
      } catch (error) {
        if (
          error &&
          typeof error === "object" &&
          "code" in error &&
          error.code === "ENOENT"
        )
          continue;
        throw error;
      }
    }
    check(signal);
    // A snapshot, not a watcher. Explicit refresh creates a new snapshot.
    rows.sort((a, b) => a.name.localeCompare(b.name));
    const token = randomUUID();
    listings.set(token, { rows, offset: 0, directory: canonical, truncated });
    return page(token);
  }
  async function invoke(value: Value, signal: AbortSignal): Promise<Value> {
    if (active >= 8) return { ok: false, error: "busy" };
    active++;
    let mutation = false;
    let uncertain = false;
    try {
      check(signal);
      const request = record(value);
      if (request.operation === "home")
        return { ok: true, directory: os.homedir() };
      if (request.operation === "list")
        return { ok: true, ...(await list(pathname(request.path), signal)) };
      if (request.operation === "list-next") {
        if (typeof request.cursor !== "string")
          throw new Error("invalid-request");
        return { ok: true, ...page(request.cursor) };
      }
      if (request.operation === "list-close") {
        if (typeof request.cursor === "string") listings.delete(request.cursor);
        return { ok: true };
      }
      if (request.operation === "cancel-delete") {
        if (typeof request.token === "string") deletions.delete(request.token);
        return { ok: true };
      }
      if (request.operation === "delete") {
        if (typeof request.token !== "string")
          throw new Error("invalid-request");
        const captured = deletions.get(request.token);
        deletions.delete(request.token);
        if (!captured) throw new Error("expired-confirmation");
        const stat = await lstat(captured.target);
        if (stat.dev !== captured.device || stat.ino !== captured.inode)
          throw new Error("changed-entry");
        check(signal);
        mutation = true;
        uncertain = true; // Recursive deletion may fail after partial effects.
        await rm(captured.target, { recursive: true, force: false });
      } else {
        const target = pathname(request.path);
        // Root is never an entry eligible for a destructive operation.
        if (target === path.parse(target).root) throw new Error("invalid-path");
        check(signal);
        switch (request.operation) {
          case "prepare-delete": {
            // A crashed view cannot cancel its token. Capacity expires the oldest
            // confirmation; using it later fails closed and requires fresh consent.
            if (deletions.size >= 8)
              deletions.delete(deletions.keys().next().value!);
            const stat = await lstat(target);
            const token = randomUUID();
            deletions.set(token, { target, device: stat.dev, inode: stat.ino });
            return { ok: true, token, path: target };
          }
          case "create-file": {
            mutation = true;
            const file = await open(target, "wx", 0o600);
            uncertain = true; // Creation happened even if closing later fails.
            await file.close();
            break;
          }
          case "create-directory":
            mutation = true;
            await mkdir(target);
            break;
          case "move": {
            const destination = pathname(request.destination);
            mutation = true;
            await context.files.moveNoReplace(target, destination);
            break;
          }
          case "trash":
            mutation = true;
            uncertain = true; // A dispatched OS trash failure is not rollback.
            // pathname already validated the string. Preserve its original
            // spelling for the host hook's destructive-path checks; normalizing
            // first would erase dot/empty components around final symlinks.
            await (context.files.trash ?? systemTrash)(
              context.files.trash ? (request.path as string) : target,
              signal,
            );
            break;
          default:
            throw new Error("invalid-request");
        }
      }
      return { ok: true };
    } catch (error) {
      // A cancelled dispatched mutation may already have changed the filesystem.
      if (
        mutation &&
        (uncertain ||
          signal.aborted ||
          context.signal.aborted ||
          failure(error) === "failed")
      )
        return { ok: false, error: "outcome-unknown" };
      return { ok: false, error: failure(error) };
    } finally {
      active--;
    }
  }
  return {
    invoke,
    deactivate() {
      listings.clear();
      deletions.clear();
    },
  };
}
