import { createRequire } from "node:module";
import path from "node:path";
import { getConfig } from "app-builder-lib/out/util/config/config.js";
import { describe, expect, it } from "vitest";

const require = createRequire(import.meta.url);
// Exercise the pinned packager's real matchers and macro expansion, not a copy
// of their semantics. These internal exports lack declarations; an upgrade
// must requalify this seam.
type Filter = (
  file: string,
  stat: { moduleFullFilePath?: string; isDirectory(): boolean },
) => boolean;
type Matcher = { createFilter(): Filter };
const { getNodeModuleFileMatcher, getFileMatchers } =
  require("app-builder-lib/out/fileMatcher.js") as {
    getNodeModuleFileMatcher: (
      appDir: string,
      destination: string,
      macroExpander: (pattern: string) => string,
      platformOptions: object,
      packager: object,
    ) => Matcher;
    getFileMatchers: (
      config: object,
      name: string,
      destination: string,
      options: object,
    ) => Matcher[] | null;
  };
const { expandMacro } =
  require("app-builder-lib/out/util/macroExpander.js") as {
    expandMacro: (pattern: string, arch: string, appInfo: object) => string;
  };

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const destination = path.join(repositoryRoot, "release", "app");
const architectures = ["arm64", "x64"] as const;
type Architecture = (typeof architectures)[number];
const other = (arch: Architecture) => (arch === "arm64" ? "x64" : "arm64");

async function builderConfig() {
  return (await getConfig(
    repositoryRoot,
    "electron-builder.yml",
    null,
  )) as unknown as Record<string, Record<string, unknown>>;
}

async function filters(platform: "mac" | "win" | "linux", arch: Architecture) {
  const config = await builderConfig();
  const platformOptions = config[platform] ?? {};
  const macroExpander = (pattern: string) => expandMacro(pattern, arch, {});
  const moduleFilter = getNodeModuleFileMatcher(
    repositoryRoot,
    destination,
    macroExpander,
    platformOptions,
    { config, debugLogger: { isEnabled: false } },
  ).createFilter();
  const unpackMatcher = getFileMatchers(config, "asarUnpack", destination, {
    macroExpander,
    customBuildOptions: platformOptions,
    globalOutDir: path.join(repositoryRoot, "release"),
    defaultSrc: repositoryRoot,
  })?.[0];
  if (!unpackMatcher) throw new Error(`No asarUnpack patterns for ${platform}`);
  const unpackFilter = unpackMatcher.createFilter();
  const stat = (entry: string) => ({
    moduleFullFilePath: entry,
    isDirectory: () => !path.extname(entry),
  });
  return {
    // node_modules are filtered by their path inside the application.
    packaged: (entry: string) =>
      moduleFilter(path.join(repositoryRoot, entry), stat(entry)),
    unpacked: (entry: string) =>
      unpackFilter(path.join(repositoryRoot, entry), {
        isDirectory: () => false,
      }),
  };
}

const prebuild = (platform: string, arch: string, file: string) =>
  `node_modules/node-pty/prebuilds/${platform}-${arch}/${file}`;

describe("per-architecture package file patterns", () => {
  it.each(architectures)(
    "macOS %s packages and unpacks only its own node-pty prebuild",
    // Directory entries pass these filters, as with the previous literal
    // per-architecture patterns; the files inside them are excluded.
    async (arch) => {
      const { packaged, unpacked } = await filters("mac", arch);
      for (const file of ["pty.node", "spawn-helper"]) {
        expect(packaged(prebuild("darwin", arch, file))).toBe(true);
        expect(unpacked(prebuild("darwin", arch, file))).toBe(true);
        expect(packaged(prebuild("darwin", other(arch), file))).toBe(false);
        expect(unpacked(prebuild("darwin", other(arch), file))).toBe(false);
      }
      for (const windowsArch of architectures)
        expect(packaged(prebuild("win32", windowsArch, "pty.node"))).toBe(
          false,
        );
      expect(packaged("node_modules/node-pty/build/Release/pty.node")).toBe(
        false,
      );
      expect(packaged("node_modules/node-pty/lib/index.js")).toBe(true);
    },
  );

  it.each(architectures)(
    "Windows %s packages and unpacks only its own prebuild without symbols",
    async (arch) => {
      const { packaged, unpacked } = await filters("win", arch);
      for (const file of [
        "pty.node",
        "conpty.node",
        "conpty/OpenConsole.exe",
      ]) {
        expect(packaged(prebuild("win32", arch, file))).toBe(true);
        expect(unpacked(prebuild("win32", arch, file))).toBe(true);
        expect(packaged(prebuild("win32", other(arch), file))).toBe(false);
        expect(unpacked(prebuild("win32", other(arch), file))).toBe(false);
      }
      expect(packaged(prebuild("win32", arch, "pty.pdb"))).toBe(false);
      for (const macArch of architectures)
        expect(packaged(prebuild("darwin", macArch, "pty.node"))).toBe(false);
      expect(packaged("node_modules/node-pty/build/Release/pty.node")).toBe(
        false,
      );
    },
  );

  it.each(architectures)(
    "Linux %s ships only the host-built node-pty module",
    async (arch) => {
      const { packaged, unpacked } = await filters("linux", arch);
      expect(packaged("node_modules/node-pty/build/Release/pty.node")).toBe(
        true,
      );
      expect(unpacked("node_modules/node-pty/build/Release/pty.node")).toBe(
        true,
      );
      for (const [platform, prebuildArch] of [
        ["darwin", "arm64"],
        ["darwin", "x64"],
        ["win32", "arm64"],
        ["win32", "x64"],
      ])
        expect(packaged(prebuild(platform!, prebuildArch!, "pty.node"))).toBe(
          false,
        );
      expect(
        packaged("node_modules/node-pty/build/Release/obj.target/pty.o"),
      ).toBe(false);
    },
  );
});

describe("Linux system package configuration", () => {
  it.each(["deb", "rpm"])(
    "%s launches without the Chromium sandbox and replaces privileged install scripts",
    async (format) => {
      const options = (await builderConfig())[format] ?? {};
      expect(options["executableArgs"]).toEqual(["--no-sandbox"]);
      expect(options["afterInstall"]).toBe("packaging/linux/after-install.tpl");
      expect(options["afterRemove"]).toBe("packaging/linux/after-remove.tpl");
      expect(options["fpm"]).toContain(
        "packaging/linux/omxterm=/usr/bin/omxterm",
      );
      expect(options["depends"]).toContain("fontconfig");
    },
  );

  it("recommends the OpenSSH client in each package format", async () => {
    const config = await builderConfig();
    expect(config["deb"]?.["recommends"]).toEqual(["openssh-client"]);
    expect(config["rpm"]?.["fpm"]).toEqual(
      expect.arrayContaining(["--rpm-tag", "Recommends: openssh-clients"]),
    );
  });

  it("builds RPMs without host-dependent build-id links", async () => {
    expect((await builderConfig())["rpm"]?.["fpm"]).toEqual(
      expect.arrayContaining(["--rpm-rpmbuild-define", "_build_id_links none"]),
    );
  });

  it("embeds no automatic-update metadata in Linux packages", async () => {
    const linux = (await builderConfig())["linux"] ?? {};
    expect(Object.hasOwn(linux, "publish")).toBe(true);
    expect(linux["publish"]).toBeNull();
  });
});
