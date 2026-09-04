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
  it("derives exact versioned AppImage and helper names", () => {
    expect(linuxAppImageName("0.10.0")).toBe("OMXTerm-0.10.0-arm64.AppImage");
    expect(linuxHelperName("0.10.0")).toBe(
      "OMXTerm-0.10.0-arm64.AppImage-installer.sh",
    );
  });

  it("embeds exactly the package version in the helper", () => {
    expect(renderLinuxHelper("version=@OMXTERM_VERSION@\n", "0.10.0")).toBe(
      "version=0.10.0\n",
    );
    expect(() => renderLinuxHelper("no marker", "0.10.0")).toThrow(
      "exactly one",
    );
  });

  it("materializes the exact helper and both checksum assets", async () => {
    const output = await mkdtemp(path.join(tmpdir(), "omxterm-linux-assets-"));
    const appImageName = linuxAppImageName("0.10.0");
    const helperName = linuxHelperName("0.10.0");
    try {
      await writeFile(path.join(output, appImageName), "appimage");
      await packageLinuxAssets(output);

      expect(
        await readFile(path.join(output, `${appImageName}.sha256`), "utf8"),
      ).toContain(`  ${appImageName}\n`);
      expect(await readFile(path.join(output, helperName), "utf8")).toContain(
        "VERSION='0.10.0'",
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
