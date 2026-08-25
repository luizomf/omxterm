import { extractFile, listPackage } from "@electron/asar";
import { execFile as execFileCallback, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  mkdir,
  mkdtemp,
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
import { linuxHelperName } from "./package-linux-assets.mjs";

const execFile = promisify(execFileCallback);
const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const defaultMacApplicationPath = path.join(
  projectRoot,
  "release",
  "mac-arm64",
  "OMXTerm.app",
);
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
  "/dist/renderer/fonts/JetBrainsMonoNerdFontMono-Regular.woff2",
  "/dist/renderer/fonts/OFL.txt",
  "/node_modules/@xterm/addon-fit/lib/addon-fit.js",
  "/node_modules/@xterm/addon-web-links/lib/addon-web-links.js",
  "/node_modules/@xterm/xterm/lib/xterm.js",
  "/node_modules/node-pty/lib/index.js",
  "/package.json",
];

const forbiddenEntryPatterns = [
  /(^|\/)\.(?:env|git|npmrc)(?:\.|\/|$)/iu,
  /(^|\/)(?:src|test|tests|scripts|typings)(?:\/|$)/iu,
  /(?:^|\/)node_modules\/node-addon-api(?:\/|$)/iu,
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

export function inspectAsarEntries(entries, platform = "darwin") {
  if (platform !== "darwin" && platform !== "linux" && platform !== "win32")
    throw new Error(`Unsupported packaged platform: ${platform}`);
  // @electron/asar lists entries with the host separator on Windows.
  const normalized = entries
    .map((entry) => entry.split("\\").join("/"))
    .map((entry) => (entry.startsWith("/") ? entry : `/${entry}`));
  const missing = requiredAsarEntries.filter(
    (entry) => !normalized.includes(entry),
  );
  const privateLooking = new Set(inspectForbiddenPackagedEntries(normalized));
  const forbidden = normalized.filter(
    (entry) =>
      privateLooking.has(entry) ||
      (platform === "linux" &&
        entry.includes("/node_modules/node-pty/prebuilds/")) ||
      (platform === "linux" &&
        entry.startsWith("/node_modules/node-pty/build") &&
        !allowedLinuxNodePtyBuildEntries.has(entry)) ||
      (platform === "darwin" &&
        entry.includes("/node_modules/node-pty/build/")) ||
      (platform === "darwin" &&
        entry.includes("/node_modules/node-pty/prebuilds/") &&
        entry !== "/node_modules/node-pty/prebuilds/darwin-arm64" &&
        !entry.startsWith("/node_modules/node-pty/prebuilds/darwin-arm64/")) ||
      (platform === "win32" &&
        entry.includes("/node_modules/node-pty/build/")) ||
      (platform === "win32" && entry.endsWith(".pdb")) ||
      (platform === "win32" &&
        entry.includes("/node_modules/node-pty/prebuilds/") &&
        entry !== "/node_modules/node-pty/prebuilds/win32-arm64" &&
        !entry.startsWith("/node_modules/node-pty/prebuilds/win32-arm64/")),
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

async function verifyChecksum(file) {
  const checksum = `${file}.sha256`;
  inspectChecksumRecord(
    await readFile(checksum, "utf8"),
    path.basename(file),
    await sha256(file),
  );
}

async function assertSameFile(source, packaged) {
  await stat(packaged);
  if ((await sha256(source)) !== (await sha256(packaged)))
    throw new Error(
      `Packaged asset differs from ${path.relative(projectRoot, source)}`,
    );
}

const PE_MACHINE_ARM64 = 0xaa64;

// Windows has no `file` command; the PE COFF header states the machine
// type directly (IMAGE_FILE_MACHINE_ARM64 = 0xAA64).
async function readPeMachine(file) {
  const data = await readFile(file);
  if (data.length < 0x40 || data.readUInt16LE(0) !== 0x5a4d)
    throw new Error(`${file} is not a PE executable`);
  const peOffset = data.readUInt32LE(0x3c);
  if (data.length < peOffset + 6 || data.readUInt32LE(peOffset) !== 0x00004550)
    throw new Error(`${file} has no PE signature`);
  return data.readUInt16LE(peOffset + 4);
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

async function inspectArchitecture(file, label, platform) {
  if (platform === "win32") {
    const machine = await readPeMachine(file);
    if (machine !== PE_MACHINE_ARM64)
      throw new Error(
        `${label} is not an arm64-only PE: machine 0x${machine.toString(16)}`,
      );
    return;
  }
  const { stdout } = await execFile("file", [file]);
  const isArm64 =
    platform === "darwin"
      ? stdout.includes("arm64") && !stdout.includes("x86_64")
      : stdout.includes("ARM aarch64") && !stdout.includes("x86-64");
  if (!isArm64)
    throw new Error(
      `${label} is not an arm64-only ${platform === "darwin" ? "Mach-O" : "ELF"}: ${stdout.trim()}`,
    );
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

async function sourceVersion() {
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
      `OMXTerm-${expectedVersion}-arm64.exe`,
    );
    await stat(installer);
    return;
  }
  const expectedName = `OMXTerm-${expectedVersion}-arm64.AppImage`;
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

async function defaultApplicationPath() {
  if (process.platform === "darwin") return defaultMacApplicationPath;
  if (process.platform === "win32")
    return path.join(projectRoot, "release", "win-arm64-unpacked");
  return path.join(
    projectRoot,
    "release",
    `OMXTerm-${await sourceVersion()}-arm64.AppImage`,
  );
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

// The Windows installer bug this guards against dropped every PE file at
// install time while the unpacked tree stayed intact, so inspecting only the
// unpacked directory missed it. This installs the exact NSIS one-click
// installer into a throwaway directory (its `/D=` never touches the real
// per-user location) and asserts every executable and DLL the unpacked tree
// contains actually lands, then uninstalls to remove its shortcut and
// registry entry.
async function verifyWindowsInstallerExtraction(installer, unpackedRoot) {
  const expectedPeFiles = (await listTreeEntries(unpackedRoot)).filter(
    (entry) => /\.(?:exe|dll|node)$/iu.test(entry),
  );
  const installRoot = await mkdtemp(path.join(tmpdir(), "omxterm-installed-"));
  try {
    await execFile(installer, ["/S", `/D=${installRoot}`]);
    const installedExe = path.join(installRoot, "OMXTerm.exe");
    await stat(installedExe);
    await inspectArchitecture(installedExe, "installed OMXTerm.exe", "win32");
    const missing = [];
    for (const relative of expectedPeFiles) {
      try {
        await stat(path.join(installRoot, ...relative.slice(1).split("/")));
      } catch {
        missing.push(relative);
      }
    }
    if (missing.length > 0)
      throw new Error(
        `Installer did not extract ${missing.length} executable file(s): ${missing.join(", ")}`,
      );
  } finally {
    const uninstaller = path.join(installRoot, "Uninstall OMXTerm.exe");
    try {
      await execFile(uninstaller, ["/S"]);
      // The uninstaller relaunches a copy of itself and returns before that
      // copy finishes clearing installRoot; wait briefly so cleanup succeeds.
      await new Promise((resolve) => setTimeout(resolve, 3_000));
    } catch {
      // A failed uninstall must not mask a real extraction assertion; the
      // throwaway directory is removed next regardless.
    }
    await rm(installRoot, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 200,
    });
  }
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

export function packagedExplicitCommand(
  platform,
  systemRoot = process.env.SystemRoot ?? "C:\\Windows",
) {
  if (platform === "win32")
    return {
      executable: path.win32.join(
        systemRoot,
        "System32",
        "WindowsPowerShell",
        "v1.0",
        "powershell.exe",
      ),
      arguments: [
        "-NoLogo",
        "-NoProfile",
        "-Command",
        "$ok = $PWD.Path -eq $env:OMXTERM_PACKAGE_EXPECTED_HOME -and $env:TERM -eq 'xterm-256color' -and $env:COLORTERM -eq 'truecolor' -and $env:TERM_PROGRAM -eq 'OMXTerm' -and $env:TERM_PROGRAM_VERSION -and $args[0] -eq '--literal-option-looking-argument' -and $args[1] -eq $env:OMXTERM_PACKAGE_ARGUMENT_CANARY; if (-not $ok) { exit 23 }; New-Item -ItemType File -Path $env:OMXTERM_PACKAGE_READINESS_FILE -Force | Out-Null; Start-Sleep -Seconds 30",
        "--literal-option-looking-argument",
      ],
    };

  return {
    executable: "/bin/sh",
    arguments: [
      "-c",
      'test "$PWD" = "$OMXTERM_PACKAGE_EXPECTED_HOME" && test "$TERM" = xterm-256color && test "$COLORTERM" = truecolor && test "$TERM_PROGRAM" = OMXTerm && test -n "$TERM_PROGRAM_VERSION" && test "$1" = --literal-option-looking-argument && test "$2" = "$OMXTERM_PACKAGE_ARGUMENT_CANARY" && : > "$OMXTERM_PACKAGE_READINESS_FILE"; exec sleep 30',
      "omxterm-packaged-verifier",
      "--literal-option-looking-argument",
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
    `Timed out waiting for packaged startup events: ${[...requiredEvents].join(", ")}: ${stderrText()}`,
  );
}

export async function verifyPackagedApplication(applicationPath) {
  if (
    (process.platform !== "darwin" &&
      process.platform !== "linux" &&
      process.platform !== "win32") ||
    process.arch !== "arm64"
  )
    throw new Error(
      "Packaged startup verification requires arm64 macOS, Linux, or Windows",
    );

  const platform = process.platform;
  const packagedPath = path.resolve(
    applicationPath ?? (await defaultApplicationPath()),
  );
  let extractionRoot;
  let linuxInstallationRoot;
  let linuxInstalledApp;
  let linuxDirectLaunchAvailable = false;
  let applicationRoot = packagedPath;

  try {
    if (platform === "linux") {
      const version = await sourceVersion();
      const helper = path.join(
        projectRoot,
        "release",
        linuxHelperName(version),
      );
      await Promise.all([verifyChecksum(packagedPath), verifyChecksum(helper)]);
      const { stdout: helperVersion } = await execFile(helper, ["--version"]);
      if (helperVersion.trim() !== version)
        throw new Error(
          `Linux helper version ${helperVersion.trim()} differs from source package version ${version}`,
        );
      linuxInstallationRoot = await mkdtemp(
        path.join(tmpdir(), "omxterm-helper-installation-"),
      );
      await execFile(helper, ["install", packagedPath], {
        env: { ...process.env, HOME: linuxInstallationRoot },
        maxBuffer: 16 * 1024 * 1024,
      });
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
        " --appimage-extract-and-run %U\n",
      );
      await inspectArchitecture(
        linuxInstalledApp,
        "installed AppImage",
        platform,
      );
      await inspectArchitecture(packagedPath, "AppImage", platform);
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
      const forbidden = inspectForbiddenPackagedEntries(
        await listTreeEntries(applicationRoot),
      );
      if (forbidden.length > 0)
        throw new Error(
          `Development/private-looking files were packaged outside app.asar: ${forbidden.join(", ")}`,
        );
    }

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
      ...(platform === "darwin"
        ? ["prebuilds", "darwin-arm64"]
        : platform === "win32"
          ? ["prebuilds", "win32-arm64"]
          : ["build", "Release"]),
    );

    await inspectArchitecture(executable, "OMXTerm executable", platform);
    await inspectArchitecture(
      path.join(nativeRoot, "pty.node"),
      "node-pty module",
      platform,
    );
    if (platform === "win32")
      await inspectArchitecture(
        path.join(nativeRoot, "conpty.node"),
        "node-pty ConPTY module",
        platform,
      );
    if (platform === "darwin") {
      await inspectArchitecture(
        path.join(nativeRoot, "spawn-helper"),
        "node-pty spawn helper",
        platform,
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
      artifactPath: packagedPath,
    });

    if (platform === "win32") {
      const installer = path.join(
        projectRoot,
        "release",
        `OMXTerm-${await sourceVersion()}-arm64.exe`,
      );
      await verifyWindowsInstallerExtraction(installer, applicationRoot);
    }

    const asarInspection = inspectAsarEntries(
      await listPackage(asar),
      platform,
    );
    if (asarInspection.missing.length > 0)
      throw new Error(
        `Packaged runtime assets are missing: ${asarInspection.missing.join(", ")}`,
      );
    if (asarInspection.forbidden.length > 0)
      throw new Error(
        `Development/private-looking files were packaged: ${asarInspection.forbidden.join(", ")}`,
      );

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
        path.join(projectRoot, "assets", "fonts", "OFL.txt"),
        path.join(resources, "licenses", "JetBrainsMono-OFL.txt"),
      ),
      assertSameFile(
        path.join(projectRoot, "node_modules", "@xterm", "xterm", "LICENSE"),
        path.join(resources, "licenses", "xterm.txt"),
      ),
      assertSameFile(
        path.join(
          projectRoot,
          "node_modules",
          "@xterm",
          "addon-fit",
          "LICENSE",
        ),
        path.join(resources, "licenses", "xterm-addon-fit.txt"),
      ),
      assertSameFile(
        path.join(
          projectRoot,
          "node_modules",
          "@xterm",
          "addon-web-links",
          "LICENSE",
        ),
        path.join(resources, "licenses", "xterm-addon-web-links.txt"),
      ),
      assertSameFile(
        path.join(
          projectRoot,
          "node_modules",
          "@xterm",
          "addon-unicode-graphemes",
          "LICENSE",
        ),
        path.join(resources, "licenses", "xterm-addon-unicode-graphemes.txt"),
      ),
      assertSameFile(
        path.join(projectRoot, "node_modules", "node-pty", "LICENSE"),
        path.join(resources, "licenses", "node-pty.txt"),
      ),
      stat(path.join(resources, "LICENSE.electron.txt")),
      stat(path.join(resources, "LICENSES.chromium.html")),
    ]);
    try {
      await stat(path.join(resources, "default_app.asar"));
      throw new Error("Electron's development default_app.asar was packaged");
    } catch (cause) {
      if (cause?.code !== "ENOENT") throw cause;
    }

    const linuxLaunchModes =
      platform === "linux"
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
        `${JSON.stringify({ version: 1, confirmClose: false })}\n`,
      );
      const canary = `OMXTERM_PACKAGE_SECRET_CANARY_${Date.now()}`;
      const argumentCanary = `OMXTERM_PACKAGE_ARGUMENT_CANARY_${Date.now()}`;
      const readinessFile = path.join(temporaryRoot, "explicit-command-ready");
      const explicitCommand = packagedExplicitCommand(platform);
      let stderr = "";
      const launchPath = platform === "linux" ? linuxInstalledApp : executable;
      const launchArguments = [
        ...runtimeArguments,
        `--user-data-dir=${userDataRoot}`,
        ...(platform === "linux" ? ["--ozone-platform=x11"] : []),
        "-e",
        explicitCommand.executable,
        ...explicitCommand.arguments,
        argumentCanary,
      ];
      // The packaged Linux app relaunches itself onto X11 when Electron seeds
      // a Wayland session backend (ADR 0020), and this harness cannot follow a
      // relaunch. Pin the backend explicitly; default-backend selection is
      // covered by unit tests and the manual exact-artifact checklist.
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
        },
        stdio: ["ignore", "ignore", "pipe"],
      });
      child.stderr.setEncoding("utf8");
      child.stderr.on("data", (chunk) => {
        if (stderr.length < 16_384) stderr += chunk;
      });

      try {
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
        verifiedRecords += records.length;
      } finally {
        await stopProcessGroup(child);
        // Windows releases the stopped tree's file locks asynchronously.
        await rm(temporaryRoot, {
          recursive: true,
          force: true,
          maxRetries: 10,
          retryDelay: 200,
        });
      }
    }
    return { applicationPath: packagedPath, records: verifiedRecords };
  } finally {
    if (extractionRoot)
      await rm(extractionRoot, { recursive: true, force: true });
    if (linuxInstallationRoot)
      await rm(linuxInstallationRoot, { recursive: true, force: true });
  }
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  verifyPackagedApplication(process.argv[2])
    .then(({ applicationPath, records }) => {
      console.log(
        `Verified packaged arm64 startup: ${applicationPath} (${records} operational events)`,
      );
    })
    .catch((cause) => {
      console.error(cause instanceof Error ? cause.message : cause);
      process.exitCode = 1;
    });
}
