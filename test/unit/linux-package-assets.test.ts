import { createHash } from "node:crypto";
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
      await writeFile(
        path.join(output, linuxAppImageName(version, "x64")),
        "x64-appimage",
      );
      await packageLinuxAssets(output, "x64");
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
