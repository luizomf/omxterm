import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  checksumListName,
  packagingArchitecture,
  packagingPlan,
  writeChecksums,
} from "../../scripts/package.mjs";

const repositoryRoot = path.resolve(import.meta.dirname, "../..");
const readRepositoryFile = (file: string) =>
  readFileSync(path.join(repositoryRoot, file), "utf8");
const builder = (...args: string[]) => [
  "--config",
  "electron-builder.yml",
  ...args,
  "--publish",
  "never",
];

describe("per-architecture packaging plan", () => {
  it.each(["arm64", "x64"])("packages %s natively", (arch) => {
    expect(packagingArchitecture(arch)).toBe(arch);
  });

  it.each(["ia32", "arm"])("refuses %s hosts", (arch) => {
    expect(() => packagingArchitecture(arch)).toThrow("arm64 or x64");
    expect(() => packagingPlan("linux", arch, "1.2.3")).toThrow("arm64 or x64");
  });

  it.each(["arm64", "x64"])("builds the %s macOS DMG", (arch) => {
    expect(packagingPlan("mac", arch, "1.2.3")).toEqual({
      steps: [{ builder: builder("--mac", "dmg", `--${arch}`) }],
      artifacts: [`OMXTerm-1.2.3-${arch}.dmg`],
    });
  });

  it.each(["arm64", "x64"])("builds the %s Windows installer", (arch) => {
    expect(packagingPlan("win", arch, "1.2.3")).toEqual({
      steps: [{ builder: builder("--win", "nsis", `--${arch}`) }],
      artifacts: [`OMXTerm-1.2.3-${arch}.exe`],
    });
  });

  it.each([
    ["arm64", "linux-arm64-unpacked", "arm64", "arm64", "aarch64"],
    ["x64", "linux-unpacked", "x86_64", "amd64", "x86_64"],
  ])(
    "builds the %s AppImage first, then DEB and RPM from its unpacked application",
    (arch, unpacked, appImage, deb, rpm) => {
      expect(packagingPlan("linux", arch, "1.2.3")).toEqual({
        steps: [
          { task: "prepare-linux-launcher" },
          { builder: builder("--linux", "AppImage", `--${arch}`) },
          { task: "package-linux-assets" },
          {
            builder: [
              ...builder("--linux", "deb", "rpm", `--${arch}`),
              "--prepackaged",
              path.join("release", unpacked),
            ],
          },
        ],
        artifacts: [
          `OMXTerm-1.2.3-${appImage}.AppImage`,
          "linux_install.sh",
          `OMXTerm-1.2.3-${deb}.deb`,
          `OMXTerm-1.2.3-${rpm}.rpm`,
        ],
      });
    },
  );

  it("rejects an unknown platform", () => {
    expect(() => packagingPlan("freebsd", "x64", "1.2.3")).toThrow("Usage");
  });
});

describe("release checksums", () => {
  it("writes a sha256sum-compatible list and a record per artifact", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "omxterm-checksums-"));
    try {
      await writeFile(path.join(root, "a.deb"), "deb");
      await writeFile(path.join(root, "b.rpm"), "rpm");
      const list = await writeChecksums(
        "linux",
        "x64",
        ["a.deb", "b.rpm"],
        root,
      );
      const digest = (value: string) =>
        createHash("sha256").update(value).digest("hex");
      expect(path.basename(list)).toBe("SHA256SUMS-linux-x64.txt");
      expect(await readFile(list, "utf8")).toBe(
        `${digest("deb")}  a.deb\n${digest("rpm")}  b.rpm\n`,
      );
      expect(await readFile(path.join(root, "a.deb.sha256"), "utf8")).toBe(
        `${digest("deb")}  a.deb\n`,
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it("fails when an expected artifact is missing", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "omxterm-checksums-"));
    try {
      await expect(
        writeChecksums("mac", "arm64", ["missing.dmg"], root),
      ).rejects.toThrow();
      await expect(
        stat(path.join(root, checksumListName("mac", "arm64"))),
      ).rejects.toThrow();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});

describe("Linux system package launchers", () => {
  it("passes --no-sandbox before every user argument (ADR 0024)", async () => {
    const launcher = readRepositoryFile("packaging/linux/omxterm");
    expect(launcher.startsWith("#!/bin/sh\n")).toBe(true);
    expect(launcher).toMatch(
      /^exec \/opt\/OMXTerm\/omxterm --no-sandbox "\$@"$/mu,
    );
    // An inherited ELECTRON_RUN_AS_NODE would start Electron as Node.js.
    expect(launcher).toMatch(/^unset ELECTRON_RUN_AS_NODE$/mu);
    // Executable in the checkout, so fpm installs it as 0755.
    const { mode } = await stat(
      path.join(repositoryRoot, "packaging/linux/omxterm"),
    );
    if (process.platform !== "win32") expect(mode & 0o111).toBe(0o111);
  });

  it.each(["after-install.tpl", "after-remove.tpl"])(
    "%s changes no system security policy and uses no packager macros",
    (file) => {
      const script = readRepositoryFile(`packaging/linux/${file}`);
      const commands = script
        .split("\n")
        .filter((line) => !line.startsWith("#"))
        .join("\n");
      expect(commands).not.toMatch(/4755|u\+s|update-alternatives|apparmor/iu);
      // electron-builder expands ${name} macros and rejects unknown ones.
      expect(script).not.toContain("${");
    },
  );
});

describe("Arch Linux PKGBUILD", () => {
  const pkgbuild = readRepositoryFile("packaging/arch/PKGBUILD");
  const field = (name: string) =>
    new RegExp(`^${name}=(.+)$`, "mu").exec(pkgbuild)?.[1];
  const { version } = JSON.parse(readRepositoryFile("package.json")) as {
    version: string;
  };

  it("tracks the npm package version without a pkgver() rewrite", () => {
    expect(field("pkgver")).toBe(version.replaceAll("-", ""));
    expect(pkgbuild).not.toMatch(/^pkgver\(\)/mu);
  });

  it("builds both supported architectures from this source tree", () => {
    expect(field("arch")).toBe("('x86_64' 'aarch64')");
    expect(pkgbuild).toContain("--no-sandbox");
    expect(pkgbuild).toContain("/usr/lib/omxterm");
  });
});
