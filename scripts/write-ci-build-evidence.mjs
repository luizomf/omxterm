import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { appendFile, readFile, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import { createRequire } from "node:module";
import path from "node:path";
import {
  checksumContents,
  linuxAppImageName,
} from "./package-linux-assets.mjs";
import { inspectChecksumRecord } from "./verify-packaged-app.mjs";

const require = createRequire(import.meta.url);
const ptyRequire = createRequire(require.resolve("node-pty/package.json"));
const platform = process.platform;
if (
  !["linux", "win32"].includes(platform) ||
  process.arch !== "x64" ||
  os.machine() !== "x86_64" ||
  process.env.RUNNER_ARCH !== "X64"
)
  throw new Error("Expected a native Linux/Windows x64 runner");
const sourceSHA = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
if (!/^[a-f0-9]{40}$/u.test(sourceSHA) || sourceSHA !== process.env.GITHUB_SHA)
  throw new Error("Checkout differs from dispatch SHA");
const { version } = JSON.parse(await readFile("package.json", "utf8"));
if (!/^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/u.test(version))
  throw new Error("Invalid version");
const binary =
  platform === "linux"
    ? linuxAppImageName(version, "x64")
    : `OMXTerm-${version}-x64.exe`;
const names = [
  binary,
  `${binary}.sha256`,
  ...(platform === "linux"
    ? ["linux_install.sh", "linux_install.sh.sha256"]
    : []),
];
if (platform === "win32")
  await writeFile(
    path.join("release", `${binary}.sha256`),
    checksumContents(binary, await readFile(path.join("release", binary))),
    "utf8",
  );
for (const name of names.filter((name) => !name.endsWith(".sha256"))) {
  const bytes = await readFile(path.join("release", name));
  inspectChecksumRecord(
    await readFile(path.join("release", `${name}.sha256`), "utf8"),
    name,
    createHash("sha256").update(bytes).digest("hex"),
  );
}
const files = await Promise.all(
  names.map(async (basename) => {
    const file = path.join("release", basename);
    const metadata = await stat(file);
    if (!metadata.isFile() || metadata.size <= 0)
      throw new Error(`Missing/empty asset: ${basename}`);
    return {
      basename,
      bytes: metadata.size,
      sha256: createHash("sha256")
        .update(await readFile(file))
        .digest("hex"),
    };
  }),
);
const runtime = JSON.parse(
  await readFile(".scratch/packaged-runtime.json", "utf8"),
);
const lock = await readFile("package-lock.json");
const artifactName = `${platform}-x64-build-only-${sourceSHA}-${process.env.GITHUB_RUN_ID}-${process.env.GITHUB_RUN_ATTEMPT}`;
const evidence = {
  scope: "build-only",
  sourceSHA,
  version,
  lockSHA256: createHash("sha256").update(lock).digest("hex"),
  runner: {
    os: process.env.RUNNER_OS,
    arch: process.env.RUNNER_ARCH,
    imageOS: process.env.ImageOS,
    imageVersion: process.env.ImageVersion,
    release: os.release(),
    version: os.version(),
    machine: os.machine(),
    glibc: process.report.getReport().header.glibcVersionRuntime ?? null,
  },
  node: process.version,
  npm: process.env.NPM_VERSION,
  electronDependencyVersion:
    JSON.parse(lock).packages["node_modules/electron"].version,
  packagedRuntime: runtime,
  nodePtyPreparation: {
    // Bind the selected outputs to their reviewed recipe, not just a version.
    inputs: Object.fromEntries(
      await Promise.all(
        [
          "scripts/prepare-node-pty-runtime.mjs",
          "scripts/prepare-node-pty-exec-status.mjs",
          "native/node-pty-exec-status.patch",
          "native/node-pty-exec-status.h",
        ].map(async (file) => [
          file,
          createHash("sha256")
            .update(await readFile(file))
            .digest("hex"),
        ]),
      ),
    ),
    compiler:
      platform === "linux"
        ? execFileSync("c++", ["--version"], {
            encoding: "utf8",
            timeout: 10_000,
          }).trim()
        : null,
    nativeSource:
      platform === "win32"
        ? "official integrity-pinned archive prebuilds"
        : "guarded Unix source with locked Node-API headers",
    headers:
      platform === "linux"
        ? {
            nodeApiHeaders:
              JSON.parse(lock).packages["node_modules/node-api-headers"]
                .version,
            nodeAddonApi: ptyRequire("node-addon-api/package.json").version,
          }
        : null,
  },
  checks: [
    "npm-ci",
    "format",
    "lint",
    "typecheck",
    "headless-units",
    "build",
    "native-package-publish-never",
    "package-content-version-license-icon-architecture-inspection",
    "exact-file-checksums",
    ...(platform === "linux"
      ? [
          "AppRun-reviewed-bytes",
          "ELF-needed-inspection",
          "AppImage-extraction-without-FUSE",
        ]
      : ["unpacked-PE-inspection"]),
  ],
  unverified: [
    "desktop startup",
    "GPU/rendering",
    "ordinary-user OS integration",
    "installer execution",
    ...(platform === "linux"
      ? [
          "FUSE launch",
          "helper installation",
          "other distributions/glibc baselines",
        ]
      : [
          "NSIS payload equivalence to inspected unpacked tree",
          "Windows 11",
          "SmartScreen/UAC",
          "real ConPTY spawn",
        ]),
  ],
  artifactName,
  runID: process.env.GITHUB_RUN_ID,
  runAttempt: process.env.GITHUB_RUN_ATTEMPT,
  files,
};
await writeFile(
  "release/build-evidence.json",
  `${JSON.stringify(evidence, null, 2)}\n`,
);
await appendFile(
  process.env.GITHUB_OUTPUT,
  `version=${version}\nartifact-name=${artifactName}\n`,
);
console.log(JSON.stringify(evidence, null, 2));
