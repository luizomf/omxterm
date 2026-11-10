import { execFileSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { resolveMsvcEnvironment } from "./windows-msvc-environment.mjs";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

export async function buildExtensionLeases(outputDirectory) {
  const { include_dir } = createRequire(import.meta.url)("node-api-headers");
  const output = path.resolve(outputDirectory);
  await mkdir(output, { recursive: true });
  const source = path.join(projectRoot, "native", "extension-leases.cc");
  const addon = path.join(output, "extension-leases.node");
  const defines = ["NAPI_VERSION=8", "NODE_GYP_MODULE_NAME=extension_leases"];
  let command;
  let args;
  let env;
  if (process.platform === "win32") {
    // Uses MSVC and the Windows SDK, found through vswhere when the caller is
    // not already in a native-tools developer shell.
    // Supply an architecture-matched node.exe import library explicitly; no
    // downloads or implicit caches. Delay loading binds Node-API to the running
    // Node/Electron executable rather than trying to load another node.exe.
    const library = process.env.OMXTERM_NODE_IMPORT_LIBRARY;
    if (!library || !path.isAbsolute(library)) {
      throw new Error(
        "OMXTERM_NODE_IMPORT_LIBRARY must name an absolute runtime import library",
      );
    }
    if (process.arch !== "arm64" && process.arch !== "x64") {
      throw new Error("Windows extension leases require ARM64 or x64");
    }
    env = resolveMsvcEnvironment();
    command = "cl.exe";
    args = [
      "/nologo",
      "/std:c++17",
      "/EHsc",
      "/MD",
      "/LD",
      "/W4",
      "/WX",
      ...defines.map((define) => `/D${define}`),
      `/I${include_dir}`,
      source,
      path.join(projectRoot, "native", "extension-leases-delay-load.cc"),
      `/Fo${output}${path.sep}`,
      "/link",
      "/WX",
      `/MACHINE:${process.arch === "arm64" ? "ARM64" : "X64"}`,
      "/DELAYLOAD:node.exe",
      "delayimp.lib",
      library,
      `/OUT:${addon}`,
      `/IMPLIB:${path.join(output, "extension-leases.lib")}`,
    ];
  } else if (process.platform === "darwin" || process.platform === "linux") {
    command =
      process.platform === "darwin"
        ? "/usr/bin/xcrun"
        : process.env.CXX || "c++";
    args = [
      ...(process.platform === "darwin"
        ? ["clang++", "-mmacosx-version-min=12.0"]
        : []),
      "-std=c++17",
      "-fvisibility=hidden",
      "-Wall",
      "-Wextra",
      "-Werror",
      ...defines.map((define) => `-D${define}`),
      `-I${include_dir}`,
      ...(process.platform === "darwin"
        ? ["-bundle", "-undefined", "dynamic_lookup"]
        : ["-shared", "-fPIC"]),
      source,
      "-o",
      addon,
    ];
  } else {
    throw new Error("Unsupported extension lease platform");
  }
  execFileSync(command, args, {
    stdio: "pipe",
    timeout: 60_000,
    ...(env ? { env } : {}),
    // Keep MSVC's generated export and import files with the native output.
    ...(process.platform === "win32" ? { cwd: output } : {}),
  });
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.argv.length !== 3)
    throw new Error("Usage: build-extension-leases.mjs OUTPUT_DIRECTORY");
  await buildExtensionLeases(process.argv[2]);
}
