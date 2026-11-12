import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

type NativeFiles = {
  moveNoReplace(source: string, destination: string): Promise<void>;
  trash?(target: string): Promise<string>;
};
function supported() {
  const { platform, arch } = process;
  return (
    (platform === "linux" && (arch === "arm64" || arch === "x64")) ||
    (platform === "darwin" && arch === "arm64") ||
    (platform === "win32" && (arch === "arm64" || arch === "x64"))
  );
}

// Reject root, trailing separators and dot/empty components rather than
// converting a final symlink spelling into its referent. Windows takes only
// drive-absolute paths and no alternate data streams.
function trashPath(target: unknown): target is string {
  if (
    typeof target !== "string" ||
    target.length > 4096 ||
    target.includes("\0")
  )
    return false;
  const windows = process.platform === "win32";
  const root = windows ? /^[A-Za-z]:[\\/]/.exec(target)?.[0] : "/";
  if (!root || !target.startsWith(root)) return false;
  const rest = target.slice(root.length);
  if (windows && rest.includes(":")) return false;
  return rest
    .split(windows ? /[\\/]/ : "/")
    .every((part) => part && part !== "." && part !== "..");
}

export function createFilesServices() {
  let native: NativeFiles | undefined;
  function load(): NativeFiles {
    native ??= createRequire(import.meta.url)(
      fileURLToPath(new URL("./files-move.node", import.meta.url)),
    ) as NativeFiles;
    return native;
  }
  return {
    // Omit on Linux: existing archives keep their literal gio implementation.
    ...(process.platform !== "linux" && supported()
      ? {
          async trash(target: string, signal: AbortSignal): Promise<void> {
            if (signal.aborted)
              throw Object.assign(new Error("cancelled"), {
                code: "ECANCELED",
              });
            if (!trashPath(target))
              throw Object.assign(new Error("invalid-path"), {
                code: "EINVAL",
              });
            const operation = load().trash;
            if (!operation)
              throw Object.assign(new Error("unsupported"), {
                code: "ENOTSUP",
              });
            // No early promise settlement on abort: native work cannot be
            // recalled. The runtime owns the deadline and actual child exit.
            // Do not expose the resulting private Trash pathname to the view.
            await operation(target);
          },
        }
      : {}),
    async moveNoReplace(source: string, destination: string): Promise<void> {
      if (!supported())
        throw Object.assign(new Error("unsupported"), { code: "ENOTSUP" });
      await load().moveNoReplace(source, destination);
    },
  };
}
