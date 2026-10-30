import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { buildFilesExtension } from "../../scripts/build-files-extension.mjs";
import {
  extractPackage,
  checkCompatibility,
} from "../../src/installed-packages/archive";

// Headless but invokes the maintainer's esbuild/Python toolchain. It is not a
// prerequisite for users or an implicit new default-test Python requirement.
it.skipIf(process.env.OMXTERM_FILES_BUILD !== "1")(
  "builds a separate archive with truthful metadata and refuses output replacement",
  async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), "omxterm-files-artifact-"),
    );
    try {
      const host = JSON.parse(await readFile("package.json", "utf8")) as {
        version: string;
      };
      const output = path.join(root, "files.omxext");
      const commit = "a".repeat(40);
      const receipt = await buildFilesExtension(output, commit);
      const bytes = await readFile(output);
      const digest = createHash("sha256").update(bytes).digest("hex");
      expect(receipt.archive).toEqual({
        name: "files.omxext",
        bytes: bytes.length,
        sha256: digest,
      });
      expect(receipt.source.commit).toBe(commit);
      expect(receipt.source.identity).toBe("supplied-commit");
      expect(receipt.source.lockSha256).toBe(
        createHash("sha256")
          .update(await readFile("package-lock.json"))
          .digest("hex"),
      );
      expect(receipt.tools).toMatchObject({ node: process.version });
      expect(receipt.tools.python).toMatch(/^Python 3\./);
      expect(receipt.qualification).toEqual({
        status: "not-run",
        intendedHost: host.version,
        target: "linux-arm64",
      });
      expect(JSON.parse(await readFile(output + ".json", "utf8"))).toEqual(
        receipt,
      );
      expect(await readFile(output + ".sha256", "utf8")).toBe(
        `${digest}  files.omxext\n`,
      );
      const extracted = path.join(root, "extracted");
      await mkdir(extracted);
      const validated = await extractPackage(bytes, extracted, {
        appVersion: host.version,
        apiVersion: "0.1.0",
      });
      expect(validated).toEqual({ digest, manifest: receipt.manifest });
      expect(() =>
        checkCompatibility(validated.manifest, {
          appVersion: "0.24.0-dev.3",
          apiVersion: "0.1.0",
        }),
      ).toThrow("incompatible");
      expect(await readFile(path.join(extracted, "LICENSE"), "utf8")).toContain(
        "MIT License",
      );
      await expect(buildFilesExtension(output, commit)).rejects.toThrow();
      expect(await readFile(output)).toEqual(bytes);
      const collision = path.join(root, "collision.omxext");
      await writeFile(collision + ".json", "preserved");
      await expect(buildFilesExtension(collision, commit)).rejects.toThrow();
      expect(await readFile(collision + ".json", "utf8")).toBe("preserved");
      await expect(readFile(collision)).rejects.toMatchObject({
        code: "ENOENT",
      });
      await expect(readFile(collision + ".sha256")).rejects.toMatchObject({
        code: "ENOENT",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
