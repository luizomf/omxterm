import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

export function createFilesServices() {
  let native:
    | { moveNoReplace(source: string, destination: string): Promise<void> }
    | undefined;
  return {
    async moveNoReplace(source: string, destination: string): Promise<void> {
      if (
        (process.platform !== "linux" && process.platform !== "darwin") ||
        process.arch !== "arm64"
      )
        throw Object.assign(new Error("unsupported"), { code: "ENOTSUP" });
      native ??= createRequire(import.meta.url)(
        fileURLToPath(new URL("./files-move.node", import.meta.url)),
      );
      await native!.moveNoReplace(source, destination);
    },
  };
}
