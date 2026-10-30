import { cpSync, mkdirSync, writeFileSync } from "node:fs";
import { chmod, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
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
  it("binds executable/ASAR/backend and rejects changed version, architecture or seal", async () => {
    const root = await scope();
    const input = path.join(root, "input");
    mkdirSync(path.join(input, "dist/extension-runtime"), { recursive: true });
    writeFileSync(
      path.join(input, "package.json"),
      JSON.stringify({ version: "1.0.0" }),
    );
    writeFileSync(
      path.join(input, "dist/extension-runtime/bootstrap.mjs"),
      "backend",
    );
    mkdirSync(path.join(root, "Contents/Resources"), { recursive: true });
    mkdirSync(path.join(root, "Contents/MacOS"));
    writeFileSync(path.join(root, "Contents/MacOS/OMXTerm"), "executable");
    await createPackage(input, path.join(root, "Contents/Resources/app.asar"));
    const command = vi.fn((file: string): string =>
      file.endsWith("lipo")
        ? "arm64\n"
        : file.endsWith("plutil")
          ? "1.0.0\n"
          : "",
    );
    const identity = await inspectDmgApplication(root, "1.0.0", command);
    expect(identity.executableSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(identity.asarSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(identity.backendSha256).toMatch(/^[a-f0-9]{64}$/);
    await expect(
      inspectDmgApplication(root, "2.0.0", command),
    ).rejects.toThrow();
    command.mockImplementation((file) =>
      file.endsWith("lipo") ? "arm64 x86_64" : "",
    );
    await expect(
      inspectDmgApplication(root, "1.0.0", command),
    ).rejects.toThrow();
    command.mockImplementation(() => {
      throw new Error("broken seal");
    });
    await expect(inspectDmgApplication(root, "1.0.0", command)).rejects.toThrow(
      "broken seal",
    );
  });
});
describe("DMG byte/layout identity and finite mount ownership", () => {
  it("binds contents, executable mode and symlink targets without traversing links", async () => {
    const root = await scope();
    await writeFile(path.join(root, "app"), "first");
    await symlink("absent", path.join(root, "link"));
    const first = await bundleIdentity(root);
    await chmod(path.join(root, "app"), 0o755);
    expect(await bundleIdentity(root)).not.toBe(first);
    const executable = await bundleIdentity(root);
    await writeFile(path.join(root, "app"), "second");
    expect(await bundleIdentity(root)).not.toBe(executable);
    const second = await bundleIdentity(root);
    await rm(path.join(root, "link"));
    await symlink("other", path.join(root, "link"));
    expect(await bundleIdentity(root)).not.toBe(second);
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
