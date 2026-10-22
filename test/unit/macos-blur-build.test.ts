import type { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { buildMacOSWindowBlur } from "../../scripts/build-macos-window-blur.mjs";

it("builds a Node-API v8 arm64 addon with the Electron macOS 12 floor, without downloading headers", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-blur-build-"));
  const execute = vi.fn<typeof execFileSync>();
  try {
    await buildMacOSWindowBlur(root, {
      platform: "darwin",
      arch: "arm64",
      execute,
    });
    expect(execute).toHaveBeenCalledOnce();
    const [command, args] = execute.mock.calls[0]!;
    expect(command).toBe("/usr/bin/xcrun");
    expect(args).toEqual(
      expect.arrayContaining([
        "clang++",
        "-arch",
        "arm64",
        "-mmacosx-version-min=12.0",
        "-DNAPI_VERSION=8",
        "-framework",
        "Cocoa",
        "-o",
        path.join(root, "macos-window-blur.node"),
      ]),
    );
    expect(
      args?.some((arg: string) =>
        arg.endsWith(path.join("node-api-headers", "include")),
      ),
    ).toBe(true);
    expect(args?.join(" ")).not.toMatch(/node-gyp|electron-rebuild|https?:/u);
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it.each(["linux", "win32"])(
  "needs no Apple tooling on %s",
  async (platform) => {
    const execute = vi.fn();
    await buildMacOSWindowBlur("unused", { platform, arch: "arm64", execute });
    expect(execute).not.toHaveBeenCalled();
  },
);

it("fails a macOS compiler error rather than silently packaging without the addon", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-blur-build-"));
  try {
    await expect(
      buildMacOSWindowBlur(root, {
        platform: "darwin",
        arch: "arm64",
        execute: () => {
          throw new Error("compiler failed");
        },
      }),
    ).rejects.toThrow("compiler failed");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("builds the Intel addon for x64 and rejects other architectures", async () => {
  const execute = vi.fn();
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-blur-build-"));
  try {
    await buildMacOSWindowBlur(root, {
      platform: "darwin",
      arch: "x64",
      execute,
    });
    expect(execute.mock.calls[0]![1]).toEqual(
      expect.arrayContaining(["-arch", "x86_64"]),
    );
    await expect(
      buildMacOSWindowBlur(root, { platform: "darwin", arch: "ia32", execute }),
    ).rejects.toThrow("ARM64 or x64");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
