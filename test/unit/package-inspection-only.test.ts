import { createHash } from "node:crypto";
import path from "node:path";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { createRequire } from "node:module";
import { afterEach, expect, it, vi } from "vitest";
import { windowsVerificationOptions } from "../../scripts/windows-verification-options.mjs";

it("inspection is explicit, platform-independent and cannot authorize full verification", () => {
  for (const platform of ["linux", "win32", "darwin"]) {
    expect(windowsVerificationOptions(["--inspection-only"], platform)).toEqual(
      { inspectionOnly: true, windowsUnpackedOnly: false, disposableVm: false },
    );
  }
  expect(windowsVerificationOptions([], "win32")).toEqual({
    windowsUnpackedOnly: false,
    disposableVm: false,
  });
  for (const args of [
    ["--inspection-only", "--inspection-only"],
    ["--inspection-only", "--windows-unpacked-only"],
    ["--inspection-only", "--disposable-vm-allow-omxterm-replacement"],
  ]) {
    expect(() => windowsVerificationOptions(args, "win32")).toThrow();
  }
});

it.each(["win32", "linux"])(
  "the actual %s inspection helper uses only its target addons and native resize contract",
  async (platform) => {
    const source = await readFile(
      "scripts/inspect-packaged-runtime.cjs",
      "utf8",
    );
    const asar = path.resolve("exact-package/app.asar");
    const loaded: string[] = [];
    const spawn = vi.fn((_file: string, _args: string[]) => {
      const index = spawn.mock.calls.length;
      return {
        kill: vi.fn(),
        resize: vi.fn(),
        onData(listener: (text: string) => void) {
          queueMicrotask(() => listener("OMXTERM_PTY_OK"));
        },
        onExit(listener: (event: object) => void) {
          queueMicrotask(() =>
            listener({
              exitCode: index === 1 ? 0 : 1,
              execFailed: index === 2,
            }),
          );
        },
      };
    });
    const resize = vi.fn((...args: number[]) => {
      if (JSON.stringify(args) !== JSON.stringify([-1, 80, 24, 0, 0]))
        throw new Error("wrong resize arguments");
      throw new Error("ioctl(2) failed, EBADF");
    });
    const runtimeProcess = {
      argv: ["electron", "helper", asar],
      platform,
      arch: "x64",
      versions: { electron: "43.8.1" },
      exitCode: 0,
    };
    const require = createRequire(import.meta.url);
    const result = await new Promise<unknown>((resolve, reject) => {
      runInNewContext(source, {
        process: runtimeProcess,
        setTimeout,
        clearTimeout,
        console: {
          log: (text: string) => resolve(JSON.parse(text) as unknown),
          error: reject,
        },
        require(id: string) {
          if (!path.isAbsolute(id)) return require(id) as unknown;
          loaded.push(id);
          if (id === path.join(asar, "node_modules/node-pty")) return { spawn };
          const root = path.join(
            `${asar}.unpacked`,
            "node_modules/node-pty",
            platform === "win32" ? "prebuilds/win32-x64" : "build/Release",
          );
          if (
            id ===
            path.join(root, platform === "win32" ? "conpty.node" : "pty.node")
          )
            return { resize };
          if (
            platform === "win32" &&
            id === path.join(root, "conpty_console_list.node")
          )
            return {};
          throw new Error(`Unexpected addon: ${id}`);
        },
      });
    });
    expect(result).toMatchObject({ platform, arch: "x64" });
    if (platform === "win32") {
      expect(spawn).not.toHaveBeenCalled();
      expect(resize).not.toHaveBeenCalled();
      expect(loaded.map((file) => path.basename(file))).toEqual([
        "node-pty",
        "conpty.node",
        "conpty_console_list.node",
      ]);
    } else {
      expect(spawn).toHaveBeenCalledTimes(3);
      expect(resize).toHaveBeenCalledWith(-1, 80, 24, 0, 0);
    }
  },
);

const originalPlatform = Object.getOwnPropertyDescriptor(process, "platform")!;
const originalArch = Object.getOwnPropertyDescriptor(process, "arch")!;
afterEach(() => {
  Object.defineProperty(process, "platform", originalPlatform);
  Object.defineProperty(process, "arch", originalArch);
  vi.restoreAllMocks();
  vi.resetModules();
  vi.doUnmock("node:fs/promises");
  vi.doUnmock("node:child_process");
  vi.doUnmock("@electron/asar");
  vi.doUnmock("../../scripts/verify-linux-launcher.mjs");
});

it.each(["linux", "win32"])(
  "%s x64 inspection loads only the packaged runtime, never provisions or starts a desktop",
  async (platform) => {
    const root = path.resolve("inspection-fixture");
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
      value: "x64",
      configurable: true,
    });
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
        const pe = Buffer.alloc(128);
        pe.writeUInt16LE(0x5a4d, 0);
        pe.writeUInt32LE(64, 0x3c);
        pe.writeUInt32LE(0x00004550, 64);
        pe.writeUInt16LE(0x8664, 68);
        return pe;
      }
      let contents = "same licensed/icon bytes";
      if (file.endsWith("install-linux-appimage.sh")) contents = helperSource;
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
        if (file.endsWith("default_app.asar"))
          throw Object.assign(new Error(), { code: "ENOENT" });
        return { isFile: () => true };
      }),
    }));
    const execute = vi.fn(
      async (
        file: string,
        args: string[],
        options: { env?: NodeJS.ProcessEnv },
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
        expect(args[1]).toBe(
          path.join(applicationRoot, "resources", "app.asar"),
        );
        return {
          stdout: JSON.stringify({
            versions: { electron: "43.8.1" },
            platform,
            arch: "x64",
          }),
          stderr: "",
        };
      },
    );
    const execFile = Object.assign(vi.fn(), {
      [Symbol.for("nodejs.util.promisify.custom")]: execute,
    });
    const spawn = vi.fn(() => {
      throw new Error("No GUI or helper may be spawned");
    });
    vi.doMock("node:child_process", () => ({ execFile, spawn }));
    vi.doMock("@electron/asar", () => ({
      extractFile: (_asar: string, file: string) =>
        Buffer.from(
          file === "package.json"
            ? '{"version":"1.2.3"}'
            : file === "node_modules/node-pty/package.json"
              ? '{"version":"1.2.0-beta.18"}'
              : "same licensed/icon bytes",
        ),
      listPackage: async () => [
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
                (file) => `/node_modules/node-pty/prebuilds/win32-x64/${file}`,
              ),
              ...[
                "windowsTerminal.js",
                "windowsPtyAgent.js",
                "windowsConoutConnection.js",
                "worker/conoutSocketWorker.js",
                "conpty_console_list_agent.js",
                "eventEmitter2.js",
                "terminal.js",
                "utils.js",
              ].map((file) => `/node_modules/node-pty/lib/${file}`),
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
    const result = await verifyPackagedApplication(packagedPath, {
      inspectionOnly: true,
    });
    expect(result.verification).toContain("INSPECTION ONLY");
    expect(result.verification).not.toContain("FULL");
    expect(result.records).toBe(0);
    expect(spawn).not.toHaveBeenCalled();
    if (platform === "linux") {
      expect(launcher).toHaveBeenCalledOnce();
      execute.mockResolvedValueOnce({
        stdout: "ELF 64-bit LSB executable, ARM aarch64",
        stderr: "",
      });
      await expect(
        verifyPackagedApplication(packagedPath, { inspectionOnly: true }),
      ).rejects.toThrow("x64-only ELF");
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
