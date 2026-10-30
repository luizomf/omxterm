import { createHash } from "node:crypto";
import { constants } from "node:fs";
import { lstat, mkdir, open } from "node:fs/promises";
import path from "node:path";
import { crc32 } from "node:zlib";
import { valid, validRange } from "semver";
import { packageCompatible } from "./compatibility.js";
import { fromBufferPromise, type Entry, type ZipFile } from "yauzl";
import { isExtensionResource } from "../shared/extensions.js";

export class PackageError extends Error {
  cleanupFailed = false;
  constructor(
    readonly code:
      | "invalid-package"
      | "incompatible"
      | "invalid-store"
      | "busy"
      | "conflict"
      | "unavailable"
      | "outcome-unknown",
  ) {
    super(code);
    this.name = "PackageError";
  }
}

export type PackageManifest = {
  format: 1;
  id: string;
  version: string;
  name: string;
  engines: { omxterm: string; api: string };
  backend: string;
  capabilities?: (
    | "terminal.openSsh.v1"
    | "terminal.captureLayout.v1"
    | "terminal.openLayout.v1"
    | "terminal.mirrorTyping.v1"
    | "terminal.semanticInput.v1"
    | "state.v1"
  )[];
  view?: { entry: string; action: string; title: string; context?: "window" };
};
export type PackageRuntime = { appVersion: string; apiVersion: string };
export const PACKAGE_LIMITS = {
  archiveBytes: 64 * 1024 * 1024,
  expandedBytes: 256 * 1024 * 1024,
  entries: 10_000,
  manifestBytes: 64 * 1024,
} as const;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
function keys(value: Record<string, unknown>, expected: string[]): boolean {
  return Object.keys(value).sort().join() === expected.sort().join();
}
export function validId(id: unknown): id is string {
  return (
    typeof id === "string" &&
    id.length <= 128 &&
    /^[a-z][a-z0-9-]*\.[a-z][a-z0-9.-]*$/.test(id) &&
    !id.includes("..") &&
    !id.endsWith(".")
  );
}

// Portable archive names, not host path normalization: reject ambiguous names
// before touching disk, including case/Unicode aliases on other target systems.
export function packagePath(name: string): string {
  if (name.length === 0 || name.length > 1024 || name.normalize("NFC") !== name)
    throw new PackageError("invalid-package");
  const parts = name.split("/");
  for (const part of parts) {
    if (
      !part ||
      part === "." ||
      part === ".." ||
      part.length > 255 ||
      /[\x00-\x1f\x7f\\:<>"|?*]/.test(part) ||
      /[. ]$/.test(part) ||
      /^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(part) ||
      part.toLowerCase() === ".omxterm-install.json"
    )
      throw new PackageError("invalid-package");
  }
  return name;
}

export function parseManifest(value: unknown): PackageManifest {
  if (
    !isRecord(value) ||
    !keys(value, [
      "format",
      "id",
      "version",
      "name",
      "engines",
      "backend",
      ...("view" in value ? ["view"] : []),
      ...("capabilities" in value ? ["capabilities"] : []),
    ]) ||
    value.format !== 1 ||
    !validId(value.id) ||
    typeof value.version !== "string" ||
    value.version.length > 128 ||
    !valid(value.version) ||
    typeof value.name !== "string" ||
    value.name.length === 0 ||
    value.name.length > 128 ||
    /[\x00-\x1f\x7f]/.test(value.name) ||
    !isRecord(value.engines) ||
    !keys(value.engines, ["omxterm", "api"]) ||
    typeof value.engines.omxterm !== "string" ||
    typeof value.engines.api !== "string" ||
    value.engines.omxterm.length > 256 ||
    value.engines.api.length > 256 ||
    !validRange(value.engines.omxterm) ||
    !validRange(value.engines.api) ||
    typeof value.backend !== "string"
  )
    throw new PackageError("invalid-package");
  validateCapabilities(value);
  packagePath(value.backend);
  if ("view" in value) validateView(value.view, value.id);
  return value as PackageManifest;
}
function validateCapabilities(value: Record<string, unknown>): void {
  if (
    "capabilities" in value &&
    (!Array.isArray(value.capabilities) ||
      value.capabilities.length < 1 ||
      value.capabilities.length > 6 ||
      new Set(value.capabilities).size !== value.capabilities.length ||
      value.capabilities.some(
        (capability) =>
          typeof capability !== "string" ||
          ![
            "terminal.openSsh.v1",
            "terminal.captureLayout.v1",
            "terminal.openLayout.v1",
            "terminal.mirrorTyping.v1",
            "terminal.semanticInput.v1",
            "state.v1",
          ].includes(capability),
      ))
  )
    throw new PackageError("invalid-package");
}

function validateView(view: unknown, id: string): void {
  if (
    !isRecord(view) ||
    !keys(view, [
      "entry",
      "action",
      "title",
      ...("context" in view ? ["context"] : []),
    ]) ||
    ("context" in view && view.context !== "window") ||
    !isExtensionResource(view.entry) ||
    !view.entry.endsWith(".html") ||
    !validId(view.action) ||
    !view.action.startsWith(`${id}.`) ||
    view.action.slice(id.length + 1).includes(".") ||
    typeof view.title !== "string" ||
    !view.title.trim() ||
    view.title.length > 128 ||
    /[\x00-\x1f\x7f]/.test(view.title)
  )
    throw new PackageError("invalid-package");
  packagePath(view.entry);
}
export function checkCompatibility(
  manifest: PackageManifest,
  runtime: PackageRuntime,
): void {
  if (!packageCompatible(manifest, runtime))
    throw new PackageError("incompatible");
}

export async function readBoundedFile(
  file: string,
  maximum: number,
): Promise<Buffer> {
  const before = await lstat(file);
  if (!before.isFile() || before.size > maximum)
    throw new PackageError("invalid-package");
  const handle = await open(
    file,
    constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0),
  );
  try {
    const stat = await handle.stat();
    if (
      !stat.isFile() ||
      stat.dev !== before.dev ||
      stat.ino !== before.ino ||
      stat.size > maximum
    )
      throw new PackageError("invalid-package");
    // Do not use readFile after a size check: the file can grow during the read.
    const chunks: Buffer[] = [];
    let count = 0;
    while (true) {
      const chunk = Buffer.alloc(Math.min(64 * 1024, maximum + 1 - count));
      const { bytesRead } = await handle.read(chunk);
      if (!bytesRead) break;
      count += bytesRead;
      if (count > maximum) throw new PackageError("invalid-package");
      chunks.push(chunk.subarray(0, bytesRead));
    }
    return Buffer.concat(chunks, count);
  } finally {
    await handle.close();
  }
}

type ArchiveNames = Map<
  string,
  { name: string; directory: boolean; explicit: boolean }
>;
function requireRegularEntry(names: ArchiveNames, name: string): void {
  const entry = names.get(archiveKey(name));
  if (!entry || entry.directory || entry.name !== name)
    throw new PackageError("invalid-package");
}
function archiveKey(name: string): string {
  // Conservative Unicode caseless identity: catches final sigma, sharp-s and
  // compatibility aliases without promising filesystem-specific normalization.
  return name.normalize("NFKC").toUpperCase().toLowerCase();
}
function registerEntry(entry: Entry, names: ArchiveNames) {
  const directory = entry.fileName.endsWith("/");
  const name = packagePath(
    directory ? entry.fileName.slice(0, -1) : entry.fileName,
  );
  const mode = entry.externalFileAttributes >>> 16;
  const kind = mode & 0o170000;
  if (
    (kind !== 0 && kind !== (directory ? 0o040000 : 0o100000)) ||
    (directory &&
      [
        entry.uncompressedSize,
        entry.compressedSize,
        entry.compressionMethod,
        entry.crc32,
      ].some((value) => value !== 0)) ||
    (!directory && (entry.externalFileAttributes & 0x10) !== 0) ||
    entry.extraFields.some(
      (field) => field.id === 0x000d || field.id === 0x756e,
    )
  )
    throw new PackageError("invalid-package");
  const parts = name.split("/");
  for (let i = 1; i <= parts.length; i++) {
    const current = parts.slice(0, i).join("/");
    const key = archiveKey(current);
    const last = i === parts.length;
    const old = names.get(key);
    if (
      old &&
      (old.name !== current || !old.directory || (last && old.explicit))
    )
      throw new PackageError("invalid-package");
    if (last && old && !directory) throw new PackageError("invalid-package");
    names.set(key, {
      name: current,
      directory: !last || directory,
      explicit: last || old?.explicit === true,
    });
    if (names.size > PACKAGE_LIMITS.entries)
      throw new PackageError("invalid-package");
  }
  return { directory, name, mode, parts };
}

async function extractFile(
  zip: ZipFile,
  entry: Entry,
  target: string,
  mode: number,
  maximum: number,
): Promise<number> {
  await mkdir(path.dirname(target), { recursive: true, mode: 0o700 });
  const output = await open(target, "wx", mode & 0o111 ? 0o700 : 0o600);
  let size = 0;
  let checksum = 0;
  try {
    const stream = await zip.openReadStreamPromise(entry);
    for await (const chunk of stream) {
      const data = chunk as Buffer;
      size += data.length;
      if (size > maximum) throw new PackageError("invalid-package");
      checksum = crc32(data, checksum);
      await output.writeFile(data);
    }
    if (size !== entry.uncompressedSize || checksum !== entry.crc32)
      throw new PackageError("invalid-package");
    await output.sync();
    return size;
  } finally {
    await output.close();
  }
}

export async function syncDirectory(directory: string): Promise<void> {
  if (process.platform === "win32") return;
  const handle = await open(directory, "r");
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function extractPackage(
  archive: string | Buffer,
  destination: string,
  runtime: PackageRuntime,
): Promise<{ digest: string; manifest: PackageManifest }> {
  if (
    typeof archive === "string" &&
    path.extname(archive).toLowerCase() !== ".omxext"
  )
    throw new PackageError("invalid-package");
  if (Buffer.isBuffer(archive) && archive.length > PACKAGE_LIMITS.archiveBytes)
    throw new PackageError("invalid-package");
  // Capture before the first await. The management service can retain approved
  // bytes rather than reopen a mutable chooser path after the trust dialog.
  const bytes = Buffer.isBuffer(archive)
    ? Buffer.from(archive)
    : await readBoundedFile(archive, PACKAGE_LIMITS.archiveBytes);
  const digest = createHash("sha256").update(bytes).digest("hex");
  const zip = await fromBufferPromise(bytes, { strictFileNames: true }).catch(
    () => {
      throw new PackageError("invalid-package");
    },
  );
  const names: ArchiveNames = new Map();
  let total = 0;
  let entries = 0;
  try {
    for await (const entry of zip.eachEntry()) {
      if (++entries > PACKAGE_LIMITS.entries || entry.isEncrypted())
        throw new PackageError("invalid-package");
      const { directory, name, mode, parts } = registerEntry(entry, names);
      if (entry.uncompressedSize > PACKAGE_LIMITS.expandedBytes - total)
        throw new PackageError("invalid-package");
      const target = path.join(destination, ...parts);
      if (directory) {
        await mkdir(target, { recursive: true, mode: 0o700 });
        continue;
      }
      total += await extractFile(
        zip,
        entry,
        target,
        mode,
        Math.min(
          PACKAGE_LIMITS.expandedBytes - total,
          name === "extension.json"
            ? PACKAGE_LIMITS.manifestBytes
            : PACKAGE_LIMITS.expandedBytes,
        ),
      );
    }
    const manifestEntry = names.get(archiveKey("extension.json"));
    if (manifestEntry?.name !== "extension.json" || manifestEntry.directory)
      throw new PackageError("invalid-package");
    const manifest = parseManifest(
      JSON.parse(
        (
          await readBoundedFile(
            path.join(destination, "extension.json"),
            PACKAGE_LIMITS.manifestBytes,
          )
        ).toString("utf8"),
      ),
    );
    checkCompatibility(manifest, runtime);
    requireRegularEntry(names, manifest.backend);
    if (manifest.view) requireRegularEntry(names, manifest.view.entry);
    for (const item of [...names.values()]
      .filter((item) => item.directory)
      .sort((a, b) => b.name.length - a.name.length))
      await syncDirectory(path.join(destination, item.name));
    await syncDirectory(destination);
    return { digest, manifest };
  } catch (error) {
    if (error instanceof PackageError) throw error;
    throw new PackageError("invalid-package");
  } finally {
    zip.close();
  }
}
