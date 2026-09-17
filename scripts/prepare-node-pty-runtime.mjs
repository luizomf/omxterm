import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { chmod as chmodFile, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const defaultUnixRuntimePath = path.join(
  path.dirname(require.resolve("node-pty")),
  "unixTerminal.js",
);
const originalUnixRuntimeDigest =
  "a62e3a60c3bc1b0e7261f58284856df748dcee6761a2bc7a5a5ba98b22660473";
const correctedUnixRuntimeDigest =
  "238f993db4aa83d57885832eabe9c1de1ce05b96c84d3270574f26f71f9afcb8";
const digest = (source) => createHash("sha256").update(source).digest("hex");

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

async function preservePausedUnixExitTail(runtimePath) {
  let source = await readFile(runtimePath, "utf8");
  const sourceDigest = digest(source);
  if (sourceDigest === correctedUnixRuntimeDigest) return;
  if (sourceDigest !== originalUnixRuntimeDigest)
    throw new Error(
      "Unrecognized node-pty Unix runtime; review the pinned output correction",
    );
  const original = `                var timeout_1 = setTimeout(function () {
                    timeout_1 = null;
                    // Destroying the socket now will cause the close event to fire
                    _this._socket.destroy();
                }, DESTROY_SOCKET_TIMEOUT_MS);`;
  const corrected = `                // OMXTerm pauses this stream for renderer backpressure. Do not let
                // node-pty's Unix stuck-close guard discard readable tail bytes while
                // that owned pause is active; owner loss resumes before termination.
                var destroySocket_1 = function () {
                    if (_this._socket.isPaused()) {
                        timeout_1 = setTimeout(destroySocket_1, DESTROY_SOCKET_TIMEOUT_MS);
                        return;
                    }
                    timeout_1 = null;
                    // Destroying the socket now will cause the close event to fire
                    _this._socket.destroy();
                };
                var timeout_1 = setTimeout(destroySocket_1, DESTROY_SOCKET_TIMEOUT_MS);`;
  if (source.split(original).length - 1 !== 1)
    throw new Error("node-pty Unix correction did not match reviewed source");
  source = source.replace(original, corrected);
  if (digest(source) !== correctedUnixRuntimeDigest)
    throw new Error(
      `node-pty Unix correction did not produce reviewed bytes: ${digest(source)}`,
    );
  await writeFile(runtimePath, source);
}

export async function prepareNodePtyRuntime({
  platform = process.platform,
  arch = process.arch,
  helperPath = defaultHelperPath,
  unixRuntimePath = defaultUnixRuntimePath,
  rebuild = rebuildLinuxArm64Runtime,
  chmod = chmodFile,
} = {}) {
  if (platform !== "win32") await preservePausedUnixExitTail(unixRuntimePath);
  if (platform === "linux" && arch === "arm64") {
    await rebuild();
    return "corrected-and-rebuilt";
  }
  if (platform === "darwin" && arch === "arm64") {
    await chmod(helperPath, 0o755);
    return "corrected-and-repaired";
  }
  return platform === "win32" ? "unchanged" : "corrected";
}

const isMain =
  process.argv[1] !== undefined &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isMain) await prepareNodePtyRuntime();
