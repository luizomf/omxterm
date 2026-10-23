import { listPackage, extractFile } from "@electron/asar";
import { execFile as execFileCallback, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { lstat, mkdir, mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { linuxArtifactName } from "./package-linux-assets.mjs";
import {
  assertNoUpdateMetadata,
  assertSameFile,
  inspectAsarEntries,
  inspectForbiddenPackagedEntries,
  nativeBinaryKind,
  packagedArchitecture,
  sourceVersion,
  unpackedDirectoryName,
  verifyChecksum,
  verifyLicenseResources,
  verifyLinuxNativeTree,
} from "./verify-packaged-app.mjs";

const execFile = promisify(execFileCallback);
const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const installRoot = "/opt/OMXTerm";
const launcherSource = path.join(projectRoot, "packaging", "linux", "omxterm");
const iconEntry = "/usr/share/icons/hicolor/1024x1024/apps/omxterm.png";
const desktopEntry = "/usr/share/applications/omxterm.desktop";

const packageArchitectures = {
  deb: { arm64: "arm64", x64: "amd64" },
  rpm: { arm64: "aarch64", x64: "x86_64" },
};

// Exact DEB/RPM package version for an npm version (prereleases sort first).
export const systemPackageVersion = (version) => version.replaceAll("-", "~");

export function parseDebControl(contents) {
  const fields = new Map();
  let current;
  for (const line of contents.split("\n")) {
    if (/^\s/u.test(line) && current) {
      fields.set(current, `${fields.get(current)}\n${line.trim()}`);
      continue;
    }
    const match = /^([\w-]+):\s*(.*)$/u.exec(line);
    if (match) {
      current = match[1];
      fields.set(current, match[2]);
    }
  }
  return fields;
}

const relationNames = (value) =>
  (value ?? "")
    .split(/[,|]/u)
    .map((relation) => relation.trim().split(/[\s(]/u)[0])
    .filter(Boolean);

export function inspectDebMetadata(fields, { arch, version }) {
  const expected = {
    Package: "omxterm",
    Version: systemPackageVersion(version),
    Architecture: packageArchitectures.deb[packagedArchitecture(arch)],
  };
  for (const [field, value] of Object.entries(expected))
    if (fields.get(field) !== value)
      throw new Error(
        `DEB ${field} is ${fields.get(field) ?? "missing"}, expected ${value}`,
      );
  if (!relationNames(fields.get("Depends")).includes("fontconfig"))
    throw new Error("DEB does not depend on fontconfig");
  if (!relationNames(fields.get("Recommends")).includes("openssh-client"))
    throw new Error("DEB does not recommend openssh-client");
}

export function inspectRpmMetadata(metadata, { arch, version }) {
  const expected = {
    name: "omxterm",
    version: systemPackageVersion(version),
    arch: packageArchitectures.rpm[packagedArchitecture(arch)],
  };
  for (const [field, value] of Object.entries(expected))
    if (metadata[field] !== value)
      throw new Error(
        `RPM ${field} is ${metadata[field] ?? "missing"}, expected ${value}`,
      );
  if (!metadata.requires.some((line) => line.startsWith("fontconfig")))
    throw new Error("RPM does not require fontconfig");
  if (!metadata.recommends.some((line) => line.startsWith("openssh-clients")))
    throw new Error("RPM does not recommend openssh-clients");
}

// Mode strings as `ls -l` prints them ("-rwsr-xr-x path"): no setuid or
// setgid entry may ship, including Electron's chrome-sandbox (ADR 0024).
export function inspectPrivilegedModes(listing) {
  return listing
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => /^.{3}[sS]|^.{6}[sS]/u.test(line));
}

export function inspectMaintainerScripts(scripts) {
  if (!scripts.includes("OMXTerm disables the Chromium sandbox on Linux"))
    throw new Error("Package does not use the reviewed OMXTerm install script");
  const commands = scripts
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("#"))
    .join("\n");
  const privileged = [
    "4755",
    "u+s",
    "update-alternatives",
    "apparmor_parser",
  ].filter((marker) => commands.includes(marker));
  if (privileged.length > 0)
    throw new Error(
      `Package scripts change system security policy: ${privileged.join(", ")}`,
    );
}

export function inspectDesktopEntry(contents) {
  const lines = contents.split("\n");
  const required = [
    "Name=OMXTerm",
    `Exec=${installRoot}/omxterm --no-sandbox %U`,
    "Icon=omxterm",
    "StartupWMClass=omxterm",
    "Categories=Utility;TerminalEmulator;",
  ];
  const missing = required.filter((line) => !lines.includes(line));
  if (missing.length > 0)
    throw new Error(`Desktop entry is missing: ${missing.join(", ")}`);
}

// Only the application directory, launcher, desktop entry and icon ship.
export function inspectSystemPackageFiles(files) {
  return files.filter(
    (file) =>
      !file.startsWith(`${installRoot}/`) &&
      ![
        "/usr/bin/omxterm",
        desktopEntry,
        iconEntry,
        // fpm's generated Debian changelog.
        "/usr/share/doc/omxterm/changelog.gz",
      ].includes(file),
  );
}

async function listFiles(root, directory = root) {
  const files = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...(await listFiles(root, absolute)));
    else
      files.push(`/${path.relative(root, absolute).split(path.sep).join("/")}`);
  }
  return files;
}

const sha256 = async (file) =>
  createHash("sha256")
    .update(await readFile(file))
    .digest("hex");

async function extractDeb(file, workRoot) {
  const members = path.join(workRoot, "members");
  const data = path.join(workRoot, "data");
  const control = path.join(workRoot, "control");
  await Promise.all([mkdir(members), mkdir(data), mkdir(control)]);
  await execFile("ar", ["x", file], { cwd: members });
  const names = await readdir(members);
  const member = (prefix) => {
    const name = names.find((candidate) => candidate.startsWith(prefix));
    if (!name) throw new Error(`DEB has no ${prefix} member`);
    return path.join(members, name);
  };
  await execFile("tar", ["-xf", member("control.tar"), "-C", control]);
  await execFile("tar", ["-xf", member("data.tar"), "-C", data]);
  const { stdout: listing } = await execFile(
    "tar",
    ["-tvf", member("data.tar")],
    { maxBuffer: 16 * 1024 * 1024 },
  );
  const scripts = await Promise.all(
    ["postinst", "postrm"].map((name) =>
      readFile(path.join(control, name), "utf8"),
    ),
  );
  return {
    data,
    listing,
    scripts: scripts.join("\n"),
    metadata: parseDebControl(
      await readFile(path.join(control, "control"), "utf8"),
    ),
  };
}

function extractCpio(file, destination) {
  return new Promise((resolve, reject) => {
    const source = spawn("rpm2cpio", [file], {
      stdio: ["ignore", "pipe", "inherit"],
    });
    const sink = spawn("cpio", ["-idm", "--quiet", "--no-absolute-filenames"], {
      cwd: destination,
      stdio: ["pipe", "ignore", "inherit"],
    });
    source.stdout.pipe(sink.stdin);
    let pending = 2;
    const done = (name) => (code) => {
      if (code !== 0) reject(new Error(`${name} exited with status ${code}`));
      else if (--pending === 0) resolve();
    };
    source.on("error", reject);
    sink.on("error", reject);
    source.on("close", done("rpm2cpio"));
    sink.on("close", done("cpio"));
  });
}

async function extractRpm(file, workRoot) {
  const data = path.join(workRoot, "data");
  await mkdir(data);
  await extractCpio(file, data);
  const query = async (...args) =>
    (
      await execFile("rpm", ["-qp", ...args, file], {
        maxBuffer: 16 * 1024 * 1024,
      })
    ).stdout;
  const [name, version, arch] = (
    await query("--qf", "%{NAME}\\n%{VERSION}\\n%{ARCH}\\n")
  ).split("\n");
  const lines = (text) => text.split("\n").filter(Boolean);
  return {
    data,
    listing: await query("--qf", "[%{FILEMODES:perms} %{FILENAMES}\\n]"),
    scripts: await query("--scripts"),
    metadata: {
      name,
      version,
      arch,
      requires: lines(await query("--requires")),
      recommends: lines(await query("--recommends")),
    },
  };
}

async function verifyPayload(data, { arch, version, unpackedRoot }) {
  const files = await listFiles(data);
  const unexpected = inspectSystemPackageFiles(files);
  if (unexpected.length > 0)
    throw new Error(
      `Package installs unexpected files: ${unexpected.join(", ")}`,
    );
  const forbidden = inspectForbiddenPackagedEntries(files);
  if (forbidden.length > 0)
    throw new Error(
      `Development/private-looking files were packaged: ${forbidden.join(", ")}`,
    );
  await verifyLinuxNativeTree(data, arch);

  const at = (entry) => path.join(data, ...entry.split("/"));
  const launcher = at("/usr/bin/omxterm");
  if (!(await lstat(launcher)).isFile())
    throw new Error("/usr/bin/omxterm is not a regular launcher file");
  await assertSameFile(launcherSource, launcher);
  inspectDesktopEntry(await readFile(at(desktopEntry), "utf8"));
  const icon = path.join(projectRoot, "assets", "application-icon.png");
  await assertSameFile(icon, at(iconEntry));

  const application = at(installRoot);
  const resources = path.join(application, "resources");
  const asar = path.join(resources, "app.asar");
  const pty = path.join(
    resources,
    "app.asar.unpacked",
    "node_modules",
    "node-pty",
    "build",
    "Release",
    "pty.node",
  );
  for (const [file, label] of [
    [path.join(application, "omxterm"), "OMXTerm executable"],
    [pty, "node-pty module"],
  ]) {
    const kind = nativeBinaryKind(await readFile(file));
    if (kind !== `elf-${arch}`)
      throw new Error(`${label} is not an ${arch} ELF (${kind})`);
  }
  const asarInspection = inspectAsarEntries(
    await listPackage(asar),
    "linux",
    arch,
  );
  if (asarInspection.missing.length > 0 || asarInspection.forbidden.length > 0)
    throw new Error(
      `Packaged app.asar is invalid: missing ${asarInspection.missing.join(", ") || "none"}; forbidden ${asarInspection.forbidden.join(", ") || "none"}`,
    );
  const packaged = JSON.parse(
    extractFile(asar, "package.json").toString("utf8"),
  );
  if (packaged.version !== version)
    throw new Error(
      `Packaged version ${packaged.version} differs from source ${version}`,
    );
  await verifyLicenseResources(resources);
  await assertSameFile(icon, path.join(resources, "application-icon.png"));
  await assertNoUpdateMetadata(resources);
  // DEB and RPM must carry the exact runtime the AppImage was built from.
  for (const [file, label] of [
    [asar, "app.asar"],
    [pty, "node-pty module"],
  ]) {
    const relative = path.relative(application, file);
    if (
      (await sha256(file)) !== (await sha256(path.join(unpackedRoot, relative)))
    )
      throw new Error(
        `Packaged ${label} differs from the AppImage application`,
      );
  }
}

export async function verifyLinuxSystemPackage(format, packagePath, options) {
  // Extraction tools run in a scratch directory.
  const file = path.resolve(packagePath);
  const workRoot = await mkdtemp(path.join(tmpdir(), `omxterm-${format}-`));
  try {
    const extracted =
      format === "deb"
        ? await extractDeb(file, workRoot)
        : await extractRpm(file, workRoot);
    if (format === "deb") inspectDebMetadata(extracted.metadata, options);
    else inspectRpmMetadata(extracted.metadata, options);
    const privileged = inspectPrivilegedModes(extracted.listing);
    if (privileged.length > 0)
      throw new Error(
        `Package ships setuid/setgid files: ${privileged.join(", ")}`,
      );
    inspectMaintainerScripts(extracted.scripts);
    await verifyPayload(extracted.data, {
      ...options,
      unpackedRoot: path.resolve(options.unpackedRoot),
    });
  } finally {
    await rm(workRoot, { recursive: true, force: true });
  }
}

export async function verifyLinuxSystemPackages({
  releaseRoot = path.join(projectRoot, "release"),
  arch = process.arch,
} = {}) {
  const version = await sourceVersion();
  const unpackedRoot = path.join(
    releaseRoot,
    unpackedDirectoryName("linux", packagedArchitecture(arch)),
  );
  const verified = [];
  for (const format of ["deb", "rpm"]) {
    const file = path.join(
      releaseRoot,
      linuxArtifactName(version, arch, format),
    );
    await verifyChecksum(file);
    await verifyLinuxSystemPackage(format, file, {
      arch,
      version,
      unpackedRoot,
    });
    verified.push(path.basename(file));
  }
  return verified;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  verifyLinuxSystemPackages()
    .then((verified) => {
      for (const file of verified)
        console.log(`Verified Linux system package contents: ${file}`);
    })
    .catch((cause) => {
      console.error(cause instanceof Error ? cause.message : cause);
      process.exitCode = 1;
    });
}
