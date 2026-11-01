import { createHash } from "node:crypto";
import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import {
  chmod,
  lstat,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  bundleIdentity,
  copyDmgApplication,
  dmgInputs,
  inspectDmgApplication,
} from "../fixtures/snippets-dmg";
import { createPackage } from "@electron/asar";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});
async function scope() {
  const root = await mkdtemp(path.join(os.tmpdir(), "snippets-dmg-unit-"));
  roots.push(root);
  return root;
}
function inputs() {
  return Object.fromEntries(
    Object.entries({
      DMG: "/artifact.dmg",
      DMG_SHA256: "a".repeat(64),
      ARCHIVE: "/snippets.omxext",
      ARCHIVE_SHA256: "b".repeat(64),
      VERSION: "0.24.0-dev.16",
      EVIDENCE: "/evidence",
      QUARTZ_TOOL: "/tool.json",
    }).map(([key, value]) => ["OMXTERM_SNIPPETS_DMG_" + key, value]),
  );
}
describe("exact DMG opt-in", () => {
  it("skips only when entirely absent and rejects every partial input", () => {
    expect(dmgInputs({})).toBeUndefined();
    for (const key of Object.keys(inputs()))
      expect(() => dmgInputs({ [key]: inputs()[key] })).toThrow("required");
    expect(dmgInputs(inputs())?.VERSION).toBe("0.24.0-dev.16");
  });
  it("refuses mixed adapters, relative paths and unbound digests", () => {
    for (const key of [
      "OMXTERM_SNIPPETS_PACKAGED_QUARTZ_TOOL",
      "OMXTERM_SNIPPETS_APPIMAGE_EVIDENCE",
    ])
      expect(() => dmgInputs({ ...inputs(), [key]: "/other" })).toThrow(
        "one Snippets adapter",
      );
    expect(() =>
      dmgInputs({ ...inputs(), OMXTERM_SNIPPETS_DMG_DMG: "relative" }),
    ).toThrow("absolute");
    expect(() =>
      dmgInputs({ ...inputs(), OMXTERM_SNIPPETS_DMG_ARCHIVE_SHA256: "wrong" }),
    ).toThrow();
  });
});
describe("DMG packaged identity refusal", () => {
  async function createApplication(root: string, includeBackend = true) {
    const input = path.join(root, "input");
    mkdirSync(path.join(input, "dist/extension-runtime"), { recursive: true });
    writeFileSync(
      path.join(input, "package.json"),
      JSON.stringify({ version: "1.0.0" }),
    );
    writeFileSync(path.join(input, "dist/bootstrap.mjs"), "decoy");
    if (includeBackend)
      writeFileSync(
        path.join(input, "dist/extension-runtime/bootstrap.mjs"),
        "backend",
      );
    mkdirSync(path.join(root, "Contents/Resources"), { recursive: true });
    mkdirSync(path.join(root, "Contents/MacOS"));
    writeFileSync(path.join(root, "Contents/MacOS/OMXTerm"), "executable");
    await createPackage(input, path.join(root, "Contents/Resources/app.asar"));
  }
  function inspectionCommand() {
    return vi.fn((file: string): string =>
      file.endsWith("lipo")
        ? "arm64\n"
        : file.endsWith("plutil")
          ? "1.0.0\n"
          : "",
    );
  }
  it("binds executable/ASAR/backend and rejects changed version, architecture or seal", async () => {
    const root = await scope();
    await createApplication(root);
    const command = inspectionCommand();
    const identity = await inspectDmgApplication(root, "1.0.0", command);
    expect(identity.executableSha256).toBe(
      "a29c2123a01df1d0febb9d308a20d8a2fe3d40a91ca8b1294f59f08f9773ebea",
    );
    expect(identity.asarSha256).toBe(
      createHash("sha256")
        .update(await readFile(path.join(root, "Contents/Resources/app.asar")))
        .digest("hex"),
    );
    expect(identity.backendSha256).toBe(
      "10e08a419e850eba1ebba18fdd28eb7ec1b7e8baa9bcc3b973e2b8891ec726be",
    );
    await expect(
      inspectDmgApplication(root, "2.0.0", command),
    ).rejects.toThrow();
    command.mockImplementation((file) =>
      file.endsWith("lipo")
        ? "arm64 x86_64"
        : file.endsWith("plutil")
          ? "1.0.0"
          : "",
    );
    await expect(
      inspectDmgApplication(root, "1.0.0", command),
    ).rejects.toThrow();
    command.mockImplementation((file) => {
      if (file.endsWith("codesign")) throw new Error("broken seal");
      return file.endsWith("lipo") ? "arm64" : "1.0.0";
    });
    await expect(inspectDmgApplication(root, "1.0.0", command)).rejects.toThrow(
      "broken seal",
    );
  });
  it("rejects an archive without the exact backend, even with a decoy", async () => {
    const root = await scope();
    await createApplication(root, false);
    await expect(
      inspectDmgApplication(root, "1.0.0", inspectionCommand()),
    ).rejects.toThrow("bootstrap.mjs");
  });
});
describe("DMG byte/layout identity and finite mount ownership", () => {
  it("binds file contents", async () => {
    const root = await scope();
    await writeFile(path.join(root, "app"), "first");
    const first = await bundleIdentity(root);
    await writeFile(path.join(root, "app"), "second");
    expect(await bundleIdentity(root)).not.toBe(first);
  });
  // Windows chmod does not represent POSIX executable permission bits.
  it.skipIf(process.platform === "win32")("binds executable mode", async () => {
    const root = await scope();
    const file = path.join(root, "app");
    await writeFile(file, "contents");
    await chmod(file, 0o644);
    expect((await lstat(file)).mode & 0o777).toBe(0o644);
    const first = await bundleIdentity(root);
    await chmod(file, 0o755);
    expect((await lstat(file)).mode & 0o777).toBe(0o755);
    expect(await bundleIdentity(root)).not.toBe(first);
  });
  it("binds symlink targets without traversing links", async () => {
    const root = await scope();
    const link = path.join(root, "link");
    await symlink("absent", link);
    const first = await bundleIdentity(root);
    await rm(link);
    await symlink("other", link);
    expect(await bundleIdentity(root)).not.toBe(first);
  });
  function mount(root: string, fail?: "attach" | "copy" | "detach" | "tamper") {
    return vi.fn((executable: string, args: string[]) => {
      if (args[0] === "attach") {
        if (fail === "attach") throw new Error("attach uncertain");
        mkdirSync(path.join(root, "volume/OMXTerm.app"));
        writeFileSync(path.join(root, "volume/OMXTerm.app/app"), "sealed");
      } else if (executable.endsWith("ditto")) {
        if (fail === "copy") throw new Error("copy failed");
        cpSync(args[0]!, args[1]!, { recursive: true });
        if (fail === "tamper")
          writeFileSync(path.join(args[1]!, "app"), "changed");
      } else if (fail === "detach") throw new Error("detach failed");
      return "";
    });
  }
  it("copies untouched bytes and detaches before returning an application", async () => {
    const root = await scope(),
      command = mount(root);
    const result = await copyDmgApplication("/exact.dmg", root, command);
    expect(result.binding).toBe(await bundleIdentity(result.application));
    expect(command.mock.calls[0]?.[1]).toEqual([
      "attach",
      "-readonly",
      "-nobrowse",
      "-noautoopen",
      "-mountpoint",
      path.join(root, "volume"),
      "/exact.dmg",
    ]);
    expect(command.mock.calls.at(-1)).toEqual([
      "/usr/bin/hdiutil",
      ["detach", path.join(root, "volume")],
    ]);
  });
  it.each(["attach", "copy", "detach", "tamper"] as const)(
    "retains failure and attempts detach after %s",
    async (fail) => {
      const root = await scope(),
        command = mount(root, fail);
      await expect(
        copyDmgApplication("/exact.dmg", root, command),
      ).rejects.toThrow("DMG preparation failed");
      expect(command.mock.calls.at(-1)?.[1][0]).toBe("detach");
    },
  );
  it("does not reuse a previous mount scope", async () => {
    const root = await scope(),
      command = mount(root);
    await copyDmgApplication("/exact.dmg", root, command);
    command.mockClear();
    await expect(
      copyDmgApplication("/exact.dmg", root, command),
    ).rejects.toThrow();
    expect(command).not.toHaveBeenCalled();
  });
});
