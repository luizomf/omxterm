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
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { promisify } from "node:util";

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
  if (platform !== "darwin" && platform !== "linux")
    throw new Error(`Unsupported packaged platform: ${platform}`);
  const normalized = entries.map((entry) =>
    entry.startsWith("/") ? entry : `/${entry}`,
  );
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
        !entry.startsWith("/node_modules/node-pty/prebuilds/darwin-arm64/")),
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

async function assertSameFile(source, packaged) {
  await stat(packaged);
  if ((await sha256(source)) !== (await sha256(packaged)))
    throw new Error(
      `Packaged asset differs from ${path.relative(projectRoot, source)}`,
    );
}

async function inspectArchitecture(file, label, platform) {
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

async function inspectUnsignedApplication(applicationPath) {
  try {
    const { stderr } = await execFile("codesign", [
      "-dv",
      "--verbose=4",
      applicationPath,
    ]);
    if (
      /^Authority=/mu.test(stderr) ||
      /TeamIdentifier=(?!not set)/u.test(stderr)
    )
      throw new Error(
        "Packaged application unexpectedly has a signing authority",
      );
  } catch (cause) {
    const stderr = String(cause?.stderr ?? "");
    if (!stderr.includes("code object is not signed at all")) throw cause;
  }
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

function signalProcessGroup(processGroupId, signal) {
  try {
    process.kill(-processGroupId, signal);
    return true;
  } catch (cause) {
    if (cause?.code === "ESRCH") return false;
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
  const processGroupId = child.pid;
  if (!signalProcessGroup(processGroupId, "SIGTERM")) return;
  if (await waitForProcessGroupExit(processGroupId, 2_000)) return;
  if (!signalProcessGroup(processGroupId, "SIGKILL")) return;
  if (!(await waitForProcessGroupExit(processGroupId, 2_000)))
    throw new Error(`Packaged process group ${processGroupId} did not exit`);
}

async function waitForStartup(logFile, child, stderrText) {
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
      if (requiredEvents.size === 0) return records;
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
    (process.platform !== "darwin" && process.platform !== "linux") ||
    process.arch !== "arm64"
  )
    throw new Error(
      "Packaged startup verification requires arm64 macOS or Linux",
    );

  const platform = process.platform;
  const packagedPath = path.resolve(
    applicationPath ?? (await defaultApplicationPath()),
  );
  let extractionRoot;
  let applicationRoot = packagedPath;

  try {
    if (platform === "linux") {
      await inspectArchitecture(packagedPath, "AppImage", platform);
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
        : path.join(applicationRoot, "omxterm");
    const asar = path.join(resources, "app.asar");
    const nativeRoot = path.join(
      resources,
      "app.asar.unpacked",
      "node_modules",
      "node-pty",
      ...(platform === "darwin"
        ? ["prebuilds", "darwin-arm64"]
        : ["build", "Release"]),
    );

    await inspectArchitecture(executable, "OMXTerm executable", platform);
    await inspectArchitecture(
      path.join(nativeRoot, "pty.node"),
      "node-pty module",
      platform,
    );
    if (platform === "darwin") {
      await inspectArchitecture(
        path.join(nativeRoot, "spawn-helper"),
        "node-pty spawn helper",
        platform,
      );
      await inspectApplicationIcon(applicationRoot);
      await inspectUnsignedApplication(applicationRoot);
    } else {
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
    let stderr = "";
    const launchPath = platform === "darwin" ? executable : packagedPath;
    const launchArguments = [`--user-data-dir=${userDataRoot}`];
    // The packaged Linux app relaunches itself onto X11 when Electron seeds
    // a Wayland session backend (ADR 0020), and this harness cannot follow a
    // relaunch. Pin the backend explicitly; default-backend selection is
    // covered by unit tests and the manual exact-artifact checklist.
    if (platform === "linux") launchArguments.push("--ozone-platform=x11");
    const child = spawn(launchPath, launchArguments, {
      detached: true,
      env: {
        ...process.env,
        HOME: homeRoot,
        XDG_CONFIG_HOME: configurationRoot,
        XDG_STATE_HOME: stateRoot,
        OMXTERM_PACKAGE_SECRET_CANARY: canary,
      },
      stdio: ["ignore", "ignore", "pipe"],
    });
    child.stderr.setEncoding("utf8");
    child.stderr.on("data", (chunk) => {
      if (stderr.length < 16_384) stderr += chunk;
    });

    try {
      const logFile = path.join(stateRoot, "omxterm", "logs", "omxterm.jsonl");
      const records = await waitForStartup(logFile, child, () => stderr.trim());
      const logText = await readFile(logFile, "utf8");
      if (logText.includes(canary))
        throw new Error("Operational log persisted an environment canary");
      return { applicationPath: packagedPath, records: records.length };
    } finally {
      await stopProcessGroup(child);
      await rm(temporaryRoot, { recursive: true, force: true });
    }
  } finally {
    if (extractionRoot)
      await rm(extractionRoot, { recursive: true, force: true });
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
