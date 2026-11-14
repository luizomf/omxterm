import { execFile as execFileCallback } from "node:child_process";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

// IMAGE_FILE_MACHINE_ARM64 and IMAGE_FILE_MACHINE_AMD64, by Node arch.
const machines = { arm64: 0xaa64, x64: 0x8664 };
const consoleSubsystem = 3; // IMAGE_SUBSYSTEM_WINDOWS_CUI
// Text cmd.exe would have read as syntax, and a trailing backslash that
// quoting must keep.
export const launcherProbeArgument = '--x a&b|c<d>e^f %PATH% "g" \\';

/**
 * The agent client's launcher on Windows (ADR 0052): this architecture's
 * console program beside the client, no .cmd, and the caller's arguments
 * reaching the client as given. The client's usage error echoes one back.
 */
export async function inspectWindowsAgentLauncher(
  resources,
  arch = process.arch,
  execFile = promisify(execFileCallback),
) {
  const folder = path.join(resources, "agent-ctl");
  const files = (await readdir(folder)).sort().join(" ");
  if (files !== "omxterm-ctl.cjs omxterm-ctl.exe")
    throw new Error(`Packaged agent client holds ${files}`);
  const launcher = path.join(folder, "omxterm-ctl.exe");
  const data = await readFile(launcher);
  const pe = data.length >= 0x40 ? data.readUInt32LE(0x3c) : 0;
  if (
    data.readUInt16LE(0) !== 0x5a4d ||
    data.length < pe + 24 + 70 ||
    data.readUInt32LE(pe) !== 0x00004550 ||
    data.readUInt16LE(pe + 4) !== machines[arch]
  )
    throw new Error(`Agent launcher is not an ${arch} PE`);
  // The optional header follows the 24-byte signature and COFF header.
  if (data.readUInt16LE(pe + 24 + 68) !== consoleSubsystem)
    throw new Error("Agent launcher is not a console program");
  // The launcher must set ELECTRON_RUN_AS_NODE itself, so the probe runs
  // without one (names are case-insensitive on Windows). It runs from a \\?\
  // path too, the form Rust's fs::canonicalize gives OMXTERM_CTL.
  const env = Object.fromEntries(
    Object.entries(process.env).filter(
      ([name]) => name.toUpperCase() !== "ELECTRON_RUN_AS_NODE",
    ),
  );
  for (const file of [launcher, path.toNamespacedPath(launcher)]) {
    const answer = await execFile(file, [launcherProbeArgument], {
      encoding: "utf8",
      timeout: 30_000,
      env,
    }).then(
      () => ({ code: 0, stderr: "" }),
      (error) => ({ code: error.code, stderr: error.stderr }),
    );
    if (
      answer.code !== 2 ||
      answer.stderr !== `Unknown option ${launcherProbeArgument}.\n`
    )
      throw new Error(
        `Agent launcher changed its arguments or exit status, run as ${file}`,
      );
  }
}
