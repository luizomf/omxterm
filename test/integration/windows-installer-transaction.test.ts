import {
  copyFile,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { verifyExactWindowsInstaller } from "../../scripts/windows-installer-transaction.mjs";

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));

// Scoped filesystem integration. Every OS command is mocked: this never runs
// PowerShell, an installer, an uninstaller, or a packaged application.
async function refusedTransaction(
  observation: unknown,
  suffix = "safe",
  localAppData = "C:\\fixture\\Local",
  expected = /unowned/i,
  transactionRootConflict = false,
) {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-nsis-regression-"));
  const temporaryDirectory = path.join(root, suffix);
  const installer = path.join(root, "synthetic-installer.exe");
  const launches: string[] = [];
  const execute = vi.fn(async (file: string, args: string[]) => {
    if (args.includes("-Guid"))
      return {
        stdout: JSON.stringify(
          transactionRootConflict
            ? {
                registrations: [],
                paths: [],
                processes: args.includes("-TransactionRoot"),
              }
            : observation,
        ),
      };
    launches.push(file);
    throw new Error("Unexpected installer or uninstaller launch");
  });
  try {
    await mkdir(temporaryDirectory);
    await writeFile(installer, "synthetic bytes; never executable");
    const outcome = verifyExactWindowsInstaller({
      installer,
      unpackedRoot: root,
      projectRoot,
      disposableVm: true,
      verifyInstalled: vi.fn(),
      execute,
      temporaryDirectory,
      localAppData,
    });
    await expect(outcome).rejects.toThrow(expected);
    expect(launches).toEqual([]);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

describe("exact NSIS transaction side-effect refusal", () => {
  it("refuses changed package cache identity before any native command", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "omxterm-nsis-identity-"));
    const execute = vi.fn();
    try {
      await copyFile(
        path.join(projectRoot, "electron-builder.yml"),
        path.join(root, "electron-builder.yml"),
      );
      await mkdir(path.join(root, "scripts"));
      await copyFile(
        path.join(projectRoot, "scripts", "nsis-installer.nsh"),
        path.join(root, "scripts", "nsis-installer.nsh"),
      );
      await writeFile(
        path.join(root, "package.json"),
        JSON.stringify({ name: "other-product" }),
      );
      await expect(
        verifyExactWindowsInstaller({
          projectRoot: root,
          installer: path.join(root, "not-launched.exe"),
          unpackedRoot: root,
          disposableVm: true,
          verifyInstalled: vi.fn(),
          execute,
        }),
      ).rejects.toThrow(/footprint/i);
      expect(execute).not.toHaveBeenCalled();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("completes installation and cleanup without the uninstaller targeting itself", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "omxterm-nsis-success-"));
    const installer = path.join(root, "synthetic-installer.exe");
    const unpackedRoot = path.join(root, "payload");
    const cacheRoot = path.join(root, "omxterm-updater");
    let installedRoot = "";
    let registered = false;
    let cleanupExecutable = "";
    const verifyInstalled = vi.fn(async () => {});
    const execute = async (file: string, args: string[]) => {
      if (args.includes("-Guid"))
        return {
          stdout: JSON.stringify({
            paths: (await readdir(root)).includes("omxterm-updater")
              ? [
                  {
                    path: cacheRoot,
                    kind: "cache",
                    scope: "user",
                    target: null,
                  },
                ]
              : [],
            processes: false,
            registrations: registered
              ? [
                  {
                    hive: "CurrentUser",
                    view: "Registry64",
                    kind: "install",
                    location: installedRoot,
                    uninstall: null,
                    shortcut: "OMXTerm",
                    menu: null,
                  },
                  {
                    hive: "CurrentUser",
                    view: "Registry64",
                    kind: "uninstall",
                    location: null,
                    uninstall: `"${path.win32.join(installedRoot, "Uninstall OMXTerm.exe")}" /currentuser`,
                    shortcut: null,
                    menu: null,
                  },
                ]
              : [],
          }),
        };
      if (file === installer) {
        installedRoot = args
          .find((argument) => argument.startsWith("/D="))!
          .slice(3);
        await writeFile(
          path.join(installedRoot, "OMXTerm.exe"),
          "synthetic payload",
        );
        await writeFile(
          path.join(installedRoot, "Uninstall OMXTerm.exe"),
          "synthetic owned uninstaller",
        );
        registered = true;
      } else {
        cleanupExecutable = file;
        if (file.toLowerCase().startsWith(installedRoot.toLowerCase()))
          throw new Error("NSIS uninstaller targets itself");
        expect(await readFile(file, "utf8")).toBe(
          "synthetic owned uninstaller",
        );
        expect(args).toContain(`_?=${installedRoot}`);
        registered = false;
        await rm(installedRoot, { recursive: true });
      }
      return { stdout: "" };
    };
    try {
      await mkdir(unpackedRoot);
      await writeFile(installer, "synthetic installer");
      await writeFile(
        path.join(unpackedRoot, "OMXTerm.exe"),
        "synthetic payload",
      );
      await expect(
        verifyExactWindowsInstaller({
          installer,
          unpackedRoot,
          projectRoot,
          disposableVm: true,
          verifyInstalled,
          execute,
          temporaryDirectory: root,
          localAppData: root,
        }),
      ).resolves.toMatchObject({ replacedExisting: false });
      expect(verifyInstalled).toHaveBeenCalledOnce();
      expect(cleanupExecutable).not.toBe("");
      expect((await readdir(root)).sort()).toEqual([
        "payload",
        "synthetic-installer.exe",
      ]);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
  it("refuses orphan registration before installer or cleanup", async () => {
    const location = "C:\\fixture\\Local\\Programs\\omxterm";
    await refusedTransaction({
      processes: false,
      paths: [],
      registrations: [
        {
          hive: "CurrentUser",
          view: "Registry64",
          kind: "install",
          location,
          uninstall: null,
          shortcut: "OMXTerm",
          menu: null,
        },
        {
          hive: "CurrentUser",
          view: "Registry64",
          kind: "uninstall",
          location: null,
          uninstall: `"${location}\\Uninstall OMXTerm.exe" /currentuser`,
          shortcut: null,
          menu: null,
        },
      ],
    });
  });
  it("refuses the transaction destination's process footprint before installer or cleanup", async () => {
    await refusedTransaction(undefined, "safe", undefined, /process/i, true);
  });
  it.each(["\u2018", "\u2019", "\u201a", "\u201b", " "])(
    "refuses unsupported NSIS temporary-path quoting: %s",
    async (quote) => {
      await refusedTransaction(
        { registrations: [], paths: [], processes: false },
        `temp-${quote}`,
        undefined,
        /unsafe/i,
      );
    },
  );

  it.each(["\u2018", "\u2019", "\u201a", "\u201b"])(
    "refuses a PowerShell quote in the previous installation root: %s",
    async (quote) => {
      const localAppData = `C:\\fixture${quote}\\Local`;
      const location = `${localAppData}\\Programs\\omxterm`;
      await refusedTransaction(
        {
          processes: false,
          paths: [],
          registrations: [
            {
              hive: "CurrentUser",
              view: "Registry64",
              kind: "install",
              location,
              uninstall: null,
              shortcut: "OMXTerm",
              menu: null,
            },
            {
              hive: "CurrentUser",
              view: "Registry64",
              kind: "uninstall",
              location: null,
              uninstall: `"${location}\\Uninstall OMXTerm.exe" /currentuser`,
              shortcut: null,
              menu: null,
            },
          ],
        },
        "safe",
        localAppData,
        /ownership/i,
      );
    },
  );
  it.each([
    {
      path: "C:\\fixture\\Desktop\\OMXTerm.lnk",
      scope: "user",
      kind: "shortcut",
      target: "C:\\OtherApp\\app.exe",
    },
    {
      path: "C:\\fixture\\Local\\omxterm-updater",
      scope: "user",
      kind: "cache",
      target: null,
    },
    {
      path: "C:\\Program Files\\OMXTerm",
      scope: "machine",
      kind: "install",
      target: null,
    },
  ])(
    "refuses unowned conflicts beside a valid per-user registration: %j",
    async (entry) => {
      const location = "C:\\fixture\\Local\\Programs\\omxterm";
      await refusedTransaction({
        processes: false,
        paths: [entry],
        registrations: [
          {
            hive: "CurrentUser",
            view: "Registry64",
            kind: "install",
            location,
            uninstall: null,
            shortcut: "OMXTerm",
            menu: null,
          },
          {
            hive: "CurrentUser",
            view: "Registry64",
            kind: "uninstall",
            location: null,
            uninstall: `"${location}\\Uninstall OMXTerm.exe" /currentuser`,
            shortcut: null,
            menu: null,
          },
        ],
      });
    },
  );
  it.each([
    "C:\\fixture\\Desktop\\OMXTerm.lnk",
    "C:\\fixture\\Local\\Programs\\omxterm",
  ])(
    "refuses an orphan path before installer and cleanup: %s",
    async (target) => {
      await refusedTransaction({
        registrations: [],
        paths: [{ path: target, scope: "user", kind: "install", target: null }],
        processes: false,
      });
    },
  );
});
