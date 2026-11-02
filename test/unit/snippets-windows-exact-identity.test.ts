import {
  mkdtemp,
  mkdir,
  rm,
  writeFile,
  readFile,
  symlink,
} from "node:fs/promises";
import { createPackageWithOptions } from "@electron/asar";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import {
  snapshotWindowsStage,
  inspectWindowsStage,
  verifySnippetsArchive,
} from "../fixtures/snippets-windows-exact-identity";

it("records the complete stage layout and detects a changed unpacked runtime file", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "exact-stage-"));
  try {
    await mkdir(path.join(root, "resources/app.asar.unpacked"), {
      recursive: true,
    });
    await writeFile(path.join(root, "OMXTerm.exe"), "executable");
    const runtime = path.join(root, "resources/app.asar.unpacked/conpty.node");
    await writeFile(runtime, "before");
    const before = await snapshotWindowsStage(root);
    expect(before.files).toContainEqual({
      path: "OMXTerm.exe",
      type: "file",
      bytes: 10,
      sha256:
        "a29c2123a01df1d0febb9d308a20d8a2fe3d40a91ca8b1294f59f08f9773ebea",
    });
    await writeFile(runtime, "after");
    expect((await snapshotWindowsStage(root)).sha256).not.toBe(before.sha256);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it.skipIf(process.platform === "win32")(
  "refuses a stage link instead of assuming its target stayed unchanged",
  async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "exact-link-"));
    try {
      await symlink("elsewhere", path.join(root, "linked-file"));
      await expect(inspectWindowsStage(root, "1")).rejects.toThrow(
        "stage links",
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

it("refuses a rebuilt or wrong Snippets archive even if its path is supplied", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "exact-archive-"));
  try {
    const archive = path.join(root, "snippets.omxext");
    await writeFile(archive, Buffer.alloc(76653));
    await expect(verifySnippetsArchive(archive)).rejects.toThrow(
      "Snippets archive identity",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("binds the executable, ASAR version, backend and unpacked ARM64 runtime", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "exact-inspection-"));
  const stage = path.join(root, "stage");
  const members = path.join(root, "members");
  const asar = path.join(stage, "resources/app.asar");
  const pe = Buffer.alloc(128);
  pe.writeUInt16LE(0x5a4d, 0);
  pe.writeUInt32LE(64, 0x3c);
  pe.writeUInt32LE(0x4550, 64);
  pe.writeUInt16LE(0xaa64, 68);
  const put = async (base: string, name: string, bytes: Buffer | string) => {
    await mkdir(path.dirname(path.join(base, name)), { recursive: true });
    await writeFile(path.join(base, name), bytes);
  };
  try {
    await put(stage, "OMXTerm.exe", pe);
    await put(
      members,
      "package.json",
      JSON.stringify({ version: "1.2.3", main: "dist/main/index.js" }),
    );
    await put(members, "dist/main/index.js", "entry");
    await put(members, "dist/extension-runtime/bootstrap.mjs", "backend");
    await put(
      members,
      "node_modules/node-pty/package.json",
      '{"version":"1.2.0-beta.18"}',
    );
    for (const file of [
      "dist/extension-runtime/extension-leases.node",
      "node_modules/node-pty/prebuilds/win32-arm64/conpty.node",
      "node_modules/node-pty/prebuilds/win32-arm64/conpty_console_list.node",
      "node_modules/node-pty/prebuilds/win32-arm64/conpty/conpty.dll",
      "node_modules/node-pty/prebuilds/win32-arm64/conpty/OpenConsole.exe",
    ])
      await put(members, file, pe);
    await mkdir(path.dirname(asar), { recursive: true });
    await createPackageWithOptions(members, asar, { unpack: "*.node" });
    for (const file of [
      "node_modules/node-pty/prebuilds/win32-arm64/conpty/conpty.dll",
      "node_modules/node-pty/prebuilds/win32-arm64/conpty/OpenConsole.exe",
    ])
      await put(`${asar}.unpacked`, file, pe);
    const identity = await inspectWindowsStage(stage, "1.2.3");
    expect(identity).toMatchObject({
      version: "1.2.3",
      executable: path.join(stage, "OMXTerm.exe"),
      asar,
      nodePtyVersion: "1.2.0-beta.18",
    });
    expect(identity.backendSha256).toBe(
      "10e08a419e850eba1ebba18fdd28eb7ec1b7e8baa9bcc3b973e2b8891ec726be",
    );
    await expect(inspectWindowsStage(stage, "wrong")).rejects.toThrow();
    const wrong = Buffer.from(await readFile(path.join(stage, "OMXTerm.exe")));
    wrong.writeUInt16LE(0x8664, 68);
    await writeFile(path.join(stage, "OMXTerm.exe"), wrong);
    await expect(inspectWindowsStage(stage, "1.2.3")).rejects.toThrow("ARM64");
    await writeFile(path.join(stage, "OMXTerm.exe"), pe);
    await rm(path.join(members, "dist/extension-runtime/bootstrap.mjs"));
    await createPackageWithOptions(members, asar, { unpack: "*.node" });
    await expect(inspectWindowsStage(stage, "1.2.3")).rejects.toThrow(
      "bootstrap.mjs",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
