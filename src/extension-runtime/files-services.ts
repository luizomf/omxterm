import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

type NativeFiles = {
  moveNoReplace(source: string, destination: string): Promise<void>;
  trash?(target: string): Promise<string>;
};
// Reject root, trailing separators and dot/empty components rather than
// converting a final symlink spelling into its referent. Windows takes only
// drive-absolute paths, no alternate data streams, and no part ending in a dot
// or space (Windows would act on the trimmed name instead).
// Trailing dot or space, reserved or control characters, or a device name
// (CON, NUL, COM1, LPT1... with or without an extension, any case).
const windowsSpecial =
  /[. ]$|[<>"|?*\x00-\x1f]|^(?:con|prn|aux|nul|com[1-9]|lpt[1-9]) *(?:\.|$)/i;

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
    .every(
      (part) =>
        part &&
        part !== "." &&
        part !== ".." &&
        !(windows && windowsSpecial.test(part)),
    );
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
    // Every packaged target ships the addon. Linux omits trash: existing
    // archives keep their literal gio implementation.
    ...(process.platform !== "linux"
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
      await load().moveNoReplace(source, destination);
    },
  };
}
