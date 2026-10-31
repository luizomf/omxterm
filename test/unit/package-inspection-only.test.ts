import { createHash } from "node:crypto";
import path from "node:path";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import * as realAsar from "@electron/asar";
import { afterEach, expect, it, vi } from "vitest";
const windowsRuntimeFiles = [
  "windowsTerminal.js",
  "windowsPtyAgent.js",
  "windowsConoutConnection.js",
  "worker/conoutSocketWorker.js",
  "conpty_console_list_agent.js",
  "eventEmitter2.js",
  "terminal.js",
  "utils.js",
];
const temporary: string[] = [];

// Exercise Windows-native ASAR member paths even when the test host is Unix.
function mockWindowsAsarMemberPaths() {
  vi.doMock("node:path", () => ({
    ...path,
    default: { ...path, normalize: path.win32.normalize },
  }));
}

function extractFixtureMember(
  archive: string,
  member: string,
  extensionFiles: string[],
) {
  if (extensionFiles.includes(member.replaceAll("\\", "/")))
    expect(member).toBe(path.win32.normalize(member));
  return realAsar.extractFile(archive, member.replaceAll("\\", path.sep));
}

function fixtureNativeMetadata(member: string, unpacked: boolean) {
  expect(member).toBe(
    path.win32.normalize("dist/extension-runtime/extension-leases.node"),
  );
  return { unpacked };
}

async function tinyRuntimeArchive(
  root: string,
  name: string,
  entries: Record<string, string | Buffer>,
) {
  const input = path.join(root, name);
  for (const [member, contents] of Object.entries(entries)) {
    const file = path.join(input, member);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, contents);
  }
  const archive = path.join(root, `${name}.asar`);
  await realAsar.createPackage(input, archive);
  return archive;
}

const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform")!;
const originalArch = Object.getOwnPropertyDescriptor(process, "arch")!;
afterEach(async () => {
  Object.defineProperty(process, "platform", originalPlatform);
  Object.defineProperty(process, "arch", originalArch);
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.doUnmock("node:fs/promises");
  vi.doUnmock("node:child_process");
  vi.doUnmock("node:path");
  vi.doUnmock("@electron/asar");
  vi.doUnmock("../../scripts/verify-linux-launcher.mjs");
  realAsar.uncacheAll();
  for (const directory of temporary.splice(0))
    await rm(directory, { recursive: true, force: true });
});

async function createInspectionArchives(
  root: string,
  platform: string,
  arch: string,
) {
  const runtimeFiles =
    platform === "win32"
      ? windowsRuntimeFiles
      : ["unixTerminal.js", "terminal.js", "utils.js"];
  const runtimeBytes = Object.fromEntries(
    runtimeFiles.map((file) => [file, `// prepared ${file}\n`]),
  );
  const nodePtyMetadata = path.join("node_modules", "node-pty", "package.json");
  const chosenFile =
    platform === "win32" ? "worker/conoutSocketWorker.js" : "unixTerminal.js";
  const chosenMember = path.join("node_modules", "node-pty", "lib", chosenFile);
  const extensionFiles =
    platform === "linux" || (platform === "win32" && arch === "arm64")
      ? [
          "dist/preload/extension-view.cjs",
          "dist/extension-runtime/bootstrap.mjs",
          "dist/extension-runtime/index.mjs",
          "dist/extension-runtime/packages.mjs",
          "dist/extension-runtime/extension-leases.node",
        ]
      : [];
  const pe = Buffer.alloc(128);
  pe.writeUInt16LE(0x5a4d, 0);
  pe.writeUInt32LE(64, 0x3c);
  pe.writeUInt32LE(0x00004550, 64);
  pe.writeUInt16LE(arch === "arm64" ? 0xaa64 : 0x8664, 68);
  const entries = {
    ...Object.fromEntries(
      extensionFiles.map((file) => [
        file,
        platform === "win32" && file.endsWith(".node")
          ? pe
          : "same licensed/icon bytes",
      ]),
    ),
    "package.json": '{"version":"1.2.3"}',
    [nodePtyMetadata]: '{"version":"1.2.0-beta.18"}',
    ...Object.fromEntries(
      runtimeFiles.map((file) => [
        path.join("node_modules", "node-pty", "lib", file),
        runtimeBytes[file]!,
      ]),
    ),
  };
  // Create real archives before platform and filesystem mocks are installed.
  const validArchive = await tinyRuntimeArchive(root, "valid", entries);
  const missingEntries = { ...entries };
  delete missingEntries[chosenMember];
  const missingArchive = await tinyRuntimeArchive(
    root,
    "missing",
    missingEntries,
  );
  const changedArchive = await tinyRuntimeArchive(root, "changed", {
    ...entries,
    [chosenMember]: "// different packaged bytes\n",
  });
  const wrongVersionArchive = await tinyRuntimeArchive(root, "version", {
    ...entries,
    [nodePtyMetadata]: '{"version":"9.9.9"}',
  });
  const changedExtensionArchive = await tinyRuntimeArchive(
    root,
    "changed-extension",
    {
      ...entries,
      "dist/extension-runtime/packages.mjs": "// wrong packaged store\n",
    },
  );
  return {
    runtimeFiles,
    runtimeBytes,
    nodePtyMetadata,
    extensionFiles,
    pe,
    validArchive,
    missingArchive,
    changedArchive,
    wrongVersionArchive,
    changedExtensionArchive,
  };
}

function inspectionCommands(
  platform: string,
  arch: string,
  applicationRoot: string,
  root: string,
  probeFailure: {
    active: boolean;
    invalidStdout: boolean;
    report: object | null;
  },
) {
  return vi.fn(
    async (
      file: string,
      args: string[],
      options: { env?: NodeJS.ProcessEnv; encoding?: string },
    ) => {
      if (file === "file")
        return { stdout: "ELF 64-bit LSB executable, x86-64", stderr: "" };
      if (
        file === "readelf" ||
        args[0] === "--appimage-extract" ||
        args[0] === "--appimage-signature"
      )
        return { stdout: "", stderr: "" };
      expect(file).toBe(
        path.join(
          applicationRoot,
          platform === "linux" ? "omxterm" : "OMXTerm.exe",
        ),
      );
      expect(options.env?.ELECTRON_RUN_AS_NODE).toBe("1");
      if (args[0] === "--input-type=module") {
        expect(
          platform === "linux" || (platform === "win32" && arch === "arm64"),
        ).toBe(true);
        if (platform === "win32") {
          expect(options.env?.SystemRoot).toBe("C:\\Windows");
          expect(options.env?.TEMP).toBe(root);
          expect(options.env?.TMP).toBe(root);
          expect(options.env?.USERPROFILE).toBe(root);
          expect(Object.keys(options.env ?? {}).sort()).toEqual(
            [
              "ELECTRON_RUN_AS_NODE",
              "HOME",
              "PATH",
              "SystemRoot",
              "TEMP",
              "TMP",
              "TMPDIR",
              "USERPROFILE",
            ].sort(),
          );
        }
        expect(args.slice(0, 3)).toEqual([
          "--input-type=module",
          "-e",
          "same licensed/icon bytes",
        ]);
        expect(args.slice(3)).toEqual([
          "--",
          path.join(applicationRoot, "resources", "app.asar"),
          root,
          "1.2.3",
        ]);
        expect(options.env?.PATH).toBe(path.join(root, "empty-path"));
        expect(options.encoding).toBe("buffer");
        if (probeFailure.active)
          throw Object.assign(new Error("packaged extension probe failed"), {
            stderr: Buffer.from([0xa2, 0x0a]),
          });
        return {
          stdout: probeFailure.invalidStdout
            ? Buffer.from([
                0x7b, 0x22, 0x78, 0x22, 0x3a, 0x22, 0xff, 0x22, 0x7d,
              ])
            : Buffer.from(
                JSON.stringify(
                  probeFailure.report ?? {
                    target: `${platform}-${arch}`,
                    hostVersion: "1.2.3",
                    runtime: { electron: "43.8.1" },
                    checks: [
                      "packaged-store-and-lease",
                      "bootstrap-missing-IPC-refusal",
                    ],
                  },
                ),
              ),
          stderr: Buffer.from([0xa2, 0x0a]),
        };
      }
      expect(args).toEqual([
        path.resolve("scripts/inspect-packaged-runtime.cjs"),
        path.join(applicationRoot, "resources", "app.asar"),
      ]);
      return {
        stdout: JSON.stringify({
          versions: { electron: "43.8.1" },
          platform,
          arch,
        }),
        stderr: "",
      };
    },
  );
}

it.each([
  ["linux", "x64"],
  ["win32", "x64"],
  ["win32", "arm64"],
])(
  "%s %s inspection loads only the packaged runtime, never provisions or starts a desktop",
  async (platform, arch) => {
    const root = await mkdtemp(path.join(tmpdir(), "omxterm-asar-inspection-"));
    temporary.push(root);
    const {
      runtimeFiles,
      runtimeBytes,
      nodePtyMetadata,
      extensionFiles,
      pe,
      validArchive,
      missingArchive,
      changedArchive,
      wrongVersionArchive,
      changedExtensionArchive,
    } = await createInspectionArchives(root, platform, arch);
    let selectedArchive = validArchive;
    let nativeExtensionUnpacked = true;
    let wrongExtensionArchitecture = false;
    const packagedPath = path.join(
      root,
      platform === "linux" ? "OMXTerm-1.2.3-x64.AppImage" : "win-unpacked",
    );
    const applicationRoot =
      platform === "linux" ? path.join(root, "squashfs-root") : packagedPath;
    Object.defineProperty(process, "platform", {
      value: platform,
      configurable: true,
    });
    Object.defineProperty(process, "arch", {
      value: arch,
      configurable: true,
    });
    if (platform === "win32") vi.stubEnv("SystemRoot", "C:\\Windows");
    const helperSource = "VERSION='@OMXTERM_VERSION@'\n";
    const helper = "VERSION='1.2.3'\n";
    const digest = (text: string) =>
      createHash("sha256").update(text).digest("hex");
    const readFile = vi.fn(async (file: string, encoding?: string) => {
      if (
        platform === "win32" &&
        (file.endsWith(".exe") ||
          file.endsWith(".node") ||
          file.endsWith(".dll"))
      ) {
        if (
          wrongExtensionArchitecture &&
          file.includes("app.asar.unpacked") &&
          file.endsWith(path.join("extension-runtime", "extension-leases.node"))
        ) {
          const wrong = Buffer.from(pe);
          wrong.writeUInt16LE(0x8664, 68);
          return wrong;
        }
        return pe;
      }
      let contents = "same licensed/icon bytes";
      const runtimeFile = runtimeFiles.find((member) =>
        file.endsWith(path.join("node_modules", "node-pty", "lib", member)),
      );
      if (runtimeFile) contents = runtimeBytes[runtimeFile]!;
      else if (file.endsWith("install-linux-appimage.sh"))
        contents = helperSource;
      else if (file.endsWith("linux_install.sh")) contents = helper;
      else if (file.endsWith(".sha256")) {
        const name = path.basename(file.slice(0, -7));
        contents = `${digest(name === "linux_install.sh" ? helper : "same licensed/icon bytes")}  ${name}\n`;
      } else if (file.endsWith("package-lock.json"))
        contents = JSON.stringify({
          packages: {
            "node_modules/electron": { version: "43.8.1" },
            "node_modules/node-pty": {
              version: "1.2.0-beta.18",
              integrity: "selected-integrity",
            },
          },
        });
      else if (file.endsWith("package.json")) contents = '{"version":"1.2.3"}';
      else if (file.endsWith("omxterm.desktop"))
        contents = "X-AppImage-Version=1.2.3\n";
      return encoding ? contents : Buffer.from(contents);
    });
    vi.doMock("node:fs/promises", () => ({
      readFile,
      readdir: vi.fn(async () => []),
      mkdir: vi.fn(),
      writeFile: vi.fn(),
      rm: vi.fn(),
      mkdtemp: vi.fn(async () => root),
      stat: vi.fn(async (file: string) => {
        if (
          platform === "win32" &&
          file.endsWith(path.join("release", `OMXTerm-1.2.3-${arch}.exe`))
        )
          throw new Error("Inspection must not access an installer");
        if (file.endsWith("default_app.asar"))
          throw Object.assign(new Error(), { code: "ENOENT" });
        return { isFile: () => true };
      }),
    }));
    const probeFailure: {
      active: boolean;
      invalidStdout: boolean;
      report: object | null;
    } = {
      active: false,
      invalidStdout: false,
      report: null,
    };
    const execute = inspectionCommands(
      platform,
      arch,
      applicationRoot,
      root,
      probeFailure,
    );
    const execFile = Object.assign(vi.fn(), {
      [Symbol.for("nodejs.util.promisify.custom")]: execute,
    });
    const spawn = vi.fn(() => {
      throw new Error("No GUI or helper may be spawned");
    });
    vi.doMock("node:child_process", () => ({ execFile, spawn }));
    mockWindowsAsarMemberPaths();
    const expectedAsar = path.join(applicationRoot, "resources", "app.asar");
    const extract = vi.fn((archive: string, member: string) => {
      expect(archive).toBe(expectedAsar);
      return extractFixtureMember(selectedArchive, member, extensionFiles);
    });
    // Only map archive identity; member lookup/payload bytes are the real reader.
    // Native files, inventory, licenses and subprocesses remain controlled ports.
    vi.doMock("@electron/asar", () => ({
      extractFile: extract,
      statFile: (_archive: string, member: string) =>
        fixtureNativeMetadata(member, nativeExtensionUnpacked),
      listPackage: async () => [
        ...extensionFiles.map((file) => `/${file}`),
        ...(extensionFiles.length
          ? [
              "/node_modules/semver/package.json",
              "/node_modules/yauzl/package.json",
            ]
          : []),
        "/dist/main/index.js",
        "/dist/preload/index.cjs",
        "/dist/renderer/application-icon.png",
        "/dist/renderer/index.css",
        "/dist/renderer/index.html",
        "/dist/renderer/index.js",
        "/node_modules/node-pty/lib/index.js",
        ...(platform === "win32"
          ? [
              ...[
                "conpty.node",
                "conpty_console_list.node",
                "conpty/conpty.dll",
                "conpty/OpenConsole.exe",
              ].map(
                (file) =>
                  `/node_modules/node-pty/prebuilds/win32-${arch}/${file}`,
              ),
              ...windowsRuntimeFiles.map(
                (file) => `/node_modules/node-pty/lib/${file}`,
              ),
            ]
          : []),
        "/package.json",
      ],
    }));
    const launcher = vi.fn();
    vi.doMock("../../scripts/verify-linux-launcher.mjs", () => ({
      inspectLinuxAppRun: launcher,
    }));
    const { verifyPackagedApplication } =
      await import("../../scripts/verify-packaged-app.mjs");
    const stderr = vi
      .spyOn(process.stderr, "write")
      .mockImplementation(() => true);
    const result = await verifyPackagedApplication(packagedPath, {
      inspectionOnly: true,
    });
    expect(result.verification).toContain("INSPECTION ONLY");
    expect(result.verification).not.toContain("FULL");
    expect(result.records).toBe(0);
    if (extensionFiles.length)
      expect(stderr).toHaveBeenCalledWith(Buffer.from([0xa2, 0x0a]));
    else expect(stderr).not.toHaveBeenCalled();
    expect(spawn).not.toHaveBeenCalled();
    expect(extract.mock.calls).toEqual([
      [expectedAsar, "package.json"],
      ...runtimeFiles.map((file) => [
        expectedAsar,
        path.join("node_modules", "node-pty", "lib", file),
      ]),
      [expectedAsar, nodePtyMetadata],
      ...extensionFiles.map((file) => [
        expectedAsar,
        path.win32.normalize(file),
      ]),
    ]);
    const nativeHelperCalls = () =>
      execute.mock.calls.filter(
        ([, args]) =>
          args[0] === path.resolve("scripts/inspect-packaged-runtime.cjs"),
      ).length;
    expect(nativeHelperCalls()).toBe(1);
    if (platform === "linux") expect(launcher).toHaveBeenCalledOnce();
    for (const [archive, expectedError] of [
      [missingArchive, "was not found in this archive"],
      [
        changedArchive,
        "Packaged node-pty JavaScript differs from prepared runtime",
      ],
      [wrongVersionArchive, "Packaged node-pty version differs from lock"],
    ] as const) {
      selectedArchive = archive;
      await expect(
        verifyPackagedApplication(packagedPath, { inspectionOnly: true }),
      ).rejects.toThrow(expectedError);
      expect(nativeHelperCalls()).toBe(1); // all three failures precede native load
      expect(spawn).not.toHaveBeenCalled();
    }
    if (extensionFiles.length) {
      if (platform === "linux") expect(launcher).toHaveBeenCalledTimes(4);
      selectedArchive = changedExtensionArchive;
      await expect(
        verifyPackagedApplication(packagedPath, { inspectionOnly: true }),
      ).rejects.toThrow("Packaged extension resource differs");
      selectedArchive = validArchive;
      nativeExtensionUnpacked = false;
      await expect(
        verifyPackagedApplication(packagedPath, { inspectionOnly: true }),
      ).rejects.toThrow("Packaged native extension must be unpacked");
      nativeExtensionUnpacked = true;
      expect(
        execute.mock.calls.filter(
          ([, args]) => args[0] === "--input-type=module",
        ),
      ).toHaveLength(1);
      const priorStderrCalls = stderr.mock.calls.length;
      probeFailure.active = true;
      await expect(
        verifyPackagedApplication(packagedPath, { inspectionOnly: true }),
      ).rejects.toThrow("packaged extension probe failed");
      expect(stderr.mock.calls).toHaveLength(priorStderrCalls + 1);
      expect(stderr).toHaveBeenLastCalledWith(Buffer.from([0xa2, 0x0a]));
      probeFailure.active = false;
      probeFailure.invalidStdout = true;
      await expect(
        verifyPackagedApplication(packagedPath, { inspectionOnly: true }),
      ).rejects.toThrow(/encoded data was not valid/u);
      probeFailure.invalidStdout = false;
      const validReport = {
        target: `${platform}-${arch}`,
        hostVersion: "1.2.3",
        runtime: { electron: "43.8.1" },
        checks: ["packaged-store-and-lease", "bootstrap-missing-IPC-refusal"],
      };
      for (const report of [
        { ...validReport, target: "wrong-target" },
        { ...validReport, hostVersion: "0.0.0" },
        { ...validReport, checks: ["packaged-store-and-lease"] },
        { ...validReport, runtime: {} },
      ]) {
        probeFailure.report = report;
        await expect(
          verifyPackagedApplication(packagedPath, { inspectionOnly: true }),
        ).rejects.toThrow("Packaged extension probe result mismatch");
      }
      probeFailure.report = null;
      if (platform === "win32") {
        wrongExtensionArchitecture = true;
        await expect(
          verifyPackagedApplication(packagedPath, { inspectionOnly: true }),
        ).rejects.toThrow("extension native module is not an arm64-only PE");
        wrongExtensionArchitecture = false;
        vi.stubEnv("SystemRoot", "relative");
        await expect(
          verifyPackagedApplication(packagedPath, { inspectionOnly: true }),
        ).rejects.toThrow("absolute Windows SystemRoot");
      }
      if (platform === "linux") {
        execute.mockResolvedValueOnce({
          stdout: "ELF 64-bit LSB executable, ARM aarch64",
          stderr: "",
        });
        await expect(
          verifyPackagedApplication(packagedPath, { inspectionOnly: true }),
        ).rejects.toThrow("x64-only ELF");
      }
    } else {
      expect(execute).toHaveBeenCalledOnce(); // no NSIS, helper or GUI subprocess
      expect(launcher).not.toHaveBeenCalled();
    }
    expect(execute).not.toHaveBeenCalledWith(
      expect.stringContaining("linux_install.sh"),
      expect.anything(),
      expect.anything(),
    );
  },
);
