import { execFile as execFileCallback } from "node:child_process";
import { createHash } from "node:crypto";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";

const execFile = promisify(execFileCallback);
// UUID v5 of com.otaviomiranda.omxterm in electron-builder's NSIS namespace.
// For this UUID, UNINSTALL_APP_KEY equals APP_GUID: no second legacy key is emitted.
const installerGuid = "0ccdd15e-3293-50d3-aa93-6b1e5d7594b5";
const inspectionScript = fileURLToPath(
  new URL("./inspect-windows-installation.ps1", import.meta.url),
);

export function inspectWindowsInstallerInputs(
  configuration,
  builderVersion,
  packageName,
) {
  // This safety inspection deliberately supports only the reviewed installer footprint.
  // Revisit identities, registry views, locations, shortcuts and NSIS templates together
  // when changing packaging inputs; an unrecognized footprint must never mean absent.
  // #415 adds only a macOS unpacked addon and excludes it from Linux/Windows.
  // NSIS identity, registry/cache paths, shortcuts, templates and options are unchanged.
  // #224 selects the node-pty prebuild by target architecture (arm64 or x64) for the same
  // NSIS footprint; only the packaged native payload differs.
  // #633 adds only the retained About presentation notice under resources/licenses.
  // NSIS identities, registration, paths, shortcuts and installer options are unchanged.
  const digest = createHash("sha256")
    .update(configuration.replaceAll("\r\n", "\n"))
    .digest("hex");
  if (
    builderVersion !== "26.15.3" ||
    packageName !== "omxterm" ||
    digest !==
      "78bccb116feef0d6ab9582ae3de1939abd0f90d0535d53e0e613deff49a49d1a"
  )
    throw new Error(
      "Unknown Windows installer footprint; review the pinned packaging inputs before exact installer verification",
    );
}

export async function inspectWindowsInstallation(
  execute = execFile,
  transactionRoot,
) {
  const powershell = path.win32.join(
    process.env.SystemRoot ?? "C:\\Windows",
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
  const { stdout } = await execute(
    powershell,
    [
      "-NoLogo",
      "-NoProfile",
      "-NonInteractive",
      "-File",
      inspectionScript,
      "-Guid",
      installerGuid,
      ...(transactionRoot ? ["-TransactionRoot", transactionRoot] : []),
    ],
    { timeout: 30_000, maxBuffer: 64 * 1024 },
  );
  let observation;
  try {
    observation = JSON.parse(stdout.replace(/^\uFEFF/u, ""));
    if (
      !Array.isArray(observation.registrations) ||
      observation.registrations.length > 8 ||
      !Array.isArray(observation.paths) ||
      observation.paths.length > 8 ||
      typeof observation.processes !== "boolean" ||
      observation.paths.some(
        (entry) =>
          !entry ||
          typeof entry.path !== "string" ||
          !path.win32.isAbsolute(entry.path) ||
          !["user", "machine"].includes(entry.scope) ||
          !["install", "shortcut", "cache"].includes(entry.kind) ||
          (entry.kind !== "shortcut"
            ? entry.target !== null
            : typeof entry.target !== "string" ||
              !path.win32.isAbsolute(entry.target)),
      ) ||
      observation.registrations.some(
        (entry) =>
          !entry ||
          !["CurrentUser", "LocalMachine"].includes(entry.hive) ||
          !["Registry32", "Registry64"].includes(entry.view) ||
          !["install", "uninstall"].includes(entry.kind) ||
          ![entry.location, entry.uninstall, entry.shortcut, entry.menu].every(
            (value) => value === null || typeof value === "string",
          ),
      )
    )
      throw new Error("Malformed observation");
  } catch {
    throw new Error(
      "Unknown Windows installation inspection; refusing installer execution",
    );
  }
  return {
    ...observation,
    existing:
      observation.registrations.length > 0 || observation.paths.length > 0,
  };
}

export async function verifyWindowsInstaller({ io, disposableVm = false }) {
  const state = await io.inspect();
  if (
    typeof state?.existing !== "boolean" ||
    typeof state?.processes !== "boolean"
  )
    throw new Error(
      "Unknown Windows installation inspection; refusing installer execution",
    );
  if (state.processes)
    throw new Error(
      "Conflicting OMXTerm or installer processes; close them deliberately before verification. No processes were stopped.",
    );
  if (disposableVm !== true) {
    throw new Error(
      `${state.existing ? "Existing OMXTerm installation. " : ""}Exact NSIS verification requires an explicitly authorized disposable VM; /D does not isolate installations. See docs/release.md and --disposable-vm-allow-omxterm-replacement.`,
    );
  }
  const failures = [];
  try {
    await io.install();
    await io.verify();
  } catch (cause) {
    failures.push(cause);
  }
  try {
    // The adapter must establish transaction ownership before executing cleanup.
    await io.uninstall();
  } catch (cause) {
    failures.push(cause);
  }
  if (failures.length)
    throw new AggregateError(
      failures,
      `Exact NSIS verification failed: ${failures.map((error) => error.message).join("; ")}`,
    );
  return { replacedExisting: state.existing };
}
