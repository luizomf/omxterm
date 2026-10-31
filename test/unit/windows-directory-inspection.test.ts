import path from "node:path";
import { mkdtemp, mkdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { pathToFileURL } from "node:url";
import * as asar from "@electron/asar";
import { afterEach, expect, it, vi } from "vitest";

const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform")!;
const originalArch = Object.getOwnPropertyDescriptor(process, "arch")!;
const temporary: string[] = [];

afterEach(async () => {
  Object.defineProperty(process, "platform", originalPlatform);
  Object.defineProperty(process, "arch", originalArch);
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  vi.resetModules();
  vi.doUnmock("node:fs/promises");
  vi.doUnmock("node:child_process");
  vi.doUnmock("node:url");
  asar.uncacheAll();
  for (const directory of temporary.splice(0))
    await rm(directory, { recursive: true, force: true });
});

it("inspects a Windows directory without an installer and reaches the packaged probe", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-directory-only-"));
  temporary.push(root);
  const project = path.join(root, "project");
  const application = path.join(root, "win-arm64-unpacked");
  const members = path.join(root, "members");
  const archive = path.join(application, "resources", "app.asar");
  const installer = path.join(project, "release", "OMXTerm-1.2.3-arm64.exe");
  const put = async (file: string, bytes: string | Buffer) => {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, bytes);
  };
  const pe = Buffer.alloc(128);
  pe.writeUInt16LE(0x5a4d, 0);
  pe.writeUInt32LE(64, 0x3c);
  pe.writeUInt32LE(0x00004550, 64);
  pe.writeUInt16LE(0xaa64, 68);
  await put(path.join(project, "package.json"), '{"version":"1.2.3"}');
  await put(
    path.join(project, "package-lock.json"),
    JSON.stringify({
      packages: {
        "node_modules/electron": { version: "43.8.1" },
        "node_modules/node-pty": { version: "1.2.0-beta.18" },
      },
    }),
  );
  await put(path.join(project, "assets/application-icon.png"), "icon");
  await put(path.join(application, "resources/application-icon.png"), "icon");
  await put(path.join(application, "OMXTerm.exe"), pe);
  await put(
    path.join(project, "scripts/packaged-extensions-probe.mjs"),
    "probe fixture",
  );
  for (const file of [
    "dist/main/index.js",
    "dist/preload/index.cjs",
    "dist/renderer/application-icon.png",
    "dist/renderer/index.css",
    "dist/renderer/index.html",
    "dist/renderer/index.js",
    "node_modules/node-pty/lib/index.js",
    "node_modules/semver/package.json",
    "node_modules/yauzl/package.json",
  ])
    await put(path.join(members, file), "fixture");
  await put(path.join(members, "package.json"), '{"version":"1.2.3"}');
  await put(
    path.join(members, "node_modules/node-pty/package.json"),
    '{"version":"1.2.0-beta.18"}',
  );
  for (const file of [
    "windowsTerminal.js",
    "windowsPtyAgent.js",
    "windowsConoutConnection.js",
    "worker/conoutSocketWorker.js",
    "conpty_console_list_agent.js",
    "eventEmitter2.js",
    "terminal.js",
    "utils.js",
  ]) {
    const name = path.join("node_modules/node-pty/lib", file);
    await put(path.join(project, name), file);
    await put(path.join(members, name), file);
  }
  for (const file of [
    "conpty.node",
    "conpty_console_list.node",
    "conpty/conpty.dll",
    "conpty/OpenConsole.exe",
  ]) {
    const name = path.join("node_modules/node-pty/prebuilds/win32-arm64", file);
    await put(path.join(project, name), pe);
    await put(path.join(members, name), pe);
  }
  for (const file of [
    "dist/preload/extension-view.cjs",
    "dist/extension-runtime/bootstrap.mjs",
    "dist/extension-runtime/index.mjs",
    "dist/extension-runtime/packages.mjs",
    "dist/extension-runtime/extension-leases.node",
  ]) {
    const bytes = file.endsWith(".node") ? pe : file;
    await put(path.join(project, file), bytes);
    await put(path.join(members, file), bytes);
  }
  await mkdir(path.dirname(archive), { recursive: true });
  await asar.createPackageWithOptions(members, archive, {
    unpack: "**/*.node",
  });
  for (const file of ["conpty/conpty.dll", "conpty/OpenConsole.exe"]) {
    await put(
      path.join(
        `${archive}.unpacked`,
        "node_modules/node-pty/prebuilds/win32-arm64",
        file,
      ),
      pe,
    );
  }
  await expect(stat(installer)).rejects.toMatchObject({ code: "ENOENT" });

  Object.defineProperty(process, "platform", {
    value: "win32",
    configurable: true,
  });
  Object.defineProperty(process, "arch", {
    value: "arm64",
    configurable: true,
  });
  vi.stubEnv("SystemRoot", "C:\\Windows");
  const installerAccess = vi.fn();
  vi.doMock("node:fs/promises", async (importOriginal) => {
    const actual = await importOriginal<typeof import("node:fs/promises")>();
    return {
      ...actual,
      stat: async (file: string) => {
        if (file === installer) {
          installerAccess();
          throw new Error("UNEXPECTED_INSTALLER_ACCESS");
        }
        return actual.stat(file);
      },
    };
  });
  const realVerifier = pathToFileURL(
    path.resolve("scripts/verify-packaged-app.mjs"),
  ).href;
  vi.doMock("node:url", async (importOriginal) => {
    const actual = await importOriginal<typeof import("node:url")>();
    return {
      ...actual,
      fileURLToPath: (url: string | URL) =>
        String(url) === realVerifier
          ? path.join(project, "scripts/verify-packaged-app.mjs")
          : actual.fileURLToPath(url),
    };
  });
  const packagedProbe = vi.fn(async (file: string, args: string[]) => {
    expect(file).toBe(path.join(application, "OMXTerm.exe"));
    expect(args.slice(0, 3)).toEqual([
      "--input-type=module",
      "-e",
      "probe fixture",
    ]);
    throw new Error("PACKAGED_PROBE_REACHED");
  });
  const execFile = Object.assign(vi.fn(), {
    [Symbol.for("nodejs.util.promisify.custom")]: packagedProbe,
  });
  vi.doMock("node:child_process", () => ({
    execFile,
    spawn: () => {
      throw new Error("Unexpected GUI launch");
    },
    spawnSync: () => {
      throw new Error("Unexpected process");
    },
  }));
  const { verifyPackagedApplication } =
    await import("../../scripts/verify-packaged-app.mjs");

  await expect(
    verifyPackagedApplication(application, { inspectionOnly: true }),
  ).rejects.toThrow("PACKAGED_PROBE_REACHED");
  await expect(
    verifyPackagedApplication(application, { windowsUnpackedOnly: true }),
  ).rejects.toThrow("PACKAGED_PROBE_REACHED");
  expect(packagedProbe).toHaveBeenCalledTimes(2);
  expect(installerAccess).not.toHaveBeenCalled();

  await expect(verifyPackagedApplication(application)).rejects.toThrow(
    "UNEXPECTED_INSTALLER_ACCESS",
  );
  expect(installerAccess).toHaveBeenCalledOnce();
  expect(packagedProbe).toHaveBeenCalledTimes(2);

  await put(path.join(project, "package.json"), '{"version":"9.9.9"}');
  await expect(
    verifyPackagedApplication(application, { inspectionOnly: true }),
  ).rejects.toThrow("differs from source package version");
  expect(packagedProbe).toHaveBeenCalledTimes(2);
});
