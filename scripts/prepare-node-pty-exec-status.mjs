import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
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
  "pty.cc": "5e1005d6bdcfbe97b486ee415419fe7adae99035047f07340fbad36419e0bae6",
  "spawn-helper.cc":
    "22195de1710b574d5904fc89be5624c25e531de20d5e17e5998a2fd19d86e0e6",
};

// The installed package remains the pinned upstream source. Patch a private
// build copy, then replace only the native artifacts already used in packages.
export async function prepareNodePtyExecStatus() {
  if (process.platform === "win32") return;
  if (
    !["darwin", "linux"].includes(process.platform) ||
    !["arm64", "x64"].includes(process.arch)
  )
    throw new Error(
      "PTY exec-status builds require a supported 64-bit ARM or x64 platform",
    );
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-pty-build-"));
  try {
    for (const [file, expected] of Object.entries(nativeDigests)) {
      const source = await readFile(path.join(ptyRoot, "src/unix", file));
      if (digest(source) !== expected)
        throw new Error("Unrecognized node-pty native exec source");
      await writeFile(path.join(root, file), source);
    }
    await copyFile(
      path.join(nativeRoot, "node-pty-exec-status.h"),
      path.join(root, "node-pty-exec-status.h"),
    );
    execFileSync(
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
    const mac = process.platform === "darwin";
    const output = path.join(
      ptyRoot,
      mac ? `prebuilds/darwin-${process.arch}` : "build/Release",
    );
    await mkdir(output, { recursive: true });
    const { include_dir: apiHeaders } = require("node-api-headers");
    const addonHeaders = path.dirname(
      createRequire(path.join(ptyRoot, "package.json")).resolve(
        "node-addon-api/package.json",
      ),
    );
    const compiler = mac ? "/usr/bin/clang++" : "c++";
    const targetFlags = mac
      ? [
          "-arch",
          process.arch === "x64" ? "x86_64" : "arm64",
          "-mmacosx-version-min=12.0",
        ]
      : [
          "-fPIC",
          "-pthread",
          // The hardening Linux distributions build their own packages with.
          "-fstack-protector-strong",
          "-D_FORTIFY_SOURCE=2",
        ];
    // Full RELRO and a symbol-stripped module on Linux.
    const linuxLinkFlags = mac ? [] : ["-Wl,-z,relro", "-Wl,-z,now", "-s"];
    execFileSync(
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
        ...linuxLinkFlags,
        path.join(root, "pty.cc"),
        ...(mac ? [] : ["-lutil"]),
        "-o",
        path.join(root, "pty.node"),
      ],
      { stdio: "pipe", timeout: 60_000 },
    );
    if (mac) {
      execFileSync(
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
    }
    await copyFile(path.join(root, "pty.node"), path.join(output, "pty.node"));
    if (mac) {
      // node-pty prefers a local build over prebuilds during development.
      const localBuild = path.join(ptyRoot, "build/Release");
      await mkdir(localBuild, { recursive: true });
      for (const file of ["pty.node", "spawn-helper"])
        await copyFile(path.join(root, file), path.join(localBuild, file));
    }
    await patchExitEvents();
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

async function patchExitEvents() {
  const file = path.join(ptyRoot, "lib/terminal.js");
  const source = await readFile(file, "utf8");
  const original =
    "this.on('exit', function (exitCode, signal) { return _this._onExit.fire({ exitCode: exitCode, signal: signal }); });";
  const corrected =
    "this.on('exit', function (exitCode, signal, execFailed) { return _this._onExit.fire(execFailed === true ? { exitCode: exitCode, signal: signal, execFailed: true } : { exitCode: exitCode, signal: signal }); });";
  const upstream = source.replace(corrected, original);
  if (
    digest(upstream) !==
    "5ed5cd66a766afba4a04093284e999f8516d41936501839055800b10eca5d304"
  )
    throw new Error("Unrecognized node-pty terminal exit runtime");
  await writeFile(file, upstream.replace(original, corrected));
}
