import { createHash } from "node:crypto";
import { constants } from "node:fs";
import {
  chmod,
  lstat,
  mkdir,
  open,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Arch } from "builder-util";
import verifyLinuxLauncher from "./prepare-linux-launcher.mjs";

import defaultSnippets from "../assets/default-snippets.json" with { type: "json" };
export { defaultSnippets };
const root = fileURLToPath(new URL("../", import.meta.url));
const inputPath = (project) =>
  path.join(project, "assets", "default-snippets", defaultSnippets.filename);

export async function readDefaultSnippets(file) {
  const stat = await lstat(file);
  if (
    !stat.isFile() ||
    stat.isSymbolicLink() ||
    stat.size !== defaultSnippets.bytes
  )
    throw new Error("Invalid bundled Snippets input");
  const handle = await open(
    file,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
  );
  try {
    const opened = await handle.stat();
    if (!opened.isFile() || opened.size !== defaultSnippets.bytes)
      throw new Error("Invalid opened Snippets input");
    const bytes = Buffer.alloc(defaultSnippets.bytes + 1);
    let offset = 0;
    while (offset < bytes.length) {
      const { bytesRead } = await handle.read(
        bytes,
        offset,
        bytes.length - offset,
        offset,
      );
      if (!bytesRead) break;
      offset += bytesRead;
    }
    const captured = bytes.subarray(0, offset);
    if (
      captured.length !== defaultSnippets.bytes ||
      createHash("sha256").update(captured).digest("hex") !==
        defaultSnippets.sha256
    )
      throw new Error("Bundled Snippets digest mismatch");
    return captured;
  } finally {
    await handle.close();
  }
}

// Offline fixed-input preparation, not network acquisition or an archive rebuild.
export async function prepareDefaultSnippets(archive, project = root) {
  const bytes = await readDefaultSnippets(archive);
  const destination = inputPath(project);
  await mkdir(path.dirname(destination), { recursive: true });
  const previous = await lstat(destination).catch((error) => {
    if (error?.code !== "ENOENT") throw error;
    return undefined;
  });
  if (previous && (!previous.isFile() || previous.isSymbolicLink()))
    throw new Error("Invalid fixed Snippets destination");
  await writeFile(destination, bytes, { mode: 0o644 });
}

export async function stageDefaultSnippets(project, target) {
  const match = /^([a-z0-9]+)-([a-z0-9]+)$/u.exec(target);
  if (!match) throw new Error("Invalid package target");
  const os =
    match[1] === "darwin" ? "mac" : match[1] === "win32" ? "win" : match[1];
  const resources = path.join(
    project,
    "dist",
    "default-snippets",
    `${os}-${match[2]}`,
  );
  const directory = path.join(resources, "bundled-snippets");
  // Required input failure must not leave stale archive bytes eligible to package.
  await rm(directory, { recursive: true, force: true });
  await mkdir(directory, { recursive: true });
  if (defaultSnippets.targets.includes(target)) {
    const file = path.join(directory, defaultSnippets.filename);
    await writeFile(file, await readDefaultSnippets(inputPath(project)), {
      mode: 0o644,
    });
    // Public distribution data must remain readable by installed users even
    // when the build account has a private umask.
    await chmod(directory, 0o755);
    await chmod(file, 0o644);
  }
  return resources;
}

export async function verifyDefaultSnippetsResources(resources, target) {
  const allowed = defaultSnippets.targets.includes(target)
    ? `bundled-snippets/${defaultSnippets.filename}`
    : undefined;
  for (const entry of await readdir(resources, { recursive: true })) {
    const name = entry.split(path.sep).join("/");
    if (/\.omxext(?:\.(?:json|sha256))?$/iu.test(name) && name !== allowed)
      throw new Error("Unexpected extension archive outside app.asar");
  }
  const directory = path.join(resources, "bundled-snippets");
  let names;
  try {
    const stat = await lstat(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new Error("Invalid bundled Snippets directory");
    names = await readdir(directory);
  } catch (error) {
    if (error?.code !== "ENOENT" || defaultSnippets.targets.includes(target))
      throw error;
    return;
  }
  const expected = defaultSnippets.targets.includes(target)
    ? [defaultSnippets.filename]
    : [];
  if (JSON.stringify(names.sort()) !== JSON.stringify(expected))
    throw new Error("Unexpected bundled extension resources");
  if (expected.length)
    await readDefaultSnippets(path.join(directory, defaultSnippets.filename));
}

// Electron-builder beforePack, including direct invocations. Only payload staging
// changes; ordinary source builds/development never require or provision a seed.
export default async function preparePackageInputs(context) {
  await verifyLinuxLauncher(context);
  await stageDefaultSnippets(
    context.packager.projectDir,
    `${context.electronPlatformName}-${Arch[context.arch]}`,
  );
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  if (process.argv.length > 3)
    throw new Error(
      "Usage: node scripts/prepare-default-snippets.mjs [VERIFIED_ARCHIVE]",
    );
  if (process.argv[2]) await prepareDefaultSnippets(process.argv[2]);
  else await readDefaultSnippets(inputPath(root));
  console.log(
    "Verified pinned Snippets input for packaging; no network or code activation.",
  );
}
