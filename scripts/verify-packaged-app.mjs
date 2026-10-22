import { extractFile, listPackage } from "@electron/asar";
import { execFile as execFileCallback, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
  open,
  readFile,
  readdir,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir, userInfo } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";
import { linuxAppImageName, linuxHelperName } from "./package-linux-assets.mjs";
import { verifyExactWindowsInstaller } from "./windows-installer-transaction.mjs";
import { windowsVerificationOptions } from "./windows-verification-options.mjs";
import { inspectLinuxAppRun } from "./verify-linux-launcher.mjs";

const execFile = promisify(execFileCallback);
const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

// Packages are built and verified on their own architecture only: native
// modules are never cross-compiled, so the host architecture is the target.
const supportedArchitectures = ["arm64", "x64"];

export function packagedArchitecture(arch = process.arch) {
  if (!supportedArchitectures.includes(arch))
    throw new Error(`Packaged applications require arm64 or x64, not ${arch}`);
  return arch;
}

// electron-builder omits the suffix for its default (x64) architecture.
export function unpackedDirectoryName(platform, arch) {
  const prefix = { darwin: "mac", linux: "linux", win32: "win" }[platform];
  if (!prefix) throw new Error(`Unsupported packaged platform: ${platform}`);
  const suffix = packagedArchitecture(arch) === "x64" ? "" : `-${arch}`;
  return platform === "darwin"
    ? `${prefix}${suffix}`
    : `${prefix}${suffix}-unpacked`;
}
const applicationIconPath = path.join(
  projectRoot,
  "assets",
  "application-icon.icns",
);

const requiredIcnsRepresentations = [
  { name: "icon_16x16.png", width: 16, height: 16 },
  { name: "icon_16x16@2x.png", width: 32, height: 32 },
  { name: "icon_32x32.png", width: 32, height: 32 },
  { name: "icon_32x32@2x.png", width: 64, height: 64 },
  { name: "icon_128x128.png", width: 128, height: 128 },
  { name: "icon_128x128@2x.png", width: 256, height: 256 },
  { name: "icon_256x256.png", width: 256, height: 256 },
  { name: "icon_256x256@2x.png", width: 512, height: 512 },
  { name: "icon_512x512.png", width: 512, height: 512 },
  { name: "icon_512x512@2x.png", width: 1024, height: 1024 },
];

const requiredAsarEntries = [
  "/dist/main/index.js",
  "/dist/preload/index.cjs",
  "/dist/renderer/index.css",
  "/dist/renderer/index.html",
  "/dist/renderer/index.js",
  "/node_modules/node-pty/lib/index.js",
  "/package.json",
];

const macBlurEntry = "/dist/main/macos-window-blur.node";

const forbiddenEntryPatterns = [
  /(^|\/)\.(?:env|git|npmrc)(?:\.|\/|$)/iu,
  /(^|\/)(?:src|test|tests|scripts|typings)(?:\/|$)/iu,
  /(?:^|\/)node_modules\/(?:node-addon-api|node-api-headers)(?:\/|$)/iu,
  /(?:^|\/)node_modules\/node-pty\/deps(?:\/|$)/iu,
  /\.(?:map|pem|p12|key)$/iu,
  /\.test\.js$/iu,
  /(?:credential|private[_-]?key|session[_-]?transcript)/iu,
];

export function inspectForbiddenPackagedEntries(entries) {
  return entries
    .map((entry) => (entry.startsWith("/") ? entry : `/${entry}`))
    .filter((entry) =>
      forbiddenEntryPatterns.some((pattern) => pattern.test(entry)),
    );
}

const allowedLinuxNodePtyBuildEntries = new Set([
  "/node_modules/node-pty/build",
  "/node_modules/node-pty/build/Release",
  "/node_modules/node-pty/build/Release/pty.node",
]);

export function inspectAsarEntries(
  entries,
  platform = "darwin",
  arch = "arm64",
) {
  if (platform !== "darwin" && platform !== "linux" && platform !== "win32")
    throw new Error(`Unsupported packaged platform: ${platform}`);
  packagedArchitecture(arch);
  const prebuild = `/node_modules/node-pty/prebuilds/${platform}-${arch}`;
  // @electron/asar lists entries with the host separator on Windows.
  const normalized = entries
    .map((entry) => entry.split("\\").join("/"))
    .map((entry) => (entry.startsWith("/") ? entry : `/${entry}`));
  const required = [
    ...requiredAsarEntries,
    ...(platform === "darwin" ? [macBlurEntry] : []),
  ];
  const missing = required.filter((entry) => !normalized.includes(entry));
  const privateLooking = new Set(inspectForbiddenPackagedEntries(normalized));
  const forbidden = normalized.filter(
    (entry) =>
      privateLooking.has(entry) ||
      (platform !== "darwin" && entry === macBlurEntry) ||
      entry.includes("/node_modules/@xterm/") ||
      (platform === "linux" &&
        entry.includes("/node_modules/node-pty/prebuilds/")) ||
      (platform === "linux" &&
        entry.startsWith("/node_modules/node-pty/build") &&
        !allowedLinuxNodePtyBuildEntries.has(entry)) ||
      (platform === "darwin" &&
        entry.includes("/node_modules/node-pty/build/")) ||
      (platform === "darwin" &&
        entry.includes("/node_modules/node-pty/prebuilds/") &&
        entry !== prebuild &&
        !entry.startsWith(`${prebuild}/`)) ||
      (platform === "win32" &&
        entry.includes("/node_modules/node-pty/build/")) ||
      (platform === "win32" && entry.endsWith(".pdb")) ||
      (platform === "win32" &&
        entry.includes("/node_modules/node-pty/prebuilds/") &&
        entry !== prebuild &&
        !entry.startsWith(`${prebuild}/`)),
  );
  return { missing, forbidden };
}

export function inspectIcnsRepresentations(representations) {
  const actualByName = new Map(
    representations.map((representation) => [
      representation.name,
      representation,
    ]),
  );
  return {
    missing: requiredIcnsRepresentations
      .filter((required) => !actualByName.has(required.name))
      .map((required) => required.name),
    wrongDimensions: requiredIcnsRepresentations.flatMap((required) => {
      const actual = actualByName.get(required.name);
      if (
        !actual ||
        (actual.width === required.width && actual.height === required.height)
      )
        return [];
      return [
        `${required.name} (expected ${required.width}x${required.height}, got ${actual.width}x${actual.height})`,
      ];
    }),
  };
}

async function readPngRepresentation(file) {
  const data = await readFile(file);
  if (
    data.length < 24 ||
    data.subarray(0, 8).toString("hex") !== "89504e470d0a1a0a" ||
    data.subarray(12, 16).toString("ascii") !== "IHDR"
  )
    throw new Error(`ICNS representation is not a PNG: ${path.basename(file)}`);
  return {
    name: path.basename(file),
    width: data.readUInt32BE(16),
    height: data.readUInt32BE(20),
  };
}

async function sha256(file) {
  return createHash("sha256")
    .update(await readFile(file))
    .digest("hex");
}

export function inspectChecksumRecord(contents, filename, digest) {
  const expected = `${digest}  ${filename}\n`;
  if (contents !== expected)
    throw new Error(
      `Checksum record does not identify exact asset ${filename}`,
    );
}

export async function verifyChecksum(file) {
  const checksum = `${file}.sha256`;
  inspectChecksumRecord(
    await readFile(checksum, "utf8"),
    path.basename(file),
    await sha256(file),
  );
}

// OMXTerm has no automatic updates; Linux packages carry no updater metadata.
export async function assertNoUpdateMetadata(resources) {
  for (const name of ["app-update.yml", "package-type"]) {
    try {
      await stat(path.join(resources, name));
    } catch (cause) {
      if (cause?.code === "ENOENT") continue;
      throw cause;
    }
    throw new Error(`Packaged automatic-update metadata found: ${name}`);
  }
}

export async function assertSameFile(source, packaged) {
  await stat(packaged);
  if ((await sha256(source)) !== (await sha256(packaged)))
    throw new Error(
      `Packaged asset differs from ${path.relative(projectRoot, source)}`,
    );
}

// Windows has no `file` command; the PE COFF header states the machine
// type directly (IMAGE_FILE_MACHINE_ARM64 = 0xAA64, AMD64 = 0x8664).
const peMachines = { arm64: 0xaa64, x64: 0x8664 };
// ELF e_machine values (EM_AARCH64 = 183, EM_X86_64 = 62).
const elfMachines = { arm64: 183, x64: 62 };

function peMachine(data) {
  if (data.length < 0x40 || data.readUInt16LE(0) !== 0x5a4d) return undefined;
  const peOffset = data.readUInt32LE(0x3c);
  if (data.length < peOffset + 6 || data.readUInt32LE(peOffset) !== 0x00004550)
    return undefined;
  return data.readUInt16LE(peOffset + 4);
}

async function readPeMachine(file) {
  const data = await readFile(file);
  if (data.length < 0x40 || data.readUInt16LE(0) !== 0x5a4d)
    throw new Error(`${file} is not a PE executable`);
  const machine = peMachine(data);
  if (machine === undefined) throw new Error(`${file} has no PE signature`);
  return machine;
}

export function inspectPeMachine(machine, label, arch) {
  if (machine !== peMachines[packagedArchitecture(arch)])
    throw new Error(
      `${label} is not an ${arch}-only PE: machine 0x${machine.toString(16)}`,
    );
}

// `file -b` descriptions, without the inspected path that could itself name
// an architecture.
export function inspectArchitectureDescription(
  description,
  label,
  platform,
  arch,
) {
  packagedArchitecture(arch);
  const [expected, other] =
    platform === "darwin"
      ? arch === "arm64"
        ? ["arm64", "x86_64"]
        : ["x86_64", "arm64"]
      : arch === "arm64"
        ? ["ARM aarch64", "x86-64"]
        : ["x86-64", "aarch64"];
  if (!description.includes(expected) || description.includes(other))
    throw new Error(
      `${label} is not an ${arch}-only ${platform === "darwin" ? "Mach-O" : "ELF"}: ${description.trim()}`,
    );
}

// Classifies a file's leading bytes: an ELF machine, or a foreign executable
// format that a Linux package must never carry.
export function nativeBinaryKind(header) {
  if (header.length >= 20 && header.readUInt32BE(0) === 0x7f454c46) {
    const machine =
      header[5] === 2 ? header.readUInt16BE(18) : header.readUInt16LE(18);
    const arch = Object.keys(elfMachines).find(
      (name) => elfMachines[name] === machine,
    );
    return arch ? `elf-${arch}` : `elf-machine-${machine}`;
  }
  if (
    header.length >= 4 &&
    [0xfeedfacf, 0xcffaedfe, 0xfeedface, 0xcefaedfe, 0xcafebabe].includes(
      header.readUInt32BE(0),
    )
  )
    return "mach-o";
  if (peMachine(header) !== undefined) return "pe";
  return undefined;
}

export function inspectLinuxNativeBinaries(binaries, arch) {
  const expected = `elf-${packagedArchitecture(arch)}`;
  return binaries
    .filter(({ kind }) => kind !== undefined && kind !== expected)
    .map(({ entry, kind }) => `${entry} (${kind})`);
}

// Every native file in a Linux package must be an ELF for the target
// architecture: no other architecture's prebuilds or foreign formats.
export async function verifyLinuxNativeTree(root, arch) {
  const binaries = [];
  for (const entry of await listTreeEntries(root)) {
    const file = path.join(root, ...entry.split("/"));
    if (!(await stat(file)).isFile()) continue;
    const handle = await open(file, "r");
    try {
      const header = Buffer.alloc(4096);
      const { bytesRead } = await handle.read(header, 0, header.length, 0);
      binaries.push({
        entry,
        kind: nativeBinaryKind(header.subarray(0, bytesRead)),
      });
    } finally {
      await handle.close();
    }
  }
  const problems = inspectLinuxNativeBinaries(binaries, arch);
  if (problems.length > 0)
    throw new Error(
      `Linux package carries non-${arch} native files: ${problems.join(", ")}`,
    );
  if (!binaries.some(({ kind }) => kind === `elf-${arch}`))
    throw new Error(`Linux package carries no ${arch} ELF files`);
}

export function inspectElfDynamicDependencies(dynamicSection) {
  const dependencies = [
    ...dynamicSection.matchAll(/\(NEEDED\).*\[([^\]]+)\]/gu),
  ].map((match) => match[1]);
  if (dependencies.includes("libz.so"))
    throw new Error(
      "AppImage runtime depends on development-only unversioned libz.so",
    );
  return dependencies;
}

async function inspectLinuxAppImageDependencies(appImagePath) {
  const { stdout } = await execFile("readelf", ["--dynamic", appImagePath]);
  inspectElfDynamicDependencies(stdout);
}

async function inspectArchitecture(file, label, platform, arch) {
  if (platform === "win32") {
    inspectPeMachine(await readPeMachine(file), label, arch);
    return;
  }
  const { stdout } = await execFile("file", ["-b", file]);
  inspectArchitectureDescription(stdout, label, platform, arch);
}

export async function inspectAdHocApplication(
  applicationPath,
  execute = execFile,
) {
  await execute("codesign", [
    "--verify",
    "--deep",
    "--strict",
    "--verbose=4",
    applicationPath,
  ]);

  const { stderr } = await execute("codesign", [
    "-dv",
    "--verbose=4",
    applicationPath,
  ]);
  if (
    !/^Signature=adhoc$/mu.test(stderr) ||
    /^Authority=/mu.test(stderr) ||
    /TeamIdentifier=(?!not set)/u.test(stderr)
  )
    throw new Error(
      "Packaged application unexpectedly has a signing authority",
    );
}

async function inspectApplicationIcon(applicationPath) {
  const resources = path.join(applicationPath, "Contents", "Resources");
  const infoPlist = path.join(applicationPath, "Contents", "Info.plist");
  const { stdout } = await execFile("plutil", [
    "-extract",
    "CFBundleIconFile",
    "raw",
    "-o",
    "-",
    infoPlist,
  ]);
  const iconName = stdout.trim();
  if (!iconName.endsWith(".icns"))
    throw new Error(
      `Packaged CFBundleIconFile is not an ICNS file: ${iconName}`,
    );

  const packagedIcon = path.join(resources, iconName);
  await assertSameFile(applicationIconPath, packagedIcon);

  const temporaryRoot = await mkdtemp(path.join(tmpdir(), "omxterm-icon-"));
  const iconset = path.join(temporaryRoot, "application-icon.iconset");
  try {
    await execFile("iconutil", ["-c", "iconset", "-o", iconset, packagedIcon]);
    const representations = await Promise.all(
      (await readdir(iconset)).map((name) =>
        readPngRepresentation(path.join(iconset, name)),
      ),
    );
    const inspection = inspectIcnsRepresentations(representations);
    const problems = [
      ...inspection.missing.map((name) => `missing ${name}`),
      ...inspection.wrongDimensions,
    ];
    if (problems.length > 0)
      throw new Error(
        `Packaged application icon representations are invalid: ${problems.join(", ")}`,
      );
  } finally {
    await rm(temporaryRoot, { recursive: true, force: true });
  }
}

export function inspectApplicationVersions({
  sourceVersion,
  packagedVersion,
  bundleVersion,
}) {
  if (packagedVersion !== sourceVersion)
    throw new Error(
      `Packaged app.asar package version ${packagedVersion} differs from source package version ${sourceVersion}`,
    );
  if (bundleVersion !== sourceVersion)
    throw new Error(
      `Packaged CFBundleShortVersionString ${bundleVersion} differs from source package version ${sourceVersion}`,
    );
}

function parsePackageVersion(contents, label) {
  let metadata;
  try {
    metadata = JSON.parse(contents);
  } catch (cause) {
    throw new Error(`${label} is not valid JSON`, { cause });
  }
  if (typeof metadata.version !== "string" || metadata.version.length === 0)
    throw new Error(`${label} does not contain a non-empty version`);
  return metadata.version;
}

export async function sourceVersion() {
  const sourcePackagePath = path.join(projectRoot, "package.json");
  return parsePackageVersion(
    await readFile(sourcePackagePath, "utf8"),
    sourcePackagePath,
  );
}

async function inspectApplicationVersion({
  applicationRoot,
  asar,
  platform,
  arch,
  artifactPath,
}) {
  const expectedVersion = await sourceVersion();
  let packagedPackage;
  try {
    packagedPackage = extractFile(asar, "package.json");
  } catch (cause) {
    throw new Error(`Could not extract package.json from ${asar}`, { cause });
  }
  const packagedVersion = parsePackageVersion(
    packagedPackage.toString("utf8"),
    `${asar}/package.json`,
  );
  if (platform === "darwin") {
    const infoPlist = path.join(applicationRoot, "Contents", "Info.plist");
    const { stdout } = await execFile("plutil", [
      "-extract",
      "CFBundleShortVersionString",
      "raw",
      "-o",
      "-",
      infoPlist,
    ]);
    inspectApplicationVersions({
      sourceVersion: expectedVersion,
      packagedVersion,
      bundleVersion: stdout.trim(),
    });
    return;
  }

  inspectApplicationVersions({
    sourceVersion: expectedVersion,
    packagedVersion,
    bundleVersion: expectedVersion,
  });
  if (platform === "win32") {
    const installer = path.join(
      projectRoot,
      "release",
      `OMXTerm-${expectedVersion}-${arch}.exe`,
    );
    await stat(installer);
    return;
  }
  const expectedName = linuxAppImageName(expectedVersion, arch);
  if (path.basename(artifactPath) !== expectedName)
    throw new Error(
      `Linux artifact filename ${path.basename(artifactPath)} differs from ${expectedName}`,
    );
  const desktopFile = path.join(applicationRoot, "omxterm.desktop");
  const desktopContents = await readFile(desktopFile, "utf8");
  if (!desktopContents.includes(`X-AppImage-Version=${expectedVersion}\n`))
    throw new Error(
      `Packaged AppImage desktop version differs from source package version ${expectedVersion}`,
    );
}

async function defaultApplicationPath(platform, arch) {
  const release = path.join(projectRoot, "release");
  if (platform === "darwin")
    return path.join(
      release,
      unpackedDirectoryName(platform, arch),
      "OMXTerm.app",
    );
  if (platform === "win32")
    return path.join(release, unpackedDirectoryName(platform, arch));
  return path.join(release, linuxAppImageName(await sourceVersion(), arch));
}

async function listTreeEntries(root, directory = root) {
  const entries = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name);
    const relative = `/${path.relative(root, absolute).split(path.sep).join("/")}`;
    entries.push(relative);
    if (entry.isDirectory())
      entries.push(...(await listTreeEntries(root, absolute)));
  }
  return entries;
}

// Release license and notice resources must be the exact source files.
export async function verifyLicenseResources(resources) {
  await Promise.all([
    assertSameFile(
      path.join(projectRoot, "LICENSE"),
      path.join(resources, "LICENSE.txt"),
    ),
    assertSameFile(
      path.join(projectRoot, "THIRD_PARTY_NOTICES.md"),
      path.join(resources, "THIRD_PARTY_NOTICES.md"),
    ),
    assertSameFile(
      path.join(projectRoot, "assets", "fonts", "FiraCode-OFL.txt"),
      path.join(resources, "licenses", "FiraCode-OFL.txt"),
    ),
    assertSameFile(
      path.join(projectRoot, "assets", "fonts", "DejaVu-LICENSE.txt"),
      path.join(resources, "licenses", "DejaVu.txt"),
    ),
    assertSameFile(
      path.join(projectRoot, "assets", "fonts", "JetBrainsMono-OFL.txt"),
      path.join(resources, "licenses", "JetBrainsMono-OFL.txt"),
    ),
    assertSameFile(
      path.join(projectRoot, "assets", "fonts", "NerdFonts-glyphs.txt"),
      path.join(resources, "licenses", "NerdFonts-glyphs.txt"),
    ),
    assertSameFile(
      path.join(
        projectRoot,
        "assets",
        "licenses",
        "xterm-visible-links-MIT.txt",
      ),
      path.join(resources, "licenses", "xterm-visible-links.txt"),
    ),
    assertSameFile(
      path.join(projectRoot, "node_modules", "node-pty", "LICENSE"),
      path.join(resources, "licenses", "node-pty.txt"),
    ),
    assertSameFile(
      path.join(projectRoot, "assets", "licenses", "restty-MIT.txt"),
      path.join(resources, "licenses", "restty.txt"),
    ),
    assertSameFile(
      path.join(projectRoot, "assets", "licenses", "ashyterm-MIT.txt"),
      path.join(resources, "licenses", "ashyterm.txt"),
    ),
    assertSameFile(
      path.join(projectRoot, "assets", "licenses", "text-shaper-MIT.txt"),
      path.join(resources, "licenses", "text-shaper.txt"),
    ),
    assertSameFile(
      path.join(projectRoot, "assets", "licenses", "ghostty-MIT.txt"),
      path.join(resources, "licenses", "ghostty.txt"),
    ),
    stat(path.join(resources, "LICENSE.electron.txt")),
    stat(path.join(resources, "LICENSES.chromium.html")),
  ]);
}

export function signalProcessGroup(processGroupId, signal) {
  try {
    process.kill(-processGroupId, signal);
    return true;
  } catch (cause) {
    if (cause?.code === "ESRCH") return false;
    if (cause?.code === "EPERM") return true;
    throw cause;
  }
}

function processGroupExists(processGroupId) {
  return signalProcessGroup(processGroupId, 0);
}

async function waitForProcessGroupExit(processGroupId, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (processGroupExists(processGroupId)) {
    if (Date.now() >= deadline) return false;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return true;
}

async function stopProcessGroup(child) {
  if (!child.pid) return;
  if (process.platform === "win32") {
    // Windows has no POSIX process groups; taskkill ends the process tree.
    try {
      await execFile("taskkill", ["/pid", String(child.pid), "/T", "/F"]);
    } catch (cause) {
      // taskkill exits 128 when the tree has already gone away.
      if (cause?.code !== 128) throw cause;
    }
    return;
  }
  const processGroupId = child.pid;
  if (!signalProcessGroup(processGroupId, "SIGTERM")) return;
  if (await waitForProcessGroupExit(processGroupId, 2_000)) return;
  if (!signalProcessGroup(processGroupId, "SIGKILL")) return;
  if (!(await waitForProcessGroupExit(processGroupId, 2_000)))
    throw new Error(`Packaged process group ${processGroupId} did not exit`);
}

export async function provisionLinuxHelper(
  helper,
  arguments_,
  installationRoot,
  { timeoutMs = 60_000 } = {},
) {
  let child;
  let timer;
  let stdout = "";
  let stderr = "";
  let stopAttempted = false;
  let interruption;
  let deadlineFailure;
  const signalHandlers = new Map();
  const interrupted = new Promise((_, reject) => {
    for (const signal of ["SIGTERM", "SIGINT", "SIGHUP"]) {
      const handler = () => {
        interruption ??= new Error(
          `Linux helper provisioning interrupted by ${signal}`,
        );
        reject(interruption);
      };
      signalHandlers.set(signal, handler);
      process.on(signal, handler);
    }
  });
  const completed = new Promise((resolve, reject) => {
    child = spawn(helper, arguments_, {
      detached: true,
      env: { ...process.env, HOME: installationRoot, TMPDIR: installationRoot },
      stdio: ["ignore", "pipe", "pipe"],
    });
    child.on("error", reject);
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    for (const [stream, append] of [
      [
        child.stdout,
        (chunk) => {
          stdout += chunk;
        },
      ],
      [
        child.stderr,
        (chunk) => {
          stderr += chunk;
        },
      ],
    ]) {
      stream.on("data", (chunk) => {
        if (stdout.length + stderr.length < 16 * 1024 * 1024) append(chunk);
        else
          reject(
            new Error("Linux helper provisioning output exceeded its limit"),
          );
      });
    }
    child.on("close", (code, signal) => {
      if (code === 0 && signal === null) resolve({ stdout, stderr });
      else
        reject(
          Object.assign(
            new Error(
              `Linux helper failed (exit ${code}, signal ${signal}): ${stderr.trim()}`,
            ),
            { code, signal },
          ),
        );
    });
  });
  // Unlike execFile's timeout, this deadline does not wait indefinitely for
  // close after a signal. Cleanup has its own bounded TERM/KILL verification.
  try {
    const result = await Promise.race([
      completed,
      interrupted,
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          deadlineFailure = new Error(
            "Linux helper provisioning outer deadline exceeded",
          );
          reject(deadlineFailure);
        }, timeoutMs);
      }),
    ]);
    stopAttempted = true;
    await stopProcessGroup(child);
    // Signals and the outer deadline remain failures even when the helper has
    // exited and its one bounded cleanup is already in progress.
    if (interruption) throw interruption;
    if (deadlineFailure) throw deadlineFailure;
    return result;
  } catch (cause) {
    const failures = [cause];
    if (!stopAttempted) {
      try {
        await stopProcessGroup(child);
      } catch (cleanup) {
        failures.push(cleanup);
      }
    }
    for (const failure of [interruption, deadlineFailure]) {
      if (failure && failure !== cause) failures.push(failure);
    }
    // Release Node handles on unconfirmed termination; retain the failure and
    // received diagnostics rather than making arbitrary kernel tasks killable.
    child.stdout?.destroy();
    child.stderr?.destroy();
    child.unref();
    const message = failures
      .map((error) => (error instanceof Error ? error.message : String(error)))
      .join("; ");
    try {
      await writeFile(
        path.join(installationRoot, "helper-provisioning-result.json"),
        JSON.stringify({
          message,
          stdout,
          stderr,
          exitCode: child.exitCode,
          signalCode: child.signalCode,
        }),
      );
    } catch (recording) {
      failures.push(recording);
    }
    throw new AggregateError(
      failures,
      `${message}; helper recovery state retained at ${installationRoot}`,
    );
  } finally {
    clearTimeout(timer);
    for (const [signal, handler] of signalHandlers)
      process.off(signal, handler);
  }
}

export function packagedExplicitCommand(
  platform,
  argumentCanary,
  nodeExecutable = process.execPath,
) {
  if (platform !== "darwin" && platform !== "linux" && platform !== "win32")
    throw new Error(`Unsupported packaged output probe platform: ${platform}`);
  return {
    executable: nodeExecutable,
    arguments: [
      path.join(projectRoot, "test", "fixtures", "packaged-output-probe.mjs"),
      "--literal-option-looking-argument",
      argumentCanary,
    ],
  };
}

async function waitForStartup(logFile, readinessFile, child, stderrText) {
  const deadline = Date.now() + 20_000;
  const requiredEvents = new Set([
    "configuration.validated",
    "application.started",
    "window.opened",
    "pty.control:started",
  ]);

  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null)
      throw new Error(
        `Packaged application exited before startup completed: ${stderrText()}`,
      );
    try {
      const records = (await readFile(logFile, "utf8"))
        .trim()
        .split("\n")
        .filter(Boolean)
        .map((line) => JSON.parse(line));
      for (const record of records) {
        requiredEvents.delete(record.name);
        if (record.name === "pty.control" && record.action === "started")
          requiredEvents.delete("pty.control:started");
      }
      if (requiredEvents.size === 0) {
        await stat(readinessFile);
        return records;
      }
    } catch (cause) {
      if (cause?.code !== "ENOENT") throw cause;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(
    `Timed out waiting for packaged startup events and output proof: ${[...requiredEvents].join(", ")}: ${stderrText()}`,
  );
}

export async function verifyPackagedStartupWithCleanup({
  verify,
  stop,
  removeProfile,
}) {
  const failures = [];
  let result;
  try {
    result = await verify();
  } catch (cause) {
    failures.push(cause);
  }
  let stopped = false;
  try {
    await stop();
    stopped = true;
  } catch (cause) {
    failures.push(cause);
  }
  // An unconfirmed process tree may still use its profile; retain it for diagnosis.
  if (stopped) {
    try {
      await removeProfile();
    } catch (cause) {
      failures.push(cause);
    }
  }
  if (failures.length)
    throw new AggregateError(
      failures,
      `Packaged startup or cleanup failed: ${failures.map((error) => (error instanceof Error ? error.message : String(error))).join("; ")}`,
    );
  return result;
}

export const staticOnlyFlag = "--static-only";
export const softwareGlFlag = "--software-gl";

// --static-only checks package contents without launching the application
// (for CI runners without a usable desktop); it authorizes nothing else.
// --software-gl launches Linux packages with Mesa's software renderer and
// Chromium's GPU blocklist ignored, the installer's compatibility mode (ADR
// 0031), for runners with a virtual X server but no GPU. It proves packaged
// startup, not GPU rendering, and the result says so.
export function packageVerificationOptions(args, platform = process.platform) {
  const count = (flag) => args.filter((argument) => argument === flag).length;
  if (count(staticOnlyFlag) > 1 || count(softwareGlFlag) > 1)
    throw new Error("Unknown or duplicate package verification option");
  const staticOnly = count(staticOnlyFlag) === 1;
  const softwareGl = count(softwareGlFlag) === 1;
  if (softwareGl && (platform !== "linux" || staticOnly))
    throw new Error("Software GL applies only to a Linux startup verification");
  const options = windowsVerificationOptions(
    args.filter(
      (argument) => argument !== staticOnlyFlag && argument !== softwareGlFlag,
    ),
    platform,
  );
  if (staticOnly && (options.disposableVm || options.windowsUnpackedOnly))
    throw new Error(
      "Static-only verification cannot be combined with Windows launch options",
    );
  return { ...options, staticOnly, softwareGl };
}

export async function verifyPackagedApplication(
  applicationPath,
  {
    windowsUnpackedOnly = false,
    disposableVm = false,
    staticOnly = false,
    softwareGl = false,
  } = {},
) {
  if (
    (process.platform !== "darwin" &&
      process.platform !== "linux" &&
      process.platform !== "win32") ||
    !supportedArchitectures.includes(process.arch)
  )
    throw new Error(
      "Packaged startup verification requires arm64 or x64 macOS, Linux, or Windows",
    );

  const platform = process.platform;
  const arch = process.arch;
  const packagedPath = path.resolve(
    applicationPath ?? (await defaultApplicationPath(platform, arch)),
  );
  let extractionRoot;
  let linuxInstallationRoot;
  let linuxInstalledApp;
  let linuxProvisioningComplete = false;
  let linuxDirectLaunchAvailable = false;
  let applicationRoot = packagedPath;

  try {
    if (platform === "linux") {
      const version = await sourceVersion();
      const helper = path.join(projectRoot, "release", linuxHelperName());
      await Promise.all([verifyChecksum(packagedPath), verifyChecksum(helper)]);
      linuxInstallationRoot = await mkdtemp(
        path.join(tmpdir(), "omxterm-helper-installation-"),
      );
      const provisioningDeadline = Date.now() + 60_000;
      const { stdout: helperVersion } = await provisionLinuxHelper(
        helper,
        ["--version"],
        linuxInstallationRoot,
      );
      if (helperVersion.trim() !== version)
        throw new Error(
          `Linux helper version ${helperVersion.trim()} differs from source package version ${version}`,
        );
      await provisionLinuxHelper(
        helper,
        ["install", packagedPath],
        linuxInstallationRoot,
        {
          timeoutMs: Math.max(1, provisioningDeadline - Date.now()),
        },
      );
      linuxProvisioningComplete = true;
      linuxInstalledApp = path.join(
        linuxInstallationRoot,
        ".local",
        "opt",
        "omxterm",
        "OMXTerm.AppImage",
      );
      const installedDesktop = await readFile(
        path.join(
          linuxInstallationRoot,
          ".local",
          "share",
          "applications",
          "omxterm.desktop",
        ),
        "utf8",
      );
      const installedIcon = path.join(
        linuxInstallationRoot,
        ".local",
        "share",
        "icons",
        "hicolor",
        "1024x1024",
        "apps",
        "omxterm.png",
      );
      if (!installedDesktop.includes(`Icon=${installedIcon}\n`))
        throw new Error(
          "Linux helper desktop entry does not use the installed icon path",
        );
      linuxDirectLaunchAvailable = !installedDesktop.includes(
        " --appimage-extract-and-run ",
      );
      await inspectArchitecture(
        linuxInstalledApp,
        "installed AppImage",
        platform,
        arch,
      );
      await inspectArchitecture(packagedPath, "AppImage", platform, arch);
      await inspectLinuxAppImageDependencies(packagedPath);
      const { stdout: signature } = await execFile(packagedPath, [
        "--appimage-signature",
      ]);
      if (signature.trim().length > 0)
        throw new Error("AppImage unexpectedly contains an embedded signature");
      extractionRoot = await mkdtemp(
        path.join(tmpdir(), "omxterm-appimage-inspection-"),
      );
      await execFile(packagedPath, ["--appimage-extract"], {
        cwd: extractionRoot,
        maxBuffer: 16 * 1024 * 1024,
      });
      applicationRoot = path.join(extractionRoot, "squashfs-root");
      inspectLinuxAppRun(await readFile(path.join(applicationRoot, "AppRun")));
      const forbidden = inspectForbiddenPackagedEntries(
        await listTreeEntries(applicationRoot),
      );
      if (forbidden.length > 0)
        throw new Error(
          `Development/private-looking files were packaged outside app.asar: ${forbidden.join(", ")}`,
        );
      await verifyLinuxNativeTree(applicationRoot, arch);
      await assertNoUpdateMetadata(path.join(applicationRoot, "resources"));
    }

    if (
      platform === "win32" &&
      inspectForbiddenPackagedEntries(await listTreeEntries(applicationRoot))
        .length > 0
    )
      throw new Error(
        "Development/private-looking files were packaged outside app.asar",
      );

    const resources =
      platform === "darwin"
        ? path.join(applicationRoot, "Contents", "Resources")
        : path.join(applicationRoot, "resources");
    const executable =
      platform === "darwin"
        ? path.join(applicationRoot, "Contents", "MacOS", "OMXTerm")
        : platform === "win32"
          ? path.join(applicationRoot, "OMXTerm.exe")
          : path.join(applicationRoot, "omxterm");
    const asar = path.join(resources, "app.asar");
    const nativeRoot = path.join(
      resources,
      "app.asar.unpacked",
      "node_modules",
      "node-pty",
      ...(platform === "linux"
        ? ["build", "Release"]
        : ["prebuilds", `${platform}-${arch}`]),
    );

    await inspectArchitecture(executable, "OMXTerm executable", platform, arch);
    await inspectArchitecture(
      path.join(nativeRoot, "pty.node"),
      "node-pty module",
      platform,
      arch,
    );
    if (platform === "win32")
      await inspectArchitecture(
        path.join(nativeRoot, "conpty.node"),
        "node-pty ConPTY module",
        platform,
        arch,
      );
    if (platform === "darwin") {
      const blurModule = path.join(
        resources,
        "app.asar.unpacked",
        macBlurEntry,
      );
      await inspectArchitecture(
        blurModule,
        "macOS blur module",
        platform,
        arch,
      );
      const { stdout: loadCommands } = await execFile("otool", [
        "-l",
        blurModule,
      ]);
      if (!/\bminos 12\.0\b/u.test(loadCommands))
        throw new Error(
          "macOS blur module must target the Electron macOS 12.0 floor",
        );
      // Exercise the packaged runtime's ESM-relative loader through ASAR, not a
      // development Node process or an ancestor node_modules resolution.
      await execFile(
        executable,
        [
          "--input-type=module",
          "-e",
          `
        import { createRequire } from 'node:module';
        import assert from 'node:assert/strict';
        const native = createRequire(${JSON.stringify(path.join(asar, "dist/main/index.js"))})('./macos-window-blur.node');
        assert.deepEqual(Object.keys(native), ['setBlur']);
        assert.throws(() => native.setBlur(Buffer.alloc(8, 1), true), /owned|main thread/u);
      `,
        ],
        { env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" }, timeout: 10_000 },
      );
      await inspectArchitecture(
        path.join(nativeRoot, "spawn-helper"),
        "node-pty spawn helper",
        platform,
        arch,
      );
      await inspectApplicationIcon(applicationRoot);
      await inspectAdHocApplication(applicationRoot);
    } else {
      if (platform === "linux")
        await assertSameFile(
          path.join(projectRoot, "assets", "application-icon.png"),
          path.join(
            applicationRoot,
            "usr",
            "share",
            "icons",
            "hicolor",
            "1024x1024",
            "apps",
            "omxterm.png",
          ),
        );
      // Linux Terminal Windows resolve their icon from resources (a
      // directly-run AppImage has no registered desktop entry to supply one).
      // The same extra resource ships on Windows, where the window icon
      // itself comes from the executable.
      await assertSameFile(
        path.join(projectRoot, "assets", "application-icon.png"),
        path.join(resources, "application-icon.png"),
      );
    }
    await inspectApplicationVersion({
      applicationRoot,
      asar,
      platform,
      arch,
      artifactPath: packagedPath,
    });

    const asarInspection = inspectAsarEntries(
      await listPackage(asar),
      platform,
      arch,
    );
    if (asarInspection.missing.length > 0)
      throw new Error(
        `Packaged runtime assets are missing: ${asarInspection.missing.join(", ")}`,
      );
    if (asarInspection.forbidden.length > 0)
      throw new Error(
        `Development/private-looking files were packaged: ${asarInspection.forbidden.join(", ")}`,
      );

    await verifyLicenseResources(resources);
    try {
      await stat(path.join(resources, "default_app.asar"));
      throw new Error("Electron's development default_app.asar was packaged");
    } catch (cause) {
      if (cause?.code !== "ENOENT") throw cause;
    }

    // Static-only verification (CI runners without a usable desktop) stops
    // before any packaged launch and never claims startup evidence.
    const linuxLaunchModes = staticOnly
      ? []
      : platform === "linux"
        ? [
            ...(linuxDirectLaunchAvailable ? [[]] : []),
            ["--appimage-extract-and-run"],
          ]
        : [[]];
    let verifiedRecords = 0;
    for (const runtimeArguments of linuxLaunchModes) {
      const temporaryRoot = await mkdtemp(
        path.join(tmpdir(), "omxterm-packaged-startup-"),
      );
      const configurationRoot = path.join(temporaryRoot, "config");
      const stateRoot = path.join(temporaryRoot, "state");
      const userDataRoot = path.join(temporaryRoot, "electron-user-data");
      const homeRoot = path.join(temporaryRoot, "home");
      await Promise.all([
        mkdir(path.join(configurationRoot, "omxterm"), { recursive: true }),
        mkdir(homeRoot, { recursive: true }),
      ]);
      await writeFile(
        path.join(configurationRoot, "omxterm", "config.json"),
        `${JSON.stringify({ version: 1, confirmClose: false, ...(platform === "darwin" ? { window: { blur: true, transparency: 0.15 } } : {}) })}\n`,
      );
      const canary = `OMXTERM_PACKAGE_SECRET_CANARY_${Date.now()}`;
      const argumentCanary = `OMXTERM_PACKAGE_ARGUMENT_CANARY_${Date.now()}`;
      const readinessFile = path.join(temporaryRoot, "explicit-command-ready");
      const explicitCommand = packagedExplicitCommand(platform, argumentCanary);
      let stderr = "";
      const launchPath = platform === "linux" ? linuxInstalledApp : executable;
      const launchArguments = [
        ...runtimeArguments,
        `--user-data-dir=${userDataRoot}`,
        ...(platform === "linux" ? ["--ozone-platform=x11"] : []),
        ...(softwareGl ? ["--ignore-gpu-blocklist"] : []),
        "-e",
        explicitCommand.executable,
        ...explicitCommand.arguments,
      ];
      // The packaged Linux app relaunches itself onto X11 when Electron seeds
      // a Wayland session backend (ADR 0020), and this harness cannot follow a
      // relaunch. Pin the backend explicitly; default-backend selection is
      // covered by unit tests; this explicit override does not prove native defaults.
      const child = spawn(launchPath, launchArguments, {
        detached: true,
        env: {
          ...process.env,
          HOME: homeRoot,
          XDG_CONFIG_HOME: configurationRoot,
          XDG_STATE_HOME: stateRoot,
          OMXTERM_PACKAGE_SECRET_CANARY: canary,
          OMXTERM_PACKAGE_ARGUMENT_CANARY: argumentCanary,
          OMXTERM_PACKAGE_EXPECTED_HOME: userInfo().homedir,
          OMXTERM_PACKAGE_READINESS_FILE: readinessFile,
          ...(softwareGl ? { LIBGL_ALWAYS_SOFTWARE: "1" } : {}),
        },
        stdio: ["ignore", "ignore", "pipe"],
      });
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk) => {
        if (stderr.length < 16_384) stderr += chunk;
      });

      verifiedRecords += await verifyPackagedStartupWithCleanup({
        async verify() {
          const logFile = path.join(
            stateRoot,
            "omxterm",
            "logs",
            "omxterm.jsonl",
          );
          const records = await waitForStartup(
            logFile,
            readinessFile,
            child,
            () => stderr.trim(),
          );
          const logText = await readFile(logFile, "utf8");
          const diagnostics = `${logText}\n${stderr}`;
          const privateLaunchValues = [
            canary,
            argumentCanary,
            explicitCommand.executable,
            ...explicitCommand.arguments,
          ];
          if (privateLaunchValues.some((value) => diagnostics.includes(value)))
            throw new Error(
              "Packaged startup diagnostics disclosed explicit launch data",
            );
          return records.length;
        },
        stop: () => stopProcessGroup(child),
        // Windows releases the stopped tree's file locks asynchronously.
        removeProfile: () =>
          rm(temporaryRoot, {
            recursive: true,
            force: true,
            maxRetries: 10,
            retryDelay: 200,
          }),
      });
    }
    let installerVerification;
    if (platform === "win32" && !windowsUnpackedOnly && !staticOnly) {
      installerVerification = await verifyExactWindowsInstaller({
        installer: path.join(
          projectRoot,
          "release",
          `OMXTerm-${await sourceVersion()}-${arch}.exe`,
        ),
        unpackedRoot: applicationRoot,
        projectRoot,
        disposableVm,
        verifyInstalled: (installedRoot) =>
          verifyPackagedApplication(installedRoot, {
            windowsUnpackedOnly: true,
          }),
      });
      console.log(
        `Verified exact NSIS payload, installed startup and cleanup: ${JSON.stringify(installerVerification)}`,
      );
    }
    return {
      applicationPath: packagedPath,
      arch,
      records: verifiedRecords,
      verification: staticOnly
        ? `STATIC ONLY (startup${platform === "win32" ? " and exact installer" : ""} NOT verified)`
        : platform === "win32" && windowsUnpackedOnly
          ? "UNPACKED DIAGNOSTIC ONLY (exact installer NOT verified)"
          : softwareGl
            ? "FULL (software GL; GPU rendering NOT verified)"
            : "FULL",
      installerVerification,
    };
  } finally {
    if (extractionRoot)
      await rm(extractionRoot, { recursive: true, force: true });
    if (linuxInstallationRoot && linuxProvisioningComplete)
      await rm(linuxInstallationRoot, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const args = process.argv.slice(2);
  const applicationPath =
    args[0] && !args[0].startsWith("--") ? args.shift() : undefined;
  Promise.resolve()
    .then(async () => {
      const result = await verifyPackagedApplication(
        applicationPath,
        packageVerificationOptions(args),
      );
      console.log(
        `${result.verification}: verified packaged ${result.arch} ${result.records > 0 ? "startup" : "contents"}: ${result.applicationPath} (${result.records} operational events)`,
      );
      // The default Linux release also carries DEB and RPM packages built
      // from the same unpacked application.
      if (process.platform === "linux" && applicationPath === undefined) {
        const { verifyLinuxSystemPackages } =
          await import("./verify-linux-packages.mjs");
        for (const verified of await verifyLinuxSystemPackages())
          console.log(`Verified Linux system package contents: ${verified}`);
      }
    })
    .catch((cause) => {
      console.error(cause instanceof Error ? cause.message : cause);
      process.exitCode = 1;
    });
}
