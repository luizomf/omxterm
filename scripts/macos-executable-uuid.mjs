import { createHash } from "node:crypto";
import { readdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

// macOS Local Network privacy tells programs apart partly by the main
// executable's Mach-O UUID (TN3179). Electron ships one prebuilt binary, so a
// packaged OMXTerm would share its UUIDs with stock Electron and with every
// other app on the same Electron version. When one of those reached the local
// network first, macOS never asked about OMXTerm and kept its shells off the
// LAN. This hook gives OMXTerm's executables their own UUIDs before signing.

const fatMagic = 0xcafebabe;
const machO64Magic = 0xfeedfacf;
const machO64HeaderSize = 32;
const loadCommandUuid = 0x1b;

/**
 * Derives a stable RFC 4122 name-based UUID for one executable of the app.
 * It depends only on the bundle identifier and the executable's path inside
 * the bundle, so it stays the same across OMXTerm and Electron updates.
 */
export function executableUuid(bundleIdentifier, relativePath) {
  const bytes = createHash("sha256")
    .update(`${bundleIdentifier}\0${relativePath}`)
    .digest()
    .subarray(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  return bytes;
}

function replaceThinUuid(binary, start, uuid) {
  if (binary.readUInt32LE(start) !== machO64Magic)
    throw new Error("Expected a 64-bit little-endian Mach-O image");
  const commandCount = binary.readUInt32LE(start + 16);
  let offset = start + machO64HeaderSize;
  let replaced = 0;
  for (let index = 0; index < commandCount; index += 1) {
    const command = binary.readUInt32LE(offset);
    const size = binary.readUInt32LE(offset + 4);
    if (size < 8 || offset + size > binary.length)
      throw new Error("Malformed Mach-O load command");
    if (command === loadCommandUuid) {
      uuid.copy(binary, offset + 8);
      replaced += 1;
    }
    offset += size;
  }
  if (replaced !== 1)
    throw new Error(`Expected one LC_UUID load command, found ${replaced}`);
}

/** Replaces the LC_UUID of every architecture slice in a Mach-O binary. */
export function replaceMachOUuid(binary, uuid) {
  if (binary.readUInt32BE(0) !== fatMagic) {
    replaceThinUuid(binary, 0, uuid);
    return;
  }
  const sliceCount = binary.readUInt32BE(4);
  for (let index = 0; index < sliceCount; index += 1)
    replaceThinUuid(binary, binary.readUInt32BE(8 + index * 20 + 8), uuid);
}

async function bundleExecutables(applicationPath, productName) {
  const executables = [path.join("Contents", "MacOS", productName)];
  const frameworks = path.join(applicationPath, "Contents", "Frameworks");
  for (const entry of await readdir(frameworks)) {
    if (!entry.endsWith(".app")) continue;
    const macOS = path.join(
      "Contents",
      "Frameworks",
      entry,
      "Contents",
      "MacOS",
    );
    for (const name of await readdir(path.join(applicationPath, macOS)))
      executables.push(path.join(macOS, name));
  }
  return executables;
}

// electron-builder afterPack hook. It runs before code signing, so the seal
// covers the rewritten executables.
export default async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") return;
  const { productFilename, id } = context.packager.appInfo;
  const applicationPath = path.join(
    context.appOutDir,
    `${productFilename}.app`,
  );
  for (const relativePath of await bundleExecutables(
    applicationPath,
    productFilename,
  )) {
    const file = path.join(applicationPath, relativePath);
    const binary = await readFile(file);
    replaceMachOUuid(binary, executableUuid(id, relativePath));
    await writeFile(file, binary);
  }
}
