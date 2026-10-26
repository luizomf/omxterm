import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmod,
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";

const require = createRequire(import.meta.url);
const ptyRoot = path.dirname(require.resolve("node-pty/package.json"));
const nativeRoot = path.resolve(import.meta.dirname, "../native");
const digest = (source) => createHash("sha256").update(source).digest("hex");
const nativeDigests = {
  "pty.cc": "5809f87b15122f335017b0b3020071df4c6205c7827186a2c5a9e0edc9ef59b2",
  "spawn-helper.cc":
    "22195de1710b574d5904fc89be5624c25e531de20d5e17e5998a2fd19d86e0e6",
};

// The installed package remains the pinned upstream source. Patch a private
// build copy, then replace only the native artifacts already used in packages.
export async function prepareNodePtyExecStatus({
  platform = process.platform,
  arch = process.arch,
  nodePtyRoot = ptyRoot,
  execute = execFileSync,
} = {}) {
  if (platform === "win32") return;
  if (!(
    (platform === "darwin" && arch === "arm64") ||
    (platform === "linux" && ["arm64", "x64"].includes(arch))
  ))
    throw new Error(
      "PTY exec-status builds require macOS ARM64 or Linux ARM64/x64",
    );
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-pty-build-"));
  try {
    for (const [file, expected] of Object.entries(nativeDigests)) {
      const source = await readFile(path.join(nodePtyRoot, "src/unix", file));
      if (digest(source) !== expected)
        throw new Error("Unrecognized node-pty native exec source");
      await writeFile(path.join(root, file), source);
    }
    await copyFile(
      path.join(nativeRoot, "node-pty-exec-status.h"),
      path.join(root, "node-pty-exec-status.h"),
    );
    execute(
      "patch",
      [
        "--batch",
        "--fuzz=0",
        "-p1",
        "-i",
        path.join(nativeRoot, "node-pty-exec-status.patch"),
      ],
      { cwd: root, stdio: "pipe", timeout: 10_000 },
    );
    for (const [file, expected] of Object.entries({
      "pty.cc":
        "73c161abda7425778368b69ddaf33f8d8c364c17e0c8ea07f44d50663c7e57ba",
      "spawn-helper.cc":
        "c7151b1be942b0a111afae4e2d81bd2bc7b00ea66fdd043fece687607c696748",
    })) {
      if (digest(await readFile(path.join(root, file))) !== expected)
        throw new Error("node-pty native patch did not produce reviewed bytes");
    }
    const mac = platform === "darwin";
    const output = path.join(
      nodePtyRoot,
      mac ? "prebuilds/darwin-arm64" : "build/Release",
    );
    await mkdir(output, { recursive: true });
    const { include_dir: apiHeaders } = require("node-api-headers");
    const addonHeaders = path.dirname(
      createRequire(path.join(nodePtyRoot, "package.json")).resolve(
        "node-addon-api/package.json",
      ),
    );
    const compiler = mac ? "/usr/bin/clang++" : "c++";
    const targetFlags = mac
      ? ["-arch", "arm64", "-mmacosx-version-min=12.0"]
      : ["-fPIC", "-pthread"];
    execute(
      compiler,
      [
        "-std=c++17",
        "-O2",
        "-DNAPI_VERSION=8",
        "-DNODE_GYP_MODULE_NAME=pty",
        "-DNAPI_CPP_EXCEPTIONS",
        `-I${apiHeaders}`,
        `-I${addonHeaders}`,
        ...targetFlags,
        ...(mac ? ["-bundle", "-undefined", "dynamic_lookup"] : ["-shared"]),
        path.join(root, "pty.cc"),
        ...(mac ? [] : ["-lutil"]),
        "-o",
        path.join(root, "pty.node"),
      ],
      { stdio: "pipe", timeout: 60_000 },
    );
    if (mac) {
      execute(
        compiler,
        [
          "-std=c++17",
          "-O2",
          ...targetFlags,
          path.join(root, "spawn-helper.cc"),
          "-o",
          path.join(root, "spawn-helper"),
        ],
        { stdio: "pipe", timeout: 60_000 },
      );
      await copyFile(
        path.join(root, "spawn-helper"),
        path.join(output, "spawn-helper"),
      );
      await chmod(path.join(output, "spawn-helper"), 0o755);
    }
    await copyFile(path.join(root, "pty.node"), path.join(output, "pty.node"));
    if (mac) {
      // node-pty prefers a local build over prebuilds during development.
      const localBuild = path.join(nodePtyRoot, "build/Release");
      await mkdir(localBuild, { recursive: true });
      for (const file of ["pty.node", "spawn-helper"])
        await copyFile(path.join(root, file), path.join(localBuild, file));
      await chmod(path.join(localBuild, "spawn-helper"), 0o755);
    } else {
      // beta.18 adds Linux prebuilds. Never leave an unpatched loader fallback.
      const fallback = path.join(nodePtyRoot, "prebuilds", `linux-${arch}`);
      await mkdir(fallback, { recursive: true });
      await copyFile(
        path.join(root, "pty.node"),
        path.join(fallback, "pty.node"),
      );
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
