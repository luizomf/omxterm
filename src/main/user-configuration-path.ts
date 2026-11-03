import { lstat, stat } from "node:fs/promises";
import path from "node:path";

export function resolveUserConfigurationPath(
  environment: Readonly<Record<string, string | undefined>>,
  homeDirectory: string,
): string {
  const root =
    environment.XDG_CONFIG_HOME || path.join(homeDirectory, ".config");
  return path.join(root, "omxterm", "config.json");
}

// Distinguish a genuinely absent file from a dangling linked ancestor.
export async function isUserConfigurationPathAbsent(
  configurationPath: string,
): Promise<boolean> {
  const file = path.resolve(configurationPath);
  let current = file;
  for (;;) {
    let entry;
    try {
      entry = await lstat(current);
    } catch (cause) {
      if (
        typeof cause !== "object" ||
        cause === null ||
        !("code" in cause) ||
        cause.code !== "ENOENT"
      )
        return false;
      const parent = path.dirname(current);
      if (parent === current) return false;
      current = parent;
      continue;
    }
    if (current === file) return false;
    // A missing child of a valid directory link is ordinary absence; a broken
    // ancestor or link to a non-directory is a read failure, not defaults.
    if (entry.isSymbolicLink()) {
      try {
        return (await stat(current)).isDirectory();
      } catch {
        return false;
      }
    }
    return entry.isDirectory();
  }
}
