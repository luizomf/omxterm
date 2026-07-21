import { chmod as chmodFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultHelperPath = path.resolve(
  import.meta.dirname,
  "../node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper",
);

export async function repairNodePtySpawnHelper({
  platform = process.platform,
  arch = process.arch,
  helperPath = defaultHelperPath,
  chmod = chmodFile,
} = {}) {
  if (platform !== "darwin" || arch !== "arm64") return false;

  await chmod(helperPath, 0o755);
  return true;
}

const isMain =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) await repairNodePtySpawnHelper();
