import { execFileSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { resolveMsvcEnvironment } from "./windows-msvc-environment.mjs";

const native = (file) => path.resolve(import.meta.dirname, "../native", file);

// Native no-replace moves wherever build.mjs builds the extension runtime.
// macOS and Windows also supply their system trash; Linux keeps the
// extension's literal gio call.
export async function buildFilesMove(outputDirectory) {
  const { platform, arch } = process;
  const { include_dir } = createRequire(import.meta.url)("node-api-headers");
  const output = path.resolve(outputDirectory);
  await mkdir(output, { recursive: true });
  const addon = path.join(output, "files-move.node");
  const defines = ["NAPI_VERSION=8", "NODE_GYP_MODULE_NAME=files_move"];
  if (platform === "win32") {
    // Same MSVC route, static C++ runtime and delay-loaded node.exe binding
    // as extension leases.
    const library = process.env.OMXTERM_NODE_IMPORT_LIBRARY;
    if (!library || !path.isAbsolute(library))
      throw new Error(
        "OMXTERM_NODE_IMPORT_LIBRARY must name an absolute runtime import library",
      );
    execFileSync(
      "cl.exe",
      [
        "/nologo",
        "/std:c++17",
        "/EHsc",
        "/MT",
        "/LD",
        "/W4",
        "/WX",
        "/DUNICODE",
        "/D_UNICODE",
        ...defines.map((define) => `/D${define}`),
        `/I${include_dir}`,
        native("files-move.cc"),
        native("files-windows.cc"),
        native("extension-leases-delay-load.cc"),
        `/Fo${output}${path.sep}`,
        "/link",
        "/WX",
        `/MACHINE:${arch === "arm64" ? "ARM64" : "X64"}`,
        "/DELAYLOAD:node.exe",
        "delayimp.lib",
        "ole32.lib",
        "shell32.lib",
        library,
        `/OUT:${addon}`,
        `/IMPLIB:${path.join(output, "files-move.lib")}`,
      ],
      {
        stdio: "pipe",
        timeout: 60_000,
        env: resolveMsvcEnvironment(),
        cwd: output,
      },
    );
    return;
  }
  const mac = platform === "darwin";
  execFileSync(
    mac ? "/usr/bin/xcrun" : process.env.CXX || "c++",
    [
      ...(mac ? ["clang++", "-mmacosx-version-min=12.0"] : []),
      "-std=c++17",
      "-fvisibility=hidden",
      "-Wall",
      "-Wextra",
      "-Werror",
      ...defines.map((define) => `-D${define}`),
      `-I${include_dir}`,
      ...(mac
        ? ["-bundle", "-undefined", "dynamic_lookup"]
        : ["-shared", "-fPIC"]),
      native("files-move.cc"),
      ...(mac
        ? [native("files-trash-macos.mm"), "-framework", "Foundation"]
        : []),
      "-o",
      addon,
    ],
    { stdio: "pipe", timeout: 60_000 },
  );
}
