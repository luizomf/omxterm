import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";

export const missingBuildToolsMessage =
  'Microsoft C++ build tools were not found. Install "Visual Studio Build Tools" ' +
  'with the "Desktop development with C++" workload (MSVC for this machine\'s ' +
  "architecture and a Windows SDK), or run from a native-tools developer shell.";

/** Parses `set` output into an environment object. */
export function parseEnvironmentDump(text) {
  const environment = {};
  for (const line of text.split(/\r?\n/)) {
    const separator = line.indexOf("=", 1);
    if (separator > 0)
      environment[line.slice(0, separator)] = line.slice(separator + 1);
  }
  return environment;
}

function clIsOnPath(environment) {
  try {
    execFileSync("where.exe", ["cl.exe"], {
      stdio: "ignore",
      env: environment,
    });
    return true;
  } catch {
    return false;
  }
}

function findVcvarsall(arch) {
  const programFiles =
    process.env["ProgramFiles(x86)"] || process.env.ProgramFiles;
  const vswhere = programFiles
    ? path.join(
        programFiles,
        "Microsoft Visual Studio",
        "Installer",
        "vswhere.exe",
      )
    : undefined;
  if (!vswhere || !existsSync(vswhere)) return undefined;
  const component =
    arch === "arm64"
      ? "Microsoft.VisualStudio.Component.VC.Tools.ARM64"
      : "Microsoft.VisualStudio.Component.VC.Tools.x86.x64";
  let installation;
  try {
    installation = execFileSync(
      vswhere,
      [
        "-latest",
        "-products",
        "*",
        "-requires",
        component,
        "-property",
        "installationPath",
      ],
      { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
  } catch {
    return undefined;
  }
  if (!installation) return undefined;
  const vcvarsall = path.join(
    installation,
    "VC",
    "Auxiliary",
    "Build",
    "vcvarsall.bat",
  );
  return existsSync(vcvarsall) ? vcvarsall : undefined;
}

let cached;

/**
 * Environment for running MSVC tools, or null to keep the current one when
 * `cl.exe` is already on PATH (a developer shell); otherwise locates Visual
 * Studio with vswhere and loads vcvarsall for the host architecture.
 */
export function resolveMsvcEnvironment(arch = process.arch) {
  if (cached !== undefined) return cached;
  if (clIsOnPath(process.env)) return (cached = null);
  const vcvarsall = findVcvarsall(arch);
  if (!vcvarsall) throw new Error(missingBuildToolsMessage);
  let dump;
  try {
    dump = execFileSync(
      process.env.ComSpec || "cmd.exe",
      ["/d", "/s", "/c", `"call "${vcvarsall}" ${arch} >nul && set"`],
      { encoding: "utf8", windowsVerbatimArguments: true, timeout: 60_000 },
    );
  } catch {
    throw new Error(
      `${missingBuildToolsMessage} (vcvarsall failed for ${arch})`,
    );
  }
  const environment = parseEnvironmentDump(dump);
  if (!clIsOnPath(environment)) throw new Error(missingBuildToolsMessage);
  return (cached = environment);
}
