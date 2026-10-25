import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { Arch, getArtifactArchName } from "builder-util";
import { expandMacro } from "app-builder-lib/out/util/macroExpander";
import { parse } from "yaml";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { inspectChecksumRecord } from "../../scripts/verify-packaged-app.mjs";
import {
  checksumContents,
  linuxAppImageName,
  linuxHelperName,
  packageLinuxAssets,
  renderLinuxHelper,
} from "../../scripts/package-linux-assets.mjs";

describe("Linux release assets", () => {
  it("keeps the AppImage versioned and the helper filename stable", () => {
    expect(linuxAppImageName("0.11.0-dev.0")).toBe(
      "OMXTerm-0.11.0-dev.0-arm64.AppImage",
    );
    expect(linuxAppImageName("1.2.3", "x64")).toBe(
      "OMXTerm-1.2.3-x64.AppImage",
    );
    // External CLI input must fail before writing any files.
    expect(() => linuxAppImageName("1.2.3", "ia32" as "x64")).toThrow(
      "architecture",
    );
    expect(linuxHelperName()).toBe("linux_install.sh");
  });

  it("embeds exactly the package version in the helper", () => {
    expect(
      renderLinuxHelper("version=@OMXTERM_VERSION@\n", "0.11.0-dev.0"),
    ).toBe("version=0.11.0-dev.0\n");
    expect(() => renderLinuxHelper("no marker", "0.11.0-dev.0")).toThrow(
      "exactly one",
    );
  });

  it("materializes the exact helper and both checksum assets", async () => {
    const output = await mkdtemp(path.join(tmpdir(), "omxterm-linux-assets-"));
    const { version } = JSON.parse(
      await readFile(new URL("../../package.json", import.meta.url), "utf8"),
    ) as { version: string };
    const appImageName = linuxAppImageName(version);
    const helperName = linuxHelperName();
    try {
      await writeFile(path.join(output, appImageName), "appimage");
      await packageLinuxAssets(output);
      const originalHelper = await readFile(path.join(output, helperName));
      const originalChecksum = await readFile(
        path.join(output, `${helperName}.sha256`),
      );
      // Exercise the pinned builder's actual AppImage macro expansion, not our
      // canonical filename function: AppImageTarget.build passes "AppImage".
      const config = parse(
        readFileSync(
          new URL("../../electron-builder.yml", import.meta.url),
          "utf8",
        ),
      ) as { artifactName: string };
      const builderName = expandMacro(
        config.artifactName,
        getArtifactArchName(Arch.x64, "AppImage"),
        { sanitizedProductName: "OMXTerm", version } as Parameters<
          typeof expandMacro
        >[2],
        { ext: "AppImage" },
      );
      expect(builderName).toBe(`OMXTerm-${version}-x86_64.AppImage`);
      expect(getArtifactArchName(Arch.arm64, "AppImage")).toBe("arm64");
      await writeFile(path.join(output, builderName), "x64-appimage");
      await packageLinuxAssets(output, "x64");
      expect(
        await readFile(
          path.join(output, linuxAppImageName(version, "x64")),
          "utf8",
        ),
      ).toBe("x64-appimage");
      await expect(
        readFile(path.join(output, builderName)),
      ).rejects.toMatchObject({ code: "ENOENT" });
      inspectChecksumRecord(
        await readFile(
          path.join(output, `${linuxAppImageName(version, "x64")}.sha256`),
          "utf8",
        ),
        linuxAppImageName(version, "x64"),
        createHash("sha256").update("x64-appimage").digest("hex"),
      );
      expect(await readFile(path.join(output, helperName))).toEqual(
        originalHelper,
      );
      expect(await readFile(path.join(output, `${helperName}.sha256`))).toEqual(
        originalChecksum,
      );
      expect(
        await readFile(
          path.join(output, `${linuxAppImageName(version, "x64")}.sha256`),
          "utf8",
        ),
      ).toContain(`  ${linuxAppImageName(version, "x64")}\n`);

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
  });

  it("refuses old-version aliases or a canonical leftover without the current builder output", async () => {
    const output = await mkdtemp(path.join(tmpdir(), "omxterm-linux-alias-"));
    const { version } = JSON.parse(
      await readFile(new URL("../../package.json", import.meta.url), "utf8"),
    ) as { version: string };
    try {
      const old = path.join(output, "OMXTerm-0.0.0-x86_64.AppImage");
      const canonical = path.join(output, linuxAppImageName(version, "x64"));
      await writeFile(old, "old-version");
      await writeFile(canonical, "leftover");
      await expect(packageLinuxAssets(output, "x64")).rejects.toMatchObject({
        code: "ENOENT",
      });
      expect(await readFile(old, "utf8")).toBe("old-version");
      expect(await readFile(canonical, "utf8")).toBe("leftover");
      await expect(readFile(`${canonical}.sha256`)).rejects.toMatchObject({
        code: "ENOENT",
      });
    } finally {
      await rm(output, { recursive: true, force: true });
    }
  });

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
