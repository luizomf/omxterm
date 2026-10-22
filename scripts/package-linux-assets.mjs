import { createHash } from "node:crypto";
import { chmod, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export const linuxHelperName = () => "linux_install.sh";

// Mirrors the pinned electron-builder's per-format architecture names for the
// configured artifactName (${productName}-${version}-${arch}.${ext}).
const linuxArtifactArchitectures = {
  AppImage: { arm64: "arm64", x64: "x86_64" },
  deb: { arm64: "arm64", x64: "amd64" },
  rpm: { arm64: "aarch64", x64: "x86_64" },
};

export function linuxArtifactName(version, arch, extension) {
  const names = linuxArtifactArchitectures[extension];
  if (!names) throw new Error(`Unsupported Linux package format: ${extension}`);
  const architecture = names[arch];
  if (!architecture)
    throw new Error(`Linux packages require arm64 or x64, not ${arch}`);
  return `OMXTerm-${version}-${architecture}.${extension}`;
}

export const linuxAppImageName = (version, arch) =>
  linuxArtifactName(version, arch, "AppImage");

export function renderLinuxHelper(source, version) {
  const marker = "@OMXTERM_VERSION@";
  const occurrences = source.split(marker).length - 1;
  if (occurrences !== 1)
    throw new Error(`Linux helper must contain exactly one ${marker} marker`);
  return source.replace(marker, version);
}

export function checksumContents(filename, contents) {
  const digest = createHash("sha256").update(contents).digest("hex");
  return `${digest}  ${filename}\n`;
}

async function packageVersion() {
  const metadata = JSON.parse(
    await readFile(path.join(projectRoot, "package.json"), "utf8"),
  );
  if (typeof metadata.version !== "string" || metadata.version.length === 0)
    throw new Error("package.json does not contain a version");
  return metadata.version;
}

export async function writeChecksum(file) {
  const contents = await readFile(file);
  await writeFile(
    `${file}.sha256`,
    checksumContents(path.basename(file), contents),
  );
}

export async function packageLinuxAssets(
  outputRoot = path.join(projectRoot, "release"),
  arch = process.arch,
) {
  const version = await packageVersion();
  const appImage = path.join(outputRoot, linuxAppImageName(version, arch));
  const helper = path.join(outputRoot, linuxHelperName());
  const helperSource = await readFile(
    path.join(projectRoot, "scripts", "install-linux-appimage.sh"),
    "utf8",
  );
  await readFile(appImage);
  await writeFile(helper, renderLinuxHelper(helperSource, version), {
    mode: 0o755,
  });
  await chmod(helper, 0o755);
  await Promise.all([writeChecksum(appImage), writeChecksum(helper)]);
  return { appImage, helper };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  packageLinuxAssets()
    .then(({ appImage, helper }) => {
      console.log(
        `Prepared Linux release assets: ${path.basename(appImage)}, ${path.basename(helper)}`,
      );
    })
    .catch((cause) => {
      console.error(cause instanceof Error ? cause.message : cause);
      process.exitCode = 1;
    });
}
