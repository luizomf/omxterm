import assert from "node:assert/strict";
import { lstat } from "node:fs/promises";
import path from "node:path";
import {
  isNativeFixtureResult,
  readOutcome,
  type NativeFixtureResult,
} from "./native-fixture-outcome";

type Execute = (
  file: string,
  args: string[],
  options: { timeout: number; maxBuffer?: number },
) => Promise<{ stdout: string }>;
export type PublicNativeRun = (
  receipt: string,
  native: () => Promise<unknown>,
) => Promise<NativeFixtureResult>;

export function assertOutsideInstalledPrefix(
  root: string,
  paths: readonly string[],
) {
  assert.ok(path.win32.isAbsolute(root), "Installed root must be absolute");
  const prefix = path.win32.normalize(root).toLowerCase();
  for (const value of paths) {
    assert.ok(path.win32.isAbsolute(value), "Fixture path must be absolute");
    assert.ok(
      !path.win32.normalize(value).toLowerCase().startsWith(prefix),
      "Fixture path is in the NSIS termination prefix",
    );
  }
}

// This is a transaction-specific fence, not a general executable sandbox.
export function createPublicInstallerFence(config: {
  installer: string;
  temporaryDirectory: string;
  projectRoot: string;
  systemRoot: string;
  evidenceDirectory: string;
  execute: Execute;
}) {
  let state: "not-handed-off" | "unresolved" | "settled" = "not-handed-off";
  let ownedRoot: string | undefined;
  let nativeAttempted = false;
  const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
  const temporaryChild = (value: string, prefix: string) =>
    path.win32.isAbsolute(value) &&
    same(
      path.win32.normalize(path.win32.dirname(value)),
      path.win32.normalize(config.temporaryDirectory),
    ) &&
    new RegExp(`^${prefix}[a-zA-Z0-9]{6}$`).test(path.win32.basename(value));
  const inspection = path.join(
    config.projectRoot,
    "scripts",
    "inspect-windows-installation.ps1",
  );
  const powershell = path.win32.join(
    config.systemRoot,
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
  const inspectArgs = [
    "-NoLogo",
    "-NoProfile",
    "-NonInteractive",
    "-File",
    inspection,
    "-Guid",
    "0ccdd15e-3293-50d3-aa93-6b1e5d7594b5",
  ];
  // eslint-disable-next-line complexity -- Match each reviewed transaction command exactly.
  async function execute(
    file: string,
    args: string[],
    options: { timeout: number; maxBuffer?: number },
  ) {
    const exactOptions = (value: object) => {
      try {
        assert.deepEqual(options, value);
        return true;
      } catch {
        return false;
      }
    };
    if (
      same(file, powershell) &&
      exactOptions({ timeout: 30000, maxBuffer: 65536 }) &&
      inspectArgs.every((arg, i) => args[i] === arg) &&
      (args.length === inspectArgs.length ||
        (args.length === inspectArgs.length + 2 &&
          args[inspectArgs.length] === "-TransactionRoot" &&
          temporaryChild(args[inspectArgs.length + 1]!, "omxterm-installed-") &&
          (!ownedRoot || same(args[inspectArgs.length + 1]!, ownedRoot))))
    )
      return config.execute(file, args, options);
    if (
      same(file, config.installer) &&
      !ownedRoot &&
      state === "not-handed-off" &&
      exactOptions({ timeout: 120000 }) &&
      args.length === 2 &&
      args[0] === "/S" &&
      args[1]?.startsWith("/D=") &&
      temporaryChild(args[1].slice(3), "omxterm-installed-")
    ) {
      ownedRoot = args[1].slice(3);
      return config.execute(file, args, options);
    }
    if (
      ownedRoot &&
      exactOptions({ timeout: 120000 }) &&
      args.length === 3 &&
      args[0] === "/S" &&
      args[1] === "/currentuser" &&
      args[2] === `_?=${ownedRoot}` &&
      path.win32.basename(file) === "Uninstall OMXTerm.exe" &&
      temporaryChild(path.win32.dirname(file), "omxterm-uninstaller-")
    ) {
      assert.notEqual(
        state,
        "unresolved",
        `Native ownership unresolved; uninstaller copy retained at ${file}`,
      );
      return config.execute(file, args, options);
    }
    throw new Error("Unexpected installer transaction execution shape");
  }
  async function verifyInstalled<T>(
    root: string,
    callback: (run: PublicNativeRun) => Promise<T>,
  ): Promise<T> {
    assert.equal(state, "not-handed-off", "Repeated installed callback");
    state = "unresolved";
    assert.ok(
      ownedRoot && same(root, ownedRoot),
      "Installed callback root differs from /D",
    );
    const run: PublicNativeRun = async (receipt, native) => {
      assert.equal(nativeAttempted, false, "Repeated native operation");
      nativeAttempted = true;
      assert.ok(
        path.isAbsolute(receipt) &&
          path.dirname(receipt) === config.evidenceDirectory,
        "Receipt must be directly in the configured lane",
      );
      try {
        await lstat(receipt);
        throw new Error("Supervisor receipt already exists");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
      const result = await native();
      assert.ok(
        isNativeFixtureResult(result),
        "Invalid returned native result",
      );
      assert.deepEqual(result.cleanupErrors, [], "Native cleanup errors");
      assert.ok(!("cleanupFailure" in result), "Native cleanup failure");
      const journal = await readOutcome(receipt);
      assert.ok(journal, "Missing or malformed supervisor receipt");
      for (const key of [
        "exitCode",
        "signal",
        "reason",
        "stdout",
        "stderr",
        "cleanupErrors",
        "cleanupFailure",
      ] as const)
        assert.deepEqual(
          journal[key],
          result[key],
          `Supervisor receipt mismatch: ${key}`,
        );
      state = "settled";
      return result;
    };
    return callback(run);
  }
  return { execute, verifyInstalled };
}
