import {
  chmod,
  mkdir,
  readFile,
  readdir,
  symlink,
  writeFile,
} from "node:fs/promises";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { claimDefaultSnippets } from "../../src/main/default-snippets";
import * as archiveModule from "../../src/installed-packages/archive";
import { defaultSnippetsFixture } from "../fixtures/default-snippets";

describe("early default profile and permanent attempt", () => {
  it("captures without writes or userData getter contamination; native readiness creation is allowed", async () => {
    const f = await defaultSnippetsFixture();
    const profile = f.capture();
    expect(profile?.userData).toBe(f.userData);
    expect(await readdir(f.root)).toEqual([]);
    expect(f.app.getPath.mock.calls).toEqual([["appData"]]);
    const claim = await f.claim(profile);
    expect(claim.seed).toBeDefined();
    expect(claim.warning).toBeUndefined();
    expect(await readdir(f.userData)).toEqual(["Crashpad", "provisioning"]);
    expect(
      await readFile(
        path.join(f.userData, "provisioning/default-snippets"),
        "utf8",
      ),
    ).toBe("snippets-default-attempt-v1\n");
  });

  it.each([
    "development",
    "ready",
    "override",
    "windows-x64",
    "mac-x64",
    "unknown-target",
  ])("does not enroll %s", async (kind) => {
    const f = await defaultSnippetsFixture();
    if (kind === "development") f.app.isPackaged = false;
    if (kind === "ready") f.app.isReady.mockReturnValue(true);
    if (kind === "override") f.app.commandLine.hasSwitch.mockReturnValue(true);
    if (kind === "windows-x64")
      Object.assign(f.options, { platform: "win32", architecture: "x64" });
    if (kind === "mac-x64")
      Object.assign(f.options, { platform: "darwin", architecture: "x64" });
    if (kind === "unknown-target") f.options.architecture = "unknown";
    expect(f.capture()).toBeUndefined();
    expect(f.app.getPath).not.toHaveBeenCalled();
    const getter = vi.fn(() => {
      throw new Error("must not read userData");
    });
    expect(await claimDefaultSnippets(undefined, getter, f.resources)).toEqual(
      {},
    );
    expect(getter).not.toHaveBeenCalled();
    expect(await readdir(f.root)).toEqual([]);
  });

  it.each([
    "profile",
    "configuration",
    "state",
    "linked-parent",
    "dangling-parent",
    "non-directory",
    "relative-root",
    "invalid-name",
  ])("fails closed on %s", async (kind) => {
    const f = await defaultSnippetsFixture();
    if (kind === "profile") await mkdir(f.userData, { recursive: true });
    if (kind === "configuration") {
      f.app.getPath.mockReturnValue(path.join(f.root, "different"));
      await mkdir(f.userData, { recursive: true });
    }
    if (kind === "state")
      await mkdir(path.join(f.root, "state/omxterm"), { recursive: true });
    if (kind === "linked-parent" || kind === "dangling-parent") {
      const target = path.join(f.root, "elsewhere");
      if (kind === "linked-parent") await mkdir(target);
      await symlink(target, path.join(f.root, "config"), "dir");
    }
    if (kind === "non-directory")
      await writeFile(path.join(f.root, "config"), "not a directory");
    if (kind === "relative-root")
      f.options.environment.XDG_STATE_HOME = "relative";
    if (kind === "invalid-name") f.app.getName.mockReturnValue("../omxterm");
    expect(f.capture()).toBeUndefined();
  });

  it("rejects an alias above the nearest existing ancestor", async () => {
    const f = await defaultSnippetsFixture();
    const target = path.join(f.root, "real");
    await mkdir(path.join(target, "existing"), { recursive: true });
    const alias = path.join(f.root, "alias");
    await symlink(target, alias, "dir");
    f.app.getPath.mockReturnValue(path.join(alias, "existing"));
    expect(f.capture()).toBeUndefined();
  });

  it.skipIf(process.platform === "win32" || process.getuid?.() === 0)(
    "permission errors are unknown, never absence",
    async () => {
      const f = await defaultSnippetsFixture();
      const parent = path.join(f.root, "config");
      await mkdir(parent);
      await chmod(parent, 0);
      try {
        expect(f.capture()).toBeUndefined();
      } finally {
        await chmod(parent, 0o700);
      }
    },
  );

  it("claim failure on a non-directory namespace never installs or resets it", async () => {
    const f = await defaultSnippetsFixture();
    const profile = f.capture();
    await mkdir(f.userData, { recursive: true });
    const namespace = path.join(f.userData, "provisioning");
    await writeFile(namespace, "retain this unknown state");
    const claim = await f.claim(profile);
    expect(claim.seed).toBeUndefined();
    expect(claim.warning).toContain("No default package was installed");
    expect(claim.warning).not.toContain(f.root);
    expect(await readFile(namespace, "utf8")).toBe("retain this unknown state");
  });

  it("uncertain witness-directory sync preserves its consumed marker and returns no seed", async () => {
    const f = await defaultSnippetsFixture();
    const profile = f.capture();
    const sync = vi
      .spyOn(archiveModule, "syncDirectory")
      .mockRejectedValueOnce(new Error("sync failure"));
    try {
      const claim = await f.claim(profile);
      expect(claim.seed).toBeUndefined();
      expect(claim.warning).toBeDefined();
    } finally {
      sync.mockRestore();
    }
    expect(
      await claimDefaultSnippets(profile, () => f.userData, f.resources),
    ).toEqual({});
    expect(
      await readFile(
        path.join(f.userData, "provisioning/default-snippets"),
        "utf8",
      ),
    ).toBe("snippets-default-attempt-v1\n");
  });

  it("rejects a later different userData without claiming the early candidate", async () => {
    const f = await defaultSnippetsFixture();
    const profile = f.capture();
    f.app.isReady.mockReturnValue(true);
    expect(
      await claimDefaultSnippets(
        profile,
        () => `${f.userData}-different`,
        f.resources,
      ),
    ).toEqual({});
    expect(await readdir(f.root)).toEqual([]);
  });

  it("cannot consume an early capture before readiness", async () => {
    const f = await defaultSnippetsFixture();
    const profile = f.capture();
    const getter = vi.fn(() => f.userData);
    expect(await claimDefaultSnippets(profile, getter, f.resources)).toEqual(
      {},
    );
    expect(getter).not.toHaveBeenCalled();
    expect(await readdir(f.root)).toEqual([]);
  });

  it.each(["name", "appData", "config", "state", "override"])(
    "rejects later %s identity changes",
    async (kind) => {
      const f = await defaultSnippetsFixture();
      const profile = f.capture();
      if (kind === "name") f.app.getName.mockReturnValue("other");
      if (kind === "appData")
        f.app.getPath.mockReturnValue(path.join(f.root, "other"));
      if (kind === "config")
        f.options.environment.XDG_CONFIG_HOME = path.join(f.root, "other");
      if (kind === "state")
        f.options.environment.XDG_STATE_HOME = path.join(f.root, "other");
      if (kind === "override")
        f.app.commandLine.hasSwitch.mockReturnValue(true);
      expect(await f.claim(profile)).toEqual({});
      expect(await readdir(f.userData)).toEqual(["Crashpad"]);
    },
  );

  it.each([
    "config.json",
    "snippets.yaml",
    "themes",
    "extensions",
    "extension-state",
    "logs",
  ])("does not claim after concurrent product footprint %s", async (entry) => {
    const f = await defaultSnippetsFixture();
    const profile = f.capture();
    const parent =
      entry === "logs" ? path.join(f.root, "state/omxterm") : f.userData;
    await mkdir(parent, { recursive: true });
    await writeFile(path.join(parent, entry), "existing");
    expect(await f.claim(profile)).toEqual({});
    await expect(
      readFile(path.join(f.userData, "provisioning/default-snippets")),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("one concurrent claimant wins; interrupted/unknown witnesses never replay", async () => {
    const f = await defaultSnippetsFixture();
    const profile = f.capture();
    const claims = await Promise.all([f.claim(profile), f.claim(profile)]);
    expect(claims.filter((claim) => claim.seed)).toHaveLength(1);
    const marker = path.join(f.userData, "provisioning/default-snippets");
    for (const contents of [
      "",
      "unknown future witness",
      "snippets-default-attempt-v1\n",
    ]) {
      await writeFile(marker, contents);
      expect(
        await claimDefaultSnippets(profile, () => f.userData, f.resources),
      ).toEqual({});
      expect(await readFile(marker, "utf8")).toBe(contents);
    }
    f.app.isReady.mockReturnValue(false);
    expect(f.capture()).toBeUndefined();
  });

  it("refuses a linked provisioning directory without writing outside the profile", async () => {
    const f = await defaultSnippetsFixture();
    const profile = f.capture();
    await mkdir(f.userData, { recursive: true });
    const elsewhere = path.join(f.root, "elsewhere");
    await mkdir(elsewhere);
    await symlink(elsewhere, path.join(f.userData, "provisioning"), "dir");
    expect(await f.claim(profile)).toEqual({});
    expect(await readdir(elsewhere)).toEqual([]);
  });
});
