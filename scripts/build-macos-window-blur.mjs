import { execFileSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

export async function buildMacOSWindowBlur(
  outputDirectory,
  {
    platform = process.platform,
    arch = process.arch,
    execute = execFileSync,
  } = {},
) {
  if (platform !== "darwin") return;
  const clangArchitecture = { arm64: "arm64", x64: "x86_64" }[arch];
  if (!clangArchitecture)
    throw new Error("macOS blur builds require ARM64 or x64");
  // Small, pinned build-only headers. No Node/V8 headers, ABI rebuild tool or
  // network access is needed, and non-macOS builds never load them.
  const { include_dir } = createRequire(import.meta.url)("node-api-headers");
  await mkdir(outputDirectory, { recursive: true });
  execute(
    "/usr/bin/xcrun",
    [
      "clang++",
      "-std=c++17",
      "-arch",
      clangArchitecture,
      "-mmacosx-version-min=12.0",
      "-fobjc-arc",
      "-fvisibility=hidden",
      "-Wall",
      "-Wextra",
      "-Werror",
      "-DNAPI_VERSION=8",
      "-DNODE_GYP_MODULE_NAME=macos_window_blur",
      `-I${include_dir}`,
      "-bundle",
      "-undefined",
      "dynamic_lookup",
      "-framework",
      "Cocoa",
      path.join(projectRoot, "native", "macos-window-blur.mm"),
      "-o",
      path.join(outputDirectory, "macos-window-blur.node"),
    ],
    { stdio: "pipe", timeout: 60_000 },
  );
}
