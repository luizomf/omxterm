import path from "node:path";
import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { createRequire } from "node:module";
import { expect, it, vi } from "vitest";
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

it("release verification is a macOS-only option", () => {
  expect(windowsVerificationOptions(["--release"], "darwin")).toEqual({
    windowsUnpackedOnly: false,
    disposableVm: false,
    release: true,
  });
  expect(
    windowsVerificationOptions(["--inspection-only", "--release"], "darwin"),
  ).toMatchObject({ inspectionOnly: true, release: true });
  expect(() => windowsVerificationOptions(["--release"], "linux")).toThrow();
  expect(() =>
    windowsVerificationOptions(["--release", "--release"], "darwin"),
  ).toThrow();
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
