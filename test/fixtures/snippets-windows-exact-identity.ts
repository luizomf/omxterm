import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { lstat, readdir, readFile, readlink } from "node:fs/promises";
import path from "node:path";
import { extractFile, uncacheAll } from "@electron/asar";

export const digest = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
export const SNIPPETS_SHA256 =
  "6c5723724d0dce26c589909405216c608dd071d7e9b04d63f733e012449c0ab7";
export async function fileIdentity(file: string) {
  const bytes = await readFile(file);
  return { bytes: bytes.length, sha256: digest(bytes) };
}
export async function verifySnippetsArchive(file: string) {
  const identity = await fileIdentity(file);
  assert.deepEqual(
    identity,
    { bytes: 76653, sha256: SNIPPETS_SHA256 },
    "Snippets archive identity",
  );
  return identity;
}

type StageEntry =
  | { path: string; type: "directory" }
  | { path: string; type: "link"; target: string }
  | { path: string; type: "file"; bytes: number; sha256: string };

// Snapshot the whole supplied stage, not just the files the observer needs.
export async function snapshotWindowsStage(root: string) {
  const files: StageEntry[] = [];
  async function visit(relative: string) {
    const file = path.join(root, relative);
    const stat = await lstat(file);
    const name = relative.split(path.sep).join("/");
    if (stat.isSymbolicLink()) {
      assert.ok(relative, "stage root must be a real directory");
      files.push({ path: name, type: "link", target: await readlink(file) });
    } else if (stat.isDirectory()) {
      files.push({ path: name, type: "directory" });
      for (const child of (await readdir(file)).sort())
        await visit(path.join(relative, child));
    } else {
      assert.ok(stat.isFile(), "unexpected stage file type");
      const bytes = await readFile(file);
      files.push({
        path: name,
        type: "file",
        bytes: bytes.length,
        sha256: digest(bytes),
      });
    }
  }
  await visit("");
  return { files, sha256: digest(Buffer.from(JSON.stringify(files))) };
}

export async function inspectWindowsStage(stage: string, version: string) {
  const snapshot = await snapshotWindowsStage(stage);
  assert.ok(
    snapshot.files.every((entry) => entry.type !== "link"),
    "stage links cannot bind their targets",
  );
  const executable = path.join(stage, "OMXTerm.exe");
  const asar = path.join(stage, "resources/app.asar");
  const pe = (bytes: Buffer) => {
    assert.ok(
      bytes.length >= 64 && bytes.readUInt16LE(0) === 0x5a4d,
      "invalid PE",
    );
    const offset = bytes.readUInt32LE(0x3c);
    assert.ok(
      bytes.length >= offset + 6 && bytes.readUInt32LE(offset) === 0x4550,
      "invalid PE signature",
    );
    assert.equal(bytes.readUInt16LE(offset + 4), 0xaa64, "ARM64 PE required");
  };
  const stageFile = async (relative: string) => {
    assert.ok(
      snapshot.files.some(
        (entry) => entry.path === relative && entry.type === "file",
      ),
      `missing real stage file: ${relative}`,
    );
    return readFile(path.join(stage, ...relative.split("/")));
  };
  const executableBytes = await stageFile("OMXTerm.exe");
  pe(executableBytes);
  const asarBytes = await stageFile("resources/app.asar");
  uncacheAll();
  const member = (name: string) => extractFile(asar, path.normalize(name));
  const metadata = JSON.parse(member("package.json").toString()) as {
    version?: string;
    main?: string;
    dependencies?: { restty?: string };
  };
  assert.equal(metadata.version, version, "ASAR version mismatch");
  assert.equal(metadata.main, "dist/main/index.js", "ASAR entry mismatch");
  const entry = member("dist/main/index.js");
  const backend = member("dist/extension-runtime/bootstrap.mjs");
  const nodePty = JSON.parse(
    member("node_modules/node-pty/package.json").toString(),
  ) as { version?: string };
  assert.ok(nodePty.version, "node-pty version missing");
  const runtime: Array<{ path: string; bytes: number; sha256: string }> = [];
  for (const name of [
    "dist/extension-runtime/extension-leases.node",
    "node_modules/node-pty/prebuilds/win32-arm64/conpty.node",
    "node_modules/node-pty/prebuilds/win32-arm64/conpty_console_list.node",
    "node_modules/node-pty/prebuilds/win32-arm64/conpty/conpty.dll",
    "node_modules/node-pty/prebuilds/win32-arm64/conpty/OpenConsole.exe",
  ]) {
    const bytes = await stageFile(`resources/app.asar.unpacked/${name}`);
    pe(bytes);
    assert.deepEqual(bytes, member(name), `ASAR runtime mismatch: ${name}`);
    runtime.push({ path: name, bytes: bytes.length, sha256: digest(bytes) });
  }
  return {
    version,
    executable,
    asar,
    snapshot,
    executableSha256: digest(executableBytes),
    asarSha256: digest(asarBytes),
    entrySha256: digest(entry),
    backendSha256: digest(backend),
    nodePtyVersion: nodePty.version,
    resttyVersion: metadata.dependencies?.restty,
    runtime,
  };
}
