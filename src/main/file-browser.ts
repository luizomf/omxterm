import { constants, type Stats } from "node:fs";
import {
  cp,
  lstat,
  mkdir,
  open,
  opendir,
  rename,
  rm,
  stat,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  MAX_DIRECTORY_ENTRIES,
  type DirectoryListing,
  type FileEntry,
  type FileOperationResult,
  type FileTransfer,
} from "../shared/file-browser";

// Local file operations for the Files panel. Every path arrives as a literal
// argument to a Node API; nothing goes through a shell. Deletion moves items
// to the system trash so it can be undone.
export interface FileBrowserOptions {
  readonly platform: string;
  readonly hostname: string;
  readonly trash: (filePath: string) => Promise<void>;
}

function modeString(stats: Stats, platform: string): string {
  if (platform === "win32") return "";
  const bits = stats.mode;
  return [
    constants.S_IRUSR,
    constants.S_IWUSR,
    constants.S_IXUSR,
    constants.S_IRGRP,
    constants.S_IWGRP,
    constants.S_IXGRP,
    constants.S_IROTH,
    constants.S_IWOTH,
    constants.S_IXOTH,
  ]
    .map((bit, index) => (bits & bit ? "rwx"[index % 3] : "-"))
    .join("");
}

function kindOf(stats: Stats): FileEntry["kind"] {
  if (stats.isSymbolicLink()) return "symlink";
  if (stats.isDirectory()) return "directory";
  if (stats.isFile()) return "file";
  return "other";
}

async function entry(
  directory: string,
  name: string,
  platform: string,
): Promise<FileEntry | undefined> {
  const fullPath = path.join(directory, name);
  let stats: Stats;
  try {
    stats = await lstat(fullPath);
  } catch {
    return undefined;
  }
  const kind = kindOf(stats);
  let targetKind: FileEntry["targetKind"];
  if (kind === "symlink") {
    try {
      const target = await stat(fullPath);
      targetKind = target.isDirectory()
        ? "directory"
        : target.isFile()
          ? "file"
          : "other";
    } catch {
      targetKind = "missing";
    }
  }
  return {
    name,
    kind,
    ...(targetKind ? { targetKind } : {}),
    size: stats.size,
    modified: stats.mtimeMs,
    mode: modeString(stats, platform),
  };
}

const message = (cause: unknown) => {
  const code =
    typeof cause === "object" && cause !== null && "code" in cause
      ? String(cause.code)
      : "";
  switch (code) {
    case "EACCES":
    case "EPERM":
      return "Permission denied.";
    case "EEXIST":
    case "ERR_FS_CP_EEXIST":
      return "An item with that name already exists.";
    case "ENOENT":
      return "The item no longer exists.";
    case "ENOTEMPTY":
      return "The folder is not empty.";
    case "EXDEV":
      return "The item cannot be moved across devices.";
    case "ERR_FS_CP_EINVAL":
      return "A folder cannot be copied into itself.";
    default:
      return cause instanceof Error ? cause.message.slice(0, 512) : "Failed.";
  }
};

async function attempt(
  task: () => Promise<string | undefined>,
): Promise<FileOperationResult> {
  try {
    const result = await task();
    return result === undefined ? { ok: true } : { ok: true, path: result };
  } catch (cause) {
    return { ok: false, error: message(cause) };
  }
}

export function createFileBrowser(options: FileBrowserOptions) {
  const absolute = (filePath: string) => {
    if (!path.isAbsolute(filePath))
      throw new TypeError("File paths must be absolute");
    return path.resolve(filePath);
  };

  return {
    async list(directory: string): Promise<DirectoryListing> {
      const resolved = absolute(directory);
      const names: string[] = [];
      let truncated = false;
      const handle = await opendir(resolved);
      for await (const item of handle) {
        if (names.length >= MAX_DIRECTORY_ENTRIES) {
          truncated = true;
          break;
        }
        names.push(item.name);
      }
      if (truncated) await handle.close().catch(() => undefined);
      const entries = (
        await Promise.all(
          names.map((name) => entry(resolved, name, options.platform)),
        )
      ).filter((item): item is FileEntry => item !== undefined);
      const parent = path.dirname(resolved);
      return {
        path: resolved,
        ...(parent === resolved ? {} : { parent }),
        entries,
        truncated,
      };
    },

    // A local directory from an OSC 7 file:// URI, or undefined for another
    // host or a path that is not a directory.
    async resolve(uri: string): Promise<string | undefined> {
      let url: URL;
      try {
        url = new URL(uri);
      } catch {
        return undefined;
      }
      if (url.protocol !== "file:") return undefined;
      const host = url.hostname.toLowerCase();
      if (
        host !== "" &&
        host !== "localhost" &&
        host !== options.hostname.toLowerCase()
      )
        return undefined;
      let filePath: string;
      try {
        filePath = fileURLToPath(new URL(`file://${url.pathname}`), {
          windows: options.platform === "win32",
        });
      } catch {
        return undefined;
      }
      try {
        return (await stat(filePath)).isDirectory() ? filePath : undefined;
      } catch {
        return undefined;
      }
    },

    createFolder: (parent: string, name: string) =>
      attempt(async () => {
        const target = path.join(absolute(parent), name);
        await mkdir(target);
        return target;
      }),

    createFile: (parent: string, name: string) =>
      attempt(async () => {
        const target = path.join(absolute(parent), name);
        // "wx" refuses to replace an existing item.
        await (await open(target, "wx", 0o644)).close();
        return target;
      }),

    rename: (filePath: string, name: string) =>
      attempt(async () => {
        const source = absolute(filePath);
        const target = path.join(path.dirname(source), name);
        if (target === source) return target;
        // rename() would silently replace an existing target.
        const exists = await lstat(target).then(
          () => true,
          () => false,
        );
        if (exists)
          throw Object.assign(new Error("exists"), { code: "EEXIST" });
        await rename(source, target);
        return target;
      }),

    trash: (paths: readonly string[]) =>
      attempt(async () => {
        for (const filePath of paths) await options.trash(absolute(filePath));
        return undefined;
      }),

    // Copies or moves items into a directory without replacing anything.
    transfer: (
      mode: FileTransfer,
      sources: readonly string[],
      destination: string,
    ) =>
      attempt(async () => {
        const directory = absolute(destination);
        for (const source of sources.map(absolute)) {
          const target = path.join(directory, path.basename(source));
          if (target === source) continue;
          if (mode === "move") {
            const exists = await lstat(target).then(
              () => true,
              () => false,
            );
            if (exists)
              throw Object.assign(new Error("exists"), { code: "EEXIST" });
            try {
              await rename(source, target);
              continue;
            } catch (cause) {
              if (
                typeof cause !== "object" ||
                cause === null ||
                !("code" in cause) ||
                cause.code !== "EXDEV"
              )
                throw cause;
            }
          }
          await cp(source, target, {
            recursive: true,
            errorOnExist: true,
            force: false,
            preserveTimestamps: true,
            verbatimSymlinks: true,
          });
          if (mode === "move") await rm(source, { recursive: true });
        }
        return undefined;
      }),
  };
}

export type FileBrowser = ReturnType<typeof createFileBrowser>;
