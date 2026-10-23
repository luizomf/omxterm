import { accessSync, constants, statSync } from "node:fs";
import path from "node:path";

// Resolve a program name the way a shell would, without running a shell:
// absolute paths are checked directly, bare names are searched on PATH (with
// PATHEXT on Windows). Used to explain missing tools before launching them.
export function findExecutable(
  name: string,
  environment: Readonly<Record<string, string | undefined>>,
  platform: string,
): string | undefined {
  const pathApi = platform === "win32" ? path.win32 : path.posix;
  const extensions =
    platform === "win32"
      ? (environment.PATHEXT ?? ".COM;.EXE;.BAT;.CMD")
          .split(";")
          .filter((extension) => extension.length > 0)
      : [""];
  const candidates = (base: string) =>
    platform === "win32" && pathApi.extname(base) === ""
      ? extensions.map((extension) => `${base}${extension.toLowerCase()}`)
      : [base];
  if (pathApi.isAbsolute(name))
    return candidates(name).find((candidate) =>
      isExecutable(candidate, platform),
    );
  if (name.includes("/") || name.includes("\\")) return undefined;
  const searchPath =
    environment.PATH ?? environment.Path ?? environment.path ?? "";
  for (const directory of searchPath.split(platform === "win32" ? ";" : ":")) {
    if (directory.length === 0) continue;
    for (const candidate of candidates(pathApi.join(directory, name)))
      if (isExecutable(candidate, platform)) return candidate;
  }
  return undefined;
}

function isExecutable(candidate: string, platform: string): boolean {
  try {
    if (!statSync(candidate).isFile()) return false;
    if (platform !== "win32") accessSync(candidate, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}
