import { listPackage } from "@electron/asar";
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
const defaultApplicationPath = path.join(
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
  /(?:^|\/)node_modules\/node-pty\/(?:deps|prebuilds\/(?:darwin-x64|win32-))/iu,
  /\.(?:map|pem|p12|key)$/iu,
  /\.test\.js$/iu,
  /(?:credential|private[_-]?key|session[_-]?transcript)/iu,
];

export function inspectAsarEntries(entries) {
  const normalized = entries.map((entry) =>
    entry.startsWith("/") ? entry : `/${entry}`,
  );
  const missing = requiredAsarEntries.filter(
    (required) => !normalized.includes(required),
  );
  const forbidden = normalized.filter((entry) =>
    forbiddenEntryPatterns.some((pattern) => pattern.test(entry)),
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

async function inspectArchitecture(file, label) {
  const { stdout } = await execFile("file", [file]);
  if (!stdout.includes("arm64") || stdout.includes("x86_64"))
    throw new Error(`${label} is not an arm64-only Mach-O: ${stdout.trim()}`);
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

function waitForExit(child, timeoutMs) {
  return new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null)
      return resolve(true);
    const timer = setTimeout(() => resolve(false), timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve(true);
    });
  });
}

async function stopProcessGroup(child) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null)
    return;
  try {
    process.kill(-child.pid, "SIGTERM");
  } catch (cause) {
    if (cause?.code !== "ESRCH") throw cause;
  }
  if (await waitForExit(child, 2_000)) return;
  try {
    process.kill(-child.pid, "SIGKILL");
  } catch (cause) {
    if (cause?.code !== "ESRCH") throw cause;
  }
  await waitForExit(child, 2_000);
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
    `Timed out waiting for packaged startup events: ${[...requiredEvents].join(", ")}`,
  );
}

export async function verifyPackagedApplication(
  applicationPath = defaultApplicationPath,
) {
  if (process.platform !== "darwin" || process.arch !== "arm64")
    throw new Error("Packaged startup verification requires arm64 macOS");

  const resources = path.join(applicationPath, "Contents", "Resources");
  const executable = path.join(applicationPath, "Contents", "MacOS", "OMXTerm");
  const asar = path.join(resources, "app.asar");
  const nativeRoot = path.join(
    resources,
    "app.asar.unpacked",
    "node_modules",
    "node-pty",
    "prebuilds",
    "darwin-arm64",
  );

  await inspectArchitecture(executable, "OMXTerm executable");
  await inspectArchitecture(
    path.join(nativeRoot, "pty.node"),
    "node-pty module",
  );
  await inspectArchitecture(
    path.join(nativeRoot, "spawn-helper"),
    "node-pty spawn helper",
  );
  await inspectApplicationIcon(applicationPath);
  await inspectUnsignedApplication(applicationPath);

  const asarInspection = inspectAsarEntries(await listPackage(asar));
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
      path.join(projectRoot, "node_modules", "@xterm", "addon-fit", "LICENSE"),
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
  await mkdir(path.join(configurationRoot, "omxterm"), { recursive: true });
  await writeFile(
    path.join(configurationRoot, "omxterm", "config.json"),
    `${JSON.stringify({ version: 1, confirmClose: false })}\n`,
  );
  const canary = `OMXTERM_PACKAGE_SECRET_CANARY_${Date.now()}`;
  let stderr = "";
  const child = spawn(executable, [`--user-data-dir=${userDataRoot}`], {
    detached: true,
    env: {
      ...process.env,
      HOME: path.join(temporaryRoot, "home"),
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
    return { applicationPath, records: records.length };
  } finally {
    await stopProcessGroup(child);
    await rm(temporaryRoot, { recursive: true, force: true });
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
