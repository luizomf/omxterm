import { spawnSync } from "node:child_process";
import { readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  checksumContents,
  linuxArtifactName,
  linuxHelperName,
  packageLinuxAssets,
  writeChecksum,
} from "./package-linux-assets.mjs";
import { prepareLinuxLauncher } from "./prepare-linux-launcher.mjs";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const releaseRoot = path.join(projectRoot, "release");
const require = createRequire(import.meta.url);

const platforms = {
  mac: { builder: "--mac", nodePlatform: "darwin" },
  linux: { builder: "--linux", nodePlatform: "linux" },
  win: { builder: "--win", nodePlatform: "win32" },
};

// Native modules (node-pty, its exec-status build and the macOS blur addon)
// are built for the host, so a host packages exactly its own architecture.
export function packagingArchitecture(arch = process.arch) {
  if (arch !== "arm64" && arch !== "x64")
    throw new Error(`OMXTerm packages are built for arm64 or x64, not ${arch}`);
  return arch;
}

function builderArguments(platform, targets, arch, extra = []) {
  return [
    "--config",
    "electron-builder.yml",
    platforms[platform].builder,
    ...targets,
    `--${arch}`,
    "--publish",
    "never",
    ...extra,
  ];
}

// electron-builder omits the suffix for its default (x64) architecture.
const linuxUnpackedDirectory = (arch) =>
  arch === "x64" ? "linux-unpacked" : `linux-${arch}-unpacked`;

// The exact steps and release artifacts for one platform and architecture.
export function packagingPlan(platform, arch, version) {
  if (!platforms[platform])
    throw new Error(`Usage: node scripts/package.mjs <mac|linux|win>`);
  packagingArchitecture(arch);
  if (platform === "mac")
    return {
      steps: [{ builder: builderArguments("mac", ["dmg"], arch) }],
      artifacts: [`OMXTerm-${version}-${arch}.dmg`],
    };
  if (platform === "win")
    return {
      steps: [{ builder: builderArguments("win", ["nsis"], arch) }],
      artifacts: [`OMXTerm-${version}-${arch}.exe`],
    };
  return {
    steps: [
      { task: "prepare-linux-launcher" },
      { builder: builderArguments("linux", ["AppImage"], arch) },
      { task: "package-linux-assets" },
      // DEB and RPM reuse the exact unpacked application the AppImage was
      // built from. A separate run keeps their packaging resources out of
      // the AppImage, which electron-builder would otherwise build in
      // parallel from the same directory.
      {
        builder: builderArguments("linux", ["deb", "rpm"], arch, [
          "--prepackaged",
          path.join("release", linuxUnpackedDirectory(arch)),
        ]),
      },
    ],
    artifacts: [
      linuxArtifactName(version, arch, "AppImage"),
      linuxHelperName(),
      linuxArtifactName(version, arch, "deb"),
      linuxArtifactName(version, arch, "rpm"),
    ],
  };
}

export const checksumListName = (platform, arch) =>
  `SHA256SUMS-${platform}-${arch}.txt`;

// One sha256sum-compatible list per platform and architecture, plus a
// per-artifact .sha256 record for each artifact.
export async function writeChecksums(platform, arch, artifacts, root) {
  let list = "";
  for (const artifact of artifacts) {
    const file = path.join(root, artifact);
    list += checksumContents(artifact, await readFile(file));
    await writeChecksum(file);
  }
  const listPath = path.join(root, checksumListName(platform, arch));
  await writeFile(listPath, list);
  return listPath;
}

function runElectronBuilder(args) {
  const result = spawnSync(
    process.execPath,
    [require.resolve("electron-builder/cli.js"), ...args],
    // fpm resolves the launcher mapping relative to the project root.
    { cwd: projectRoot, stdio: "inherit" },
  );
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`electron-builder exited with status ${result.status}`);
}

export async function packageRelease(platform, arch = process.arch) {
  const { version } = JSON.parse(
    await readFile(path.join(projectRoot, "package.json"), "utf8"),
  );
  if (platforms[platform]?.nodePlatform !== process.platform)
    throw new Error(
      `${platform} packages must be built on their own operating system`,
    );
  const plan = packagingPlan(platform, packagingArchitecture(arch), version);
  for (const step of plan.steps) {
    if (step.builder) runElectronBuilder(step.builder);
    else if (step.task === "prepare-linux-launcher")
      await prepareLinuxLauncher();
    else if (step.task === "package-linux-assets")
      await packageLinuxAssets(releaseRoot, arch);
  }
  const list = await writeChecksums(
    platform,
    arch,
    plan.artifacts,
    releaseRoot,
  );
  return { artifacts: plan.artifacts, checksums: path.basename(list) };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const [platform, ...rest] = process.argv.slice(2);
  Promise.resolve()
    .then(() => {
      if (rest.length > 0 || !platform || !platforms[platform])
        throw new Error("Usage: node scripts/package.mjs <mac|linux|win>");
      return packageRelease(platform);
    })
    .then(({ artifacts, checksums }) => {
      console.log(
        `Packaged ${process.arch}: ${artifacts.join(", ")}; checksums in ${checksums}`,
      );
    })
    .catch((cause) => {
      console.error(cause instanceof Error ? cause.message : cause);
      process.exitCode = 1;
    });
}
