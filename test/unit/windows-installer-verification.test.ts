import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import {
  inspectWindowsInstallation,
  inspectWindowsInstallerInputs,
  verifyWindowsInstaller,
} from "../../scripts/verify-windows-installer.mjs";

function adapter() {
  return {
    inspect: vi.fn().mockResolvedValue({ existing: true, processes: false }),
    install: vi.fn(),
    verify: vi.fn(),
    uninstall: vi.fn(),
  };
}

describe("exact Windows installer verification", () => {
  it("accepts the reviewed footprint including POSIX lease and Files move unpacking", async () => {
    const configuration = await readFile(
      new URL("../../electron-builder.yml", import.meta.url),
      "utf8",
    );
    expect(() =>
      inspectWindowsInstallerInputs(configuration, "26.15.3", "omxterm"),
    ).not.toThrow();
  });
  it("keeps exact input guarding after the POSIX native addon unpacking review", async () => {
    const configuration = await readFile(
      new URL("../../electron-builder.yml", import.meta.url),
      "utf8",
    );
    for (const [config, builder, name] of [
      [
        configuration.replace("oneClick: true", "oneClick: false"),
        "26.15.3",
        "omxterm",
      ],
      [
        configuration.replace(
          "com.otaviomiranda.omxterm",
          "com.example.changed",
        ),
        "26.15.3",
        "omxterm",
      ],
      [
        configuration.replaceAll('    - "!dist/**/*.omxext"\n', ""),
        "26.15.3",
        "omxterm",
      ],
      [
        configuration.replaceAll('    - "!dist/**/*.omxext.json"\n', ""),
        "26.15.3",
        "omxterm",
      ],
      [
        configuration.replaceAll('    - "!dist/**/*.omxext.sha256"\n', ""),
        "26.15.3",
        "omxterm",
      ],
      [
        configuration.replace(
          "    - dist/extension-runtime/extension-leases.node\n",
          "",
        ),
        "26.15.3",
        "omxterm",
      ],
      [
        configuration.replace(
          "    - dist/extension-runtime/files-move.node\n",
          "",
        ),
        "26.15.3",
        "omxterm",
      ],
      [
        configuration.replace(
          "  asarUnpack:\n    - dist/extension-runtime/extension-leases.node\n    - dist/extension-runtime/files-move.node\n    - node_modules/node-pty/build/Release/pty.node",
          "  asarUnpack:\n    - node_modules/node-pty/build/Release/pty.node",
        ),
        "26.15.3",
        "omxterm",
      ],
      [configuration, "26.15.4", "omxterm"],
      [configuration, "26.15.3", "other-package"],
    ] as const) {
      expect(() =>
        inspectWindowsInstallerInputs(config, builder, name),
      ).toThrow(/footprint/i);
    }
  });
  it("recognizes the persistent NSIS cache as existing installation state", async () => {
    const execute = vi.fn().mockResolvedValue({
      stdout: JSON.stringify({
        registrations: [],
        paths: [
          {
            path: "C:\\fixture\\Local\\omxterm-updater",
            kind: "cache",
            scope: "user",
            target: null,
          },
        ],
        processes: false,
      }),
    });
    await expect(inspectWindowsInstallation(execute)).resolves.toMatchObject({
      existing: true,
    });
  });
  it("inspects the transaction destination's NSIS process footprint", async () => {
    const execute = vi.fn(async (_file: string, args: string[]) => ({
      stdout: JSON.stringify({
        registrations: [],
        paths: [],
        processes: args.includes("C:\\fixture\\omxterm-installed-unique"),
      }),
    }));
    await expect(
      inspectWindowsInstallation(
        execute,
        "C:\\fixture\\omxterm-installed-unique",
      ),
    ).resolves.toMatchObject({ processes: true });
  });
  it("rejects changed packaging identity or builder before interpreting Windows state", () => {
    expect(() =>
      inspectWindowsInstallerInputs("changed config", "26.15.3", "omxterm"),
    ).toThrow(/footprint/i);
  });
  it.each([
    "{}",
    '{"registrations":{},"paths":[],"processes":false}',
    '{"registrations":[],"paths":[],"processes":"unknown"}',
    '{"registrations":[{"hive":"other"}],"paths":[],"processes":false}',
    '{"registrations":[],"paths":[null],"processes":false}',
  ])("refuses malformed inspection output: %s", async (stdout) => {
    const execute = vi.fn().mockResolvedValue({ stdout });
    await expect(inspectWindowsInstallation(execute)).rejects.toThrow(
      /inspection/i,
    );
  });

  it.each(["CurrentUser", "LocalMachine"])(
    "detects both registry views and key-only state in %s",
    async (hive) => {
      for (const view of ["Registry32", "Registry64"]) {
        for (const kind of ["install", "uninstall"]) {
          const execute = vi.fn().mockResolvedValue({
            stdout: JSON.stringify({
              registrations: [
                {
                  hive,
                  view,
                  kind,
                  location: null,
                  uninstall: null,
                  shortcut: null,
                  menu: null,
                },
              ],
              paths: [],
              processes: false,
            }),
          });
          await expect(
            inspectWindowsInstallation(execute),
          ).resolves.toMatchObject({ existing: true, processes: false });
        }
      }
    },
  );
  it("refuses inaccessible inspection without entering install or cleanup", async () => {
    const io = adapter();
    io.inspect.mockRejectedValue(new Error("inspection denied"));
    await expect(
      verifyWindowsInstaller({ io, disposableVm: true }),
    ).rejects.toThrow("inspection denied");
    expect(io.install).not.toHaveBeenCalled();
    expect(io.uninstall).not.toHaveBeenCalled();
  });

  it.each(["C:\\fixture\\OMXTerm.lnk", "C:\\fixture\\omxterm"])(
    "detects shortcut or default directory conflicts: %s",
    async (target) => {
      const execute = vi.fn().mockResolvedValue({
        stdout: JSON.stringify({
          registrations: [],
          paths: [
            { path: target, kind: "install", scope: "user", target: null },
          ],
          processes: false,
        }),
      });
      await expect(inspectWindowsInstallation(execute)).resolves.toMatchObject({
        existing: true,
      });
    },
  );

  it("preserves a partial installation failure and attempts only ownership-checked cleanup", async () => {
    const io = adapter();
    io.install.mockRejectedValue(new Error("installer failed"));
    await expect(
      verifyWindowsInstaller({ io, disposableVm: true }),
    ).rejects.toThrow(/installer failed/);
    expect(io.verify).not.toHaveBeenCalled();
    expect(io.uninstall).toHaveBeenCalledOnce();
  });

  it("retains both extraction and owned-cleanup failures", async () => {
    const io = adapter();
    io.verify.mockRejectedValue(new Error("payload mismatch"));
    io.uninstall.mockRejectedValue(new Error("cleanup incomplete"));
    await expect(
      verifyWindowsInstaller({ io, disposableVm: true }),
    ).rejects.toMatchObject({
      errors: [new Error("payload mismatch"), new Error("cleanup incomplete")],
    });
  });

  it.each([
    null,
    {},
    { existing: false },
    { existing: false, processes: true },
    { existing: "unknown", processes: false },
  ])(
    "refuses unknown inspection or live processes even with opt-in: %j",
    async (state) => {
      const io = adapter();
      io.inspect.mockResolvedValue(state);
      await expect(
        verifyWindowsInstaller({ io, disposableVm: true }),
      ).rejects.toThrow(/inspection|process/i);
      expect(io.install).not.toHaveBeenCalled();
      expect(io.uninstall).not.toHaveBeenCalled();
    },
  );

  it("permits intentional replacement in an authorized disposable VM and verifies cleanup", async () => {
    const io = adapter();
    await expect(
      verifyWindowsInstaller({ io, disposableVm: true }),
    ).resolves.toEqual({ replacedExisting: true });
    expect(io.install).toHaveBeenCalledOnce();
    expect(io.verify).toHaveBeenCalledOnce();
    expect(io.uninstall).toHaveBeenCalledOnce();
  });

  it("requires deliberate disposable-VM authorization even on a clean host", async () => {
    const io = adapter();
    io.inspect.mockResolvedValue({ existing: false, processes: false });
    await expect(verifyWindowsInstaller({ io })).rejects.toThrow(
      /disposable VM/i,
    );
    expect(io.install).not.toHaveBeenCalled();
    expect(io.uninstall).not.toHaveBeenCalled();
  });
  it("refuses an existing installation without launching installer or cleanup", async () => {
    const io = adapter();
    await expect(verifyWindowsInstaller({ io })).rejects.toThrow(/existing/i);
    expect(io.install).not.toHaveBeenCalled();
    expect(io.uninstall).not.toHaveBeenCalled();
  });
});
