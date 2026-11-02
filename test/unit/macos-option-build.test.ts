import type { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { parse } from "yaml";
import { buildMacOSOptionShortcut } from "../../scripts/build-macos-option-shortcut.mjs";
import { inspectAsarEntries } from "../../scripts/verify-packaged-app.mjs";
import { inspectWindowsInstallerInputs } from "../../scripts/verify-windows-installer.mjs";

it("builds the dedicated N-API addon with pinned local headers and the macOS 12 floor", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-option-build-"));
  const execute = vi.fn<typeof execFileSync>();
  try {
    await buildMacOSOptionShortcut(root, {
      platform: "darwin",
      arch: "arm64",
      execute,
    });
    const [command, args] = execute.mock.calls[0]!;
    expect(command).toBe("/usr/bin/xcrun");
    expect(args).toEqual(
      expect.arrayContaining([
        "clang++",
        "-arch",
        "arm64",
        "-mmacosx-version-min=12.0",
        "-DNAPI_VERSION=8",
        "-DNODE_GYP_MODULE_NAME=macos_option_shortcut",
        "-framework",
        "Cocoa",
        "Carbon",
        path.join(root, "macos-option-shortcut.node"),
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
  "does not invoke Apple tools on %s",
  async (platform) => {
    const execute = vi.fn();
    await buildMacOSOptionShortcut("unused", {
      platform,
      arch: "arm64",
      execute,
    });
    expect(execute).not.toHaveBeenCalled();
  },
);

it("fails a macOS compile error and rejects unsupported macOS architectures", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-option-build-"));
  try {
    await expect(
      buildMacOSOptionShortcut(root, {
        platform: "darwin",
        arch: "arm64",
        execute: () => {
          throw new Error("compiler failed");
        },
      }),
    ).rejects.toThrow("compiler failed");
    await expect(
      buildMacOSOptionShortcut(root, { platform: "darwin", arch: "x64" }),
    ).rejects.toThrow("ARM64");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it("requires the Option shortcut addon only in macOS package inventories", () => {
  const addon = "/dist/main/macos-option-shortcut.node";
  expect(inspectAsarEntries([], "darwin").missing).toContain(addon);
  for (const platform of ["linux", "win32"] as const)
    expect(inspectAsarEntries([addon], platform).forbidden).toEqual([addon]);
});

it("retains the Windows installer's exact input guard for the new package entries", () => {
  const configuration = readFileSync("electron-builder.yml", "utf8");
  expect(() =>
    inspectWindowsInstallerInputs(configuration, "26.15.3", "omxterm"),
  ).not.toThrow();
  for (const line of [
    "    - dist/main/macos-option-shortcut.node\n",
    '    - "!dist/main/macos-option-shortcut.node"\n',
  ])
    expect(() =>
      inspectWindowsInstallerInputs(
        configuration.replace(line, ""),
        "26.15.3",
        "omxterm",
      ),
    ).toThrow(/footprint/u);
});

it("unpacks the addon only on macOS even if dist contains stale foreign artifacts", () => {
  const config = parse(readFileSync("electron-builder.yml", "utf8")) as {
    asar: { smartUnpack: boolean };
    mac: { asarUnpack: string[] };
    linux: { files: string[] };
    win: { files: string[] };
  };
  expect(config.asar.smartUnpack).toBe(false);
  expect(config.mac.asarUnpack).toContain(
    "dist/main/macos-option-shortcut.node",
  );
  for (const platform of ["linux", "win"] as const)
    expect(config[platform].files).toContain(
      "!dist/main/macos-option-shortcut.node",
    );
});
