import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { inspectChecksumRecord } from "../../scripts/verify-packaged-app.mjs";
import {
  checksumContents,
  linuxAppImageName,
  linuxArtifactName,
  linuxHelperName,
  packageLinuxAssets,
  renderLinuxHelper,
} from "../../scripts/package-linux-assets.mjs";

const require = createRequire(import.meta.url);
// The pinned packager's own per-format architecture naming. These internal
// exports lack declarations; an upgrade must requalify this seam.
const { Arch, getArtifactArchName } = require("builder-util/out/arch.js") as {
  Arch: Record<"arm64" | "x64", number>;
  getArtifactArchName: (arch: number, extension: string) => string;
};

describe("Linux release assets", () => {
  it("keeps the AppImage versioned and the helper filename stable", () => {
    expect(linuxAppImageName("0.11.0-dev.0", "arm64")).toBe(
      "OMXTerm-0.11.0-dev.0-arm64.AppImage",
    );
    expect(linuxAppImageName("0.11.0-dev.0", "x64")).toBe(
      "OMXTerm-0.11.0-dev.0-x86_64.AppImage",
    );
    expect(linuxHelperName()).toBe("linux_install.sh");
  });

  it.each([
    ["arm64", "AppImage", "OMXTerm-1.2.3-arm64.AppImage"],
    ["x64", "AppImage", "OMXTerm-1.2.3-x86_64.AppImage"],
    ["arm64", "deb", "OMXTerm-1.2.3-arm64.deb"],
    ["x64", "deb", "OMXTerm-1.2.3-amd64.deb"],
    ["arm64", "rpm", "OMXTerm-1.2.3-aarch64.rpm"],
    ["x64", "rpm", "OMXTerm-1.2.3-x86_64.rpm"],
  ] as const)(
    "names the %s %s artifact exactly as the pinned packager does",
    (arch, extension, expected) => {
      expect(linuxArtifactName("1.2.3", arch, extension)).toBe(expected);
      expect(
        `OMXTerm-1.2.3-${getArtifactArchName(Arch[arch], extension)}.${extension}`,
      ).toBe(expected);
    },
  );

  it("rejects unsupported Linux architectures and formats", () => {
    expect(() => linuxArtifactName("1.2.3", "ia32", "deb")).toThrow(
      "arm64 or x64",
    );
    expect(() =>
      linuxArtifactName("1.2.3", "x64", "snap" as unknown as "deb"),
    ).toThrow("Unsupported Linux package format");
  });

  it("embeds exactly the package version in the helper", () => {
    expect(
      renderLinuxHelper("version=@OMXTERM_VERSION@\n", "0.11.0-dev.0"),
    ).toBe("version=0.11.0-dev.0\n");
    expect(() => renderLinuxHelper("no marker", "0.11.0-dev.0")).toThrow(
      "exactly one",
    );
  });

  it.each(["arm64", "x64"])(
    "materializes the exact helper and both checksum assets for %s",
    async (arch) => {
      const output = await mkdtemp(
        path.join(tmpdir(), "omxterm-linux-assets-"),
      );
      const { version } = JSON.parse(
        await readFile(new URL("../../package.json", import.meta.url), "utf8"),
      ) as { version: string };
      const appImageName = linuxAppImageName(version, arch);
      const helperName = linuxHelperName();
      try {
        await writeFile(path.join(output, appImageName), "appimage");
        await packageLinuxAssets(output, arch);

        expect(
          await readFile(path.join(output, `${appImageName}.sha256`), "utf8"),
        ).toContain(`  ${appImageName}\n`);
        expect(await readFile(path.join(output, helperName), "utf8")).toContain(
          `VERSION='${version}'`,
        );
        expect(
          await readFile(path.join(output, `${helperName}.sha256`), "utf8"),
        ).toContain(`  ${helperName}\n`);
      } finally {
        await rm(output, { recursive: true, force: true });
      }
    },
  );

  it("writes and verifies a sha256sum-compatible exact filename record", () => {
    const contents = Buffer.from("asset");
    const digest = createHash("sha256").update(contents).digest("hex");
    expect(checksumContents("asset.sh", contents)).toBe(
      `${digest}  asset.sh\n`,
    );
    expect(() =>
      inspectChecksumRecord(`${digest}  asset.sh\n`, "asset.sh", digest),
    ).not.toThrow();
    expect(() =>
      inspectChecksumRecord(`${digest}  renamed.sh\n`, "asset.sh", digest),
    ).toThrow("exact asset asset.sh");
  });
});
