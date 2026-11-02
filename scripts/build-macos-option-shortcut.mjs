import { execFileSync } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));

export async function buildMacOSOptionShortcut(
  outputDirectory,
  {
    platform = process.platform,
    arch = process.arch,
    execute = execFileSync,
  } = {},
) {
  if (platform !== "darwin") return;
  if (arch !== "arm64")
    throw new Error("macOS Option shortcut builds require ARM64");
  const { include_dir } = createRequire(import.meta.url)("node-api-headers");
  await mkdir(outputDirectory, { recursive: true });
  execute(
    "/usr/bin/xcrun",
    [
      "clang++",
      "-std=c++17",
      "-arch",
      "arm64",
      "-mmacosx-version-min=12.0",
      "-fobjc-arc",
      "-fvisibility=hidden",
      "-Wall",
      "-Wextra",
      "-Werror",
      "-DNAPI_VERSION=8",
      "-DNODE_GYP_MODULE_NAME=macos_option_shortcut",
      `-I${include_dir}`,
      "-bundle",
      "-undefined",
      "dynamic_lookup",
      "-framework",
      "Cocoa",
      "-framework",
      "Carbon",
      path.join(projectRoot, "native", "macos-option-shortcut.mm"),
      "-o",
      path.join(outputDirectory, "macos-option-shortcut.node"),
    ],
    { stdio: "pipe", timeout: 60_000 },
  );
}
