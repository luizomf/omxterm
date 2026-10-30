import { execFileSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";

export async function buildFilesMove(outputDirectory) {
  // Only these ARM64 hosts provide the native no-replace primitive. This does
  // not qualify the full Files preview on either platform.
  if (
    (process.platform !== "linux" && process.platform !== "darwin") ||
    process.arch !== "arm64"
  )
    return;
  const mac = process.platform === "darwin";
  const { include_dir } = createRequire(import.meta.url)("node-api-headers");
  await mkdir(outputDirectory, { recursive: true });
  execFileSync(
    mac ? "/usr/bin/xcrun" : process.env.CXX || "c++",
    [
      ...(mac ? ["clang++", "-mmacosx-version-min=12.0"] : []),
      "-std=c++17",
      "-fvisibility=hidden",
      "-Wall",
      "-Wextra",
      "-Werror",
      "-DNAPI_VERSION=8",
      "-DNODE_GYP_MODULE_NAME=files_move",
      `-I${include_dir}`,
      ...(mac
        ? ["-bundle", "-undefined", "dynamic_lookup"]
        : ["-shared", "-fPIC"]),
      path.resolve(import.meta.dirname, "../native/files-move.cc"),
      "-o",
      path.join(outputDirectory, "files-move.node"),
    ],
    { stdio: "pipe", timeout: 60_000 },
  );
}
