import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, readdir, readFile, readlink, mkdir } from "node:fs/promises";
import path from "node:path";
import { extractFile } from "@electron/asar";

const prefix = "OMXTERM_SNIPPETS_DMG_";
const names = [
  "DMG",
  "DMG_SHA256",
  "ARCHIVE",
  "ARCHIVE_SHA256",
  "VERSION",
  "EVIDENCE",
  "QUARTZ_TOOL",
] as const;
export function dmgInputs(env = process.env) {
  if (
    !Object.keys(env).some(
      (key) => key.startsWith(prefix) && env[key] !== undefined,
    )
  )
    return undefined;
  assert.ok(
    !Object.keys(env).some(
      (key) =>
        /^(OMXTERM_SNIPPETS_PACKAGED_|OMXTERM_SNIPPETS_APPIMAGE_)/.test(key) &&
        env[key] !== undefined,
    ),
    "Choose one Snippets adapter",
  );
  const values = Object.fromEntries(
    names.map((name) => {
      const value = env[prefix + name];
      assert.ok(value, `${prefix}${name} is required`);
      return [name, value];
    }),
  ) as Record<(typeof names)[number], string>;
  for (const name of ["DMG", "ARCHIVE", "EVIDENCE", "QUARTZ_TOOL"] as const)
    assert.ok(path.isAbsolute(values[name]), `${name} must be absolute`);
  for (const name of ["DMG_SHA256", "ARCHIVE_SHA256"] as const)
    assert.match(values[name], /^[a-f0-9]{64}$/);
  return values;
}
export const sha256 = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");

// Includes dependencies, executable modes and symlink targets without following links.
// This is a byte/layout binding, not a replacement for codesign or the package verifier.
export async function bundleIdentity(root: string): Promise<string> {
  const rows: unknown[] = [];
  async function visit(relative: string) {
    const file = path.join(root, relative);
    const stat = await lstat(file);
    if (stat.isSymbolicLink())
      rows.push([relative, "link", await readlink(file)]);
    else if (stat.isDirectory()) {
      rows.push([relative, "directory", stat.mode & 0o777]);
      for (const name of (await readdir(file)).sort())
        await visit(path.join(relative, name));
    } else {
      assert.ok(stat.isFile(), "Unexpected bundle file type");
      rows.push([
        relative,
        "file",
        stat.mode & 0o777,
        sha256(await readFile(file)),
      ]);
    }
  }
  await visit("");
  return sha256(Buffer.from(JSON.stringify(rows)));
}
export function macCommand(executable: string, args: string[]) {
  return execFileSync(executable, args, {
    encoding: "utf8",
    timeout: 60000,
    maxBuffer: 16 * 1024 * 1024,
  });
}

// Finite read-only mount, faithful copy, then detach BEFORE any GUI launch.
// A failed/uncertain attach still attempts detach; neither outcome is hidden.
export async function copyDmgApplication(
  dmg: string,
  root: string,
  command = macCommand,
) {
  const mount = path.join(root, "volume");
  const application = path.join(root, "OMXTerm.app");
  await mkdir(mount);
  const failures: unknown[] = [];
  let binding: string | undefined;
  try {
    command("/usr/bin/hdiutil", [
      "attach",
      "-readonly",
      "-nobrowse",
      "-noautoopen",
      "-mountpoint",
      mount,
      dmg,
    ]);
    const source = path.join(mount, "OMXTerm.app");
    assert.ok(
      !(await lstat(source)).isSymbolicLink(),
      "Application must be a real bundle",
    );
    binding = await bundleIdentity(source);
    command("/usr/bin/ditto", [source, application]);
    assert.equal(
      await bundleIdentity(application),
      binding,
      "DMG copy changed bundle",
    );
  } catch (error) {
    failures.push(error);
  } finally {
    try {
      command("/usr/bin/hdiutil", ["detach", mount]);
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length)
    throw new AggregateError(
      failures,
      "DMG preparation failed; retain mount/copy evidence",
    );
  return { application, binding: binding! };
}
export async function inspectDmgApplication(
  application: string,
  version: string,
  command = macCommand,
) {
  const executable = path.join(application, "Contents/MacOS/OMXTerm");
  const asar = path.join(application, "Contents/Resources/app.asar");
  command("/usr/bin/codesign", ["--verify", "--deep", "--strict", application]);
  assert.equal(
    command("/usr/bin/lipo", ["-archs", executable]).trim(),
    "arm64",
  );
  assert.equal(
    command("/usr/bin/plutil", [
      "-extract",
      "CFBundleShortVersionString",
      "raw",
      "-o",
      "-",
      path.join(application, "Contents/Info.plist"),
    ]).trim(),
    version,
  );
  assert.equal(
    (
      JSON.parse(extractFile(asar, "package.json").toString()) as {
        version: string;
      }
    ).version,
    version,
  );
  return {
    executable,
    asar,
    executableSha256: sha256(await readFile(executable)),
    asarSha256: sha256(await readFile(asar)),
    backendSha256: sha256(
      extractFile(asar, "dist/extension-runtime/bootstrap.mjs"),
    ),
  };
}
