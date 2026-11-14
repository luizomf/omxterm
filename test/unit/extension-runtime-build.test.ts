import { afterEach, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import type { BuildOptions } from "esbuild";

const calls = vi.hoisted(() => ({
  build: vi.fn<(options: BuildOptions) => Promise<void>>(),
  leases: vi.fn(),
  native:
    vi.fn<
      (
        command: string,
        args: string[],
        options: { stdio: "pipe"; timeout: number },
      ) => void
    >(),
  blur: vi.fn(),
  optionShortcut: vi.fn(),
  agentLauncher: vi.fn(),
}));
vi.mock("esbuild", () => ({ build: calls.build }));
vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn(),
  rm: vi.fn(),
  cp: vi.fn(),
  chmod: vi.fn(),
  writeFile: vi.fn(),
}));
vi.mock("node:child_process", () => ({ execFileSync: calls.native }));
vi.mock("../../scripts/build-extension-leases.mjs", () => ({
  buildExtensionLeases: calls.leases,
}));
vi.mock("../../scripts/build-macos-window-blur.mjs", () => ({
  buildMacOSWindowBlur: calls.blur,
}));
vi.mock("../../scripts/build-macos-option-shortcut.mjs", () => ({
  buildMacOSOptionShortcut: calls.optionShortcut,
}));
vi.mock("../../scripts/build-agent-ctl-launcher.mjs", () => ({
  buildAgentCtlLauncher: calls.agentLauncher,
}));
vi.mock("../../scripts/windows-msvc-environment.mjs", () => ({
  resolveMsvcEnvironment: () => ({ MSVC: "1" }),
}));

const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
const arch = Object.getOwnPropertyDescriptor(process, "arch")!;
afterEach(() => {
  Object.defineProperty(process, "platform", platform);
  Object.defineProperty(process, "arch", arch);
  vi.unstubAllEnvs();
  vi.clearAllMocks();
  vi.resetModules();
});

it.each([
  ["darwin", "arm64", true, true],
  ["linux", "arm64", true, true],
  ["linux", "x64", true, true],
  ["win32", "arm64", true, true],
  ["win32", "x64", true, true],
  ["darwin", "x64", false, false],
])(
  "ordinary %s %s build selects runtime=%s Files move=%s",
  async (os, cpu, runtime, move) => {
    Object.defineProperty(process, "platform", { value: os });
    Object.defineProperty(process, "arch", { value: cpu });
    vi.stubEnv("OMXTERM_NODE_IMPORT_LIBRARY", "/toolchain/node.lib");
    // Import the real orchestration and Files builder with all effectful seams mocked.
    const entry = "../../build.mjs";
    await import(entry);
    expect(calls.optionShortcut).toHaveBeenCalledOnce();
    // The agent client's console launcher is Windows-only.
    expect(calls.agentLauncher).toHaveBeenCalledTimes(os === "win32" ? 1 : 0);
    expect(calls.leases).toHaveBeenCalledTimes(runtime ? 1 : 0);
    expect(calls.native).toHaveBeenCalledTimes(move ? 1 : 0);
    if (move) {
      // Only the platform's system trash source joins the shared move source.
      const sources = calls.native.mock.calls[0]![1].filter((arg) =>
        /[/\\]native[/\\]files-[a-z-]+\.(?:cc|mm)$/u.test(arg),
      );
      expect(sources.map((source) => path.basename(source))).toEqual([
        "files-move.cc",
        ...(os === "darwin" ? ["files-trash-macos.mm"] : []),
        ...(os === "win32" ? ["files-windows.cc"] : []),
      ]);
    }
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

it.each(["mac", "linux", "win"] as const)(
  "unpacks the %s lease and Files move addons explicitly with smart unpacking disabled",
  (platform) => {
    const config = parse(readFileSync("electron-builder.yml", "utf8")) as {
      asar: { smartUnpack: boolean };
      mac: { asarUnpack: string[] };
      linux: { asarUnpack: string[] };
      win: { asarUnpack: string[] };
    };
    expect(config.asar.smartUnpack).toBe(false);
    expect(config[platform].asarUnpack).toContain(
      "dist/extension-runtime/extension-leases.node",
    );
    expect(config[platform].asarUnpack).toContain(
      "dist/extension-runtime/files-move.node",
    );
  },
);
