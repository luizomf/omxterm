import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

type NativeFiles = {
  moveNoReplace(source: string, destination: string): Promise<void>;
  trash?(target: string): Promise<string>;
};
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
    ...(process.platform === "darwin" && process.arch === "arm64"
      ? {
          async trash(target: string, signal: AbortSignal): Promise<void> {
            if (signal.aborted)
              throw Object.assign(new Error("cancelled"), {
                code: "ECANCELED",
              });
            // Reject root, trailing separators and dot/empty components rather
            // than converting a final symlink spelling into its referent.
            if (
              typeof target !== "string" ||
              target.length > 4096 ||
              !target.startsWith("/") ||
              target.includes("\0") ||
              target
                .slice(1)
                .split("/")
                .some((part) => !part || part === "." || part === "..")
            )
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
      if (
        (process.platform !== "linux" && process.platform !== "darwin") ||
        process.arch !== "arm64"
      )
        throw Object.assign(new Error("unsupported"), { code: "ENOTSUP" });
      await load().moveNoReplace(source, destination);
    },
  };
}
