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
  nsisInclude,
) {
  // This safety inspection deliberately supports only the reviewed installer footprint.
  // Revisit identities, registry views, locations, shortcuts and NSIS templates together
  // when changing packaging inputs; an unrecognized footprint must never mean absent.
  // #415 adds only a macOS unpacked addon and excludes it from Linux/Windows.
  // NSIS identity, registry/cache paths, shortcuts, templates and options are unchanged.
  // #224 selects the node-pty prebuild by target architecture (arm64 or x64) for the same
  // NSIS footprint; only the packaged native payload differs.
  // #381 and #633 add only the YAML ISC and About presentation MIT notices
  // under resources/licenses. NSIS identities, registration, paths, shortcuts,
  // templates and installer options are unchanged.
  // #704 excludes Linux prebuilds and redundant third_party native inputs from
  // the payload. App ID/name, NSIS options, registration/cache paths, shortcuts
  // and the locked builder/templates remain unchanged; retain exact guarding.
  // #726 excludes separately distributed Files archives/receipts from all host
  // payloads, including custom-output .omxext.json/.omxext.sha256 sidecars.
  // These payload-only exclusions change no app identity, NSIS option,
  // registry/cache location, shortcut, template or locked builder dependency.
  // #712 adds only the macOS extension lease unpack entry. Windows payload,
  // NSIS identities/options, registry/cache paths and locked templates are unchanged.
  // #670 additionally unpacks the macOS Files move addon only; the same Windows
  // payload, NSIS options and locked installer footprint remain unchanged.
  // #712 explicitly unpacks the Linux lease and ARM64 Files move addons;
  // Windows payload/NSIS options and the locked installer footprint are unchanged.
  // The Windows lease addon is unpacked for ARM64; its compiler/linker
  // intermediates are excluded. NSIS identity, registration, cache/shortcut
  // locations and installer options are unchanged.
  // #764 unpacks the macOS Option addon and explicitly excludes it from
  // Linux/Windows. NSIS identity, paths, templates and options are unchanged.
  // #741 adds only exact target-scoped public Snippets resource preparation:
  // ARM64 includes the fixed archive, x64 excludes it. Host identity, NSIS
  // registration/cache paths, templates/options and builder remain unchanged.
  // #864 adds only the Noto Sans Symbols 2 OFL notice under resources/licenses.
  // NSIS identity, registration/cache paths, templates and options are unchanged.
  // ADR 0046 adds only the macOS sign hook. Windows payload, NSIS identity,
  // registration/cache paths, templates and options are unchanged.
  // #964 unpacks the Files move addon on Windows too. NSIS identity,
  // registration/cache paths, templates and options are unchanged.
  // #959 adds only a macOS afterPack hook that rewrites executable UUIDs.
  // Windows payload, NSIS identity, paths, templates and options are unchanged.
  // #1018 adds an NSIS include whose customInstall deletes the installer cache
  // copy, so a successful install leaves no omxterm-updater directory. Identity,
  // registration and shortcuts are unchanged; the include is pinned too.
  // #1025 ships the agent client as a macOS/Linux resource and keeps its
  // build output out of every archive. NSIS identity, paths, templates and
  // options are unchanged.
  // #1078 ships the same client on Windows as resources/agent-ctl, with its
  // .cmd launcher. NSIS identity, paths, templates and options are unchanged.
  const digest = (text) =>
    createHash("sha256").update(text.replaceAll("\r\n", "\n")).digest("hex");
  if (
    builderVersion !== "26.15.3" ||
    packageName !== "omxterm" ||
    digest(configuration) !==
      "9d354b042a9edc8a246c7f41b3895bbe3a53b6b5b58d7aec758778b48f31f2a3" ||
    typeof nsisInclude !== "string" ||
    digest(nsisInclude) !==
      "98bb5a2a43c4e4bad076c7476410a1256420dd917b5d8cd3d59a2ef2759a5aeb"
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
