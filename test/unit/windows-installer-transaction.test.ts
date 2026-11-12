import { createHash } from "node:crypto";
import {
  copyFile,
  mkdir,
  mkdtemp,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { verifyExactWindowsInstaller } from "../../scripts/windows-installer-transaction.mjs";

const aliases = vi.hoisted(() => ({
  enabled: false,
  paths: new Map<string, string>(),
  fault: "",
}));

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return {
    ...actual,
    async mkdtemp(prefix: string) {
      const created = await actual.mkdtemp(prefix);
      if (aliases.enabled && prefix.endsWith("omxterm-installed-")) {
        const name =
          aliases.fault === "canonical-space"
            ? "Long Profile"
            : aliases.fault === "canonical-quote"
              ? "Long’Profile"
              : "LongProfile";
        const canonical = created.replace("SHORT~1", name);
        await actual.mkdir(path.dirname(canonical), { recursive: true });
        await actual.rename(created, canonical);
        await actual.symlink(path.resolve(canonical), created, "junction");
        aliases.paths.set(created, canonical);
      }
      return created;
    },
    async realpath(file: string) {
      // Model native Windows long-name resolution, not POSIX's absolute spelling
      // of the existing relative Windows-looking fixture below.
      return (
        aliases.paths.get(file) ??
        (process.platform === "win32" ? actual.realpath(file) : file)
      );
    },
    async lstat(file: string, options?: { bigint: true }) {
      // The fixture's symlink models a DOS alias, which is NOT a reparse point.
      const metadata = aliases.paths.has(file)
        ? await actual.stat(file, options)
        : await actual.lstat(file, options);
      if (aliases.paths.has(file)) {
        if (aliases.fault === "created-reparse")
          metadata.isSymbolicLink = () => true;
        if (aliases.fault === "missing-identity") metadata.ino = 0n;
      }
      if (
        aliases.fault === "changed-object" &&
        [...aliases.paths.values()].includes(file)
      ) {
        metadata.ino =
          typeof metadata.ino === "bigint"
            ? metadata.ino + 1n
            : metadata.ino + 1;
      }
      return metadata;
    },
  };
});

// Real filesystem, controlled Windows command outcomes: no NSIS or PowerShell
// execution. On Unix a relative Windows-looking path satisfies the transaction's
// Windows ownership checks while keeping all fixture files in one owned tree.
async function transaction(
  remnant: "absent" | "empty" | "payload" | "unknown",
  shortProfile = false,
  fault = "",
) {
  aliases.enabled = shortProfile;
  aliases.fault = fault;
  const root = await mkdtemp(
    process.platform === "win32"
      ? path.join(tmpdir(), "omxterm-transaction-test-")
      : "C:\\omxterm-transaction-test-",
  );
  const temporaryDirectory = shortProfile ? path.join(root, "SHORT~1") : root;
  await mkdir(temporaryDirectory, { recursive: true });
  const installer = path.join(root, "setup.exe");
  const unpackedRoot = path.join(root, "unpacked");
  const localAppData = path.join(root, "Local");
  const cache = path.join(localAppData, "omxterm-updater");
  let installRoot = "";
  let relocatedUninstaller = "";
  let registered = false;
  let cleanInspections = 0;
  await mkdir(unpackedRoot);
  await writeFile(installer, "controlled installer bytes");
  await writeFile(path.join(unpackedRoot, "OMXTerm.exe"), "payload bytes");
  const verifyInstalled = vi.fn(async (installed: string) => {
    expect(await readFile(path.join(installed, "OMXTerm.exe"), "utf8")).toBe(
      "payload bytes",
    );
  });
  const execute = vi.fn(async (file: string, args: string[]) => {
    if (file === installer) {
      installRoot = args[1]!.slice(3);
      await copyFile(
        path.join(unpackedRoot, "OMXTerm.exe"),
        path.join(installRoot, "OMXTerm.exe"),
      );
      await writeFile(
        path.join(installRoot, "Uninstall OMXTerm.exe"),
        "uninstaller bytes",
      );
      if (fault === "left-cache") {
        // Models an installer that keeps electron-builder's updater copy (#1018).
        await mkdir(cache, { recursive: true });
        await copyFile(installer, path.join(cache, "installer.exe"));
      }
      registered = true;
    } else if (path.basename(file) === "Uninstall OMXTerm.exe") {
      relocatedUninstaller = file;
      expect(args).toEqual(["/S", "/currentuser", `_?=${installRoot}`]);
      expect(await readFile(file, "utf8")).toBe("uninstaller bytes");
      registered = false;
      if (remnant === "payload") {
        // Registration cleanup succeeds but the actual installed executable stays.
        await rm(path.join(installRoot, "Uninstall OMXTerm.exe"));
      } else {
        await rm(installRoot, { recursive: true });
        if (remnant !== "absent") await mkdir(installRoot);
        if (remnant === "unknown") {
          await mkdir(path.join(installRoot, "unexpected"));
          await writeFile(
            path.join(installRoot, "unexpected", "evidence.txt"),
            "retain me",
          );
        }
      }
    } else {
      if (relocatedUninstaller) cleanInspections++;
      const inspectedRoot = args[args.indexOf("-TransactionRoot") + 1];
      if (
        args.includes("-TransactionRoot") &&
        aliases.paths.has(inspectedRoot!) &&
        fault === "original-reparse"
      ) {
        throw new Error(
          "Windows installation inspection failed: ancestor reparse",
        );
      }
      const canonicalInspection =
        args.includes("-TransactionRoot") &&
        [...aliases.paths.values()].includes(inspectedRoot!);
      const cacheExists = await readdir(cache).then(
        () => true,
        () => false,
      );
      const observation = {
        registrations: registered
          ? [
              {
                hive: "CurrentUser",
                view: "Registry64",
                kind: "install",
                location: installRoot,
                uninstall: null,
                shortcut: "OMXTerm",
                menu: null,
              },
              {
                hive: "CurrentUser",
                view: "Registry64",
                kind: "uninstall",
                location: null,
                uninstall: `"${path.win32.join(installRoot, "Uninstall OMXTerm.exe")}" /currentuser`,
                shortcut: null,
                menu: null,
              },
            ]
          : [],
        paths: [
          ...(registered
            ? ["Desktop", "Programs"].map((folder) => ({
                path: path.win32.join(localAppData, folder, "OMXTerm.lnk"),
                kind: "shortcut",
                scope: "user",
                target: path.win32.join(
                  aliases.paths.get(installRoot) ?? installRoot,
                  "OMXTerm.exe",
                ),
              }))
            : []),
          ...(cacheExists
            ? [{ path: cache, kind: "cache", scope: "user", target: null }]
            : []),
        ] as {
          path: string;
          kind: string;
          scope: string;
          target: string | null;
        }[],
        processes: canonicalInspection && fault === "canonical-process",
      };
      if (canonicalInspection && fault === "new-cache" && !registered) {
        observation.paths.push({
          path: cache,
          kind: "cache",
          scope: "user",
          target: null,
        });
      }
      if (registered) {
        if (fault === "unrelated-target")
          observation.paths[0]!.target = "C:\\other\\OMXTerm.exe";
        if (fault === "machine-shortcut")
          observation.paths[0]!.scope = "machine";
        if (fault === "foreign-cache")
          observation.paths.push({
            path: `${cache}-unowned`,
            kind: "cache",
            scope: "user",
            target: null,
          });
        if (fault === "unsafe-command")
          observation.registrations[1]!.uninstall =
            '"C:\\unrelated.exe" /currentuser';
      }
      return { stdout: JSON.stringify(observation) };
    }
    return { stdout: "" };
  });
  try {
    const result = verifyExactWindowsInstaller({
      installer,
      unpackedRoot,
      projectRoot: process.cwd(),
      disposableVm: true,
      verifyInstalled,
      execute,
      temporaryDirectory,
      localAppData,
    });
    if (fault === "left-cache") {
      // Both checkpoints report the cache, and cleanup still runs and keeps it.
      await expect(result).rejects.toThrow(
        /cache remains after installation.*cache remains after uninstall/su,
      );
      expect(verifyInstalled).not.toHaveBeenCalled();
      await expect(readdir(installRoot)).rejects.toMatchObject({
        code: "ENOENT",
      });
      expect(await readFile(path.join(cache, "installer.exe"), "utf8")).toBe(
        "controlled installer bytes",
      );
      return;
    }
    if (fault) {
      const expected: Record<string, RegExp> = {
        "canonical-space": /Unsafe canonical NSIS/,
        "canonical-quote": /Unsafe canonical NSIS/,
        "created-reparse": /New NSIS directory ownership/,
        "missing-identity": /New NSIS directory ownership/,
        "changed-object": /New NSIS directory identity changed/,
        "original-reparse": /Windows installation inspection failed/,
        "canonical-process": /Conflicting NSIS path-prefix/,
        "new-cache": /Unowned pre-existing NSIS installer cache/,
        "unrelated-target": /Unowned Windows installation path/,
        "machine-shortcut": /Unowned Windows installation path/,
        "foreign-cache": /Unowned Windows installation path/,
        "unsafe-command": /ownership is not established/,
      };
      await expect(result).rejects.toThrow(expected[fault]);
      expect(verifyInstalled).not.toHaveBeenCalled();
      expect(relocatedUninstaller).toBe("");
      const afterInstall = [
        "unrelated-target",
        "machine-shortcut",
        "foreign-cache",
        "unsafe-command",
      ].includes(fault);
      expect(
        execute.mock.calls.filter(([file]) => file === installer),
      ).toHaveLength(afterInstall ? 1 : 0);
      if (afterInstall) {
        expect(
          await readFile(path.join(installRoot, "OMXTerm.exe"), "utf8"),
        ).toBe("payload bytes");
      } else {
        expect(
          (await readdir(temporaryDirectory)).some((name) =>
            name.startsWith("omxterm-installed-"),
          ),
        ).toBe(true);
      }
      return;
    }
    if (remnant === "absent" || remnant === "empty") {
      await expect(result).resolves.toEqual({
        replacedExisting: false,
        sha256: createHash("sha256")
          .update("controlled installer bytes")
          .digest("hex"),
      });
      await expect(readdir(installRoot)).rejects.toMatchObject({
        code: "ENOENT",
      });
      await expect(readFile(relocatedUninstaller)).rejects.toMatchObject({
        code: "ENOENT",
      });
    } else {
      await expect(result).rejects.toThrow(
        /installed payload removal not established/,
      );
      expect(await readFile(relocatedUninstaller, "utf8")).toBe(
        "uninstaller bytes",
      );
      expect(
        await readFile(
          path.join(
            installRoot,
            remnant === "payload" ? "OMXTerm.exe" : "unexpected/evidence.txt",
          ),
          "utf8",
        ),
      ).toBe(remnant === "payload" ? "payload bytes" : "retain me");
    }
    expect(verifyInstalled).toHaveBeenCalledOnce();
    if (shortProfile) expect(installRoot).toContain("LongProfile");
    expect(cleanInspections).toBe(1);
    // The installer deletes its own updater copy; nothing is left to clean up.
    await expect(readdir(cache)).rejects.toMatchObject({ code: "ENOENT" });
  } finally {
    aliases.enabled = false;
    aliases.fault = "";
    aliases.paths.clear();
    await rm(root, { recursive: true, force: true });
  }
}

describe("exact Windows transaction installed-payload removal", () => {
  it("verifies and removes its own payload when a short profile yields long shortcut targets", async () => {
    await transaction("absent", true);
  });
  it.each([
    "canonical-space",
    "canonical-quote",
    "created-reparse",
    "missing-identity",
    "changed-object",
    "original-reparse",
    "canonical-process",
    "new-cache",
    "unrelated-target",
    "machine-shortcut",
    "foreign-cache",
    "unsafe-command",
  ])("fails closed and retains evidence for %s", async (fault) => {
    await transaction("absent", true, fault);
  });
  it("fails when the installer leaves its updater copy behind", async () => {
    await transaction("absent", false, "left-cache");
  });
  it.each(["absent", "empty"] as const)(
    "accepts an %s installation root after uninstall",
    (remnant) => transaction(remnant),
  );
  it.each(["payload", "unknown"] as const)(
    "rejects and preserves %s residuals despite cleared Windows state",
    (remnant) => transaction(remnant),
  );
});
