import { afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import type { BuildOptions } from "esbuild";

const calls = vi.hoisted(() => ({
  build: vi.fn<(options: BuildOptions) => Promise<void>>(),
  leases: vi.fn(),
  native: vi.fn(),
  blur: vi.fn(),
}));
vi.mock("esbuild", () => ({ build: calls.build }));
vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn(),
  rm: vi.fn(),
  cp: vi.fn(),
}));
vi.mock("node:child_process", () => ({ execFileSync: calls.native }));
vi.mock("../../scripts/build-extension-leases.mjs", () => ({
  buildExtensionLeases: calls.leases,
}));
vi.mock("../../scripts/build-macos-window-blur.mjs", () => ({
  buildMacOSWindowBlur: calls.blur,
}));

const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
const arch = Object.getOwnPropertyDescriptor(process, "arch")!;
afterEach(() => {
  Object.defineProperty(process, "platform", platform);
  Object.defineProperty(process, "arch", arch);
  vi.clearAllMocks();
  vi.resetModules();
});

it.each([
  ["darwin", "arm64", true, false],
  ["linux", "arm64", true, true],
  ["linux", "x64", false, false],
  ["win32", "arm64", false, false],
  ["win32", "x64", false, false],
  ["darwin", "x64", false, false],
])(
  "ordinary %s %s build selects runtime=%s Files move=%s",
  async (os, cpu, runtime, move) => {
    Object.defineProperty(process, "platform", { value: os });
    Object.defineProperty(process, "arch", { value: cpu });
    // Import the real orchestration and Files builder with all effectful seams mocked.
    const entry = "../../build.mjs";
    await import(entry);
    expect(calls.leases).toHaveBeenCalledTimes(runtime ? 1 : 0);
    expect(calls.native).toHaveBeenCalledTimes(move ? 1 : 0);
    const runtimeBuild = calls.build.mock.calls.find(([options]) =>
      options.outdir?.endsWith("extension-runtime"),
    );
    if (runtime) {
      expect(runtimeBuild?.[0]).toMatchObject({
        entryPoints: {
          index: "src/extension-runtime/electron-runtime.ts",
          bootstrap: "src/extension-runtime/bootstrap.ts",
          packages: "src/installed-packages/installed-packages.ts",
        },
        external: ["electron", "yauzl", "semver"],
        outExtension: { ".js": ".mjs" },
      });
    } else expect(runtimeBuild).toBeUndefined();
  },
);

it("unpacks the macOS lease addon explicitly with smart unpacking disabled", () => {
  const config = parse(readFileSync("electron-builder.yml", "utf8")) as {
    asar: { smartUnpack: boolean };
    mac: { asarUnpack: string[] };
  };
  expect(config.asar.smartUnpack).toBe(false);
  expect(config.mac.asarUnpack).toContain(
    "dist/extension-runtime/extension-leases.node",
  );
  expect(config.mac.asarUnpack).not.toContain(
    "dist/extension-runtime/files-move.node",
  );
});
