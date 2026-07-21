import { spawn } from "node:child_process";
import { chmod as chmodFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultHelperPath = path.resolve(
  import.meta.dirname,
  "../node_modules/node-pty/prebuilds/darwin-arm64/spawn-helper",
);
const electronBuilderCli = path.resolve(
  import.meta.dirname,
  "../node_modules/electron-builder/cli.js",
);

function rebuildLinuxArm64Runtime() {
  return new Promise((resolve, reject) => {
    const child = spawn(
      process.execPath,
      [
        electronBuilderCli,
        "install-app-deps",
        "--platform=linux",
        "--arch=arm64",
      ],
      { stdio: "inherit" },
    );
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else
        reject(
          new Error(
            `Electron native dependency rebuild failed (${signal ?? code})`,
          ),
        );
    });
  });
}

export async function prepareNodePtyRuntime({
  platform = process.platform,
  arch = process.arch,
  helperPath = defaultHelperPath,
  rebuild = rebuildLinuxArm64Runtime,
  chmod = chmodFile,
} = {}) {
  if (platform === "linux" && arch === "arm64") {
    await rebuild();
    return "rebuilt";
  }
  if (platform === "darwin" && arch === "arm64") {
    await chmod(helperPath, 0o755);
    return "repaired";
  }
  return "unchanged";
}

const isMain =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) await prepareNodePtyRuntime();
