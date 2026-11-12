import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { buildExtension } from "../../scripts/build-files-extension.mjs";
import {
  extractPackage,
  parseManifest,
} from "../../src/installed-packages/archive";

it("rejects non-string capability declarations rather than coercing them", async () => {
  const manifest: unknown = JSON.parse(
    await readFile("extensions/restoration/extension.json", "utf8"),
  );
  for (const capabilities of [
    [["state.v1"]],
    [["state.v1"], ["state.v1"]],
    [null],
    [1],
    [{ name: "state.v1" }],
  ])
    expect(() =>
      parseManifest({ ...(manifest as object), capabilities }),
    ).toThrow("invalid-package");
});

// Maintainer-only esbuild/Python composition, no Electron/native addon/GUI.
it.skipIf(process.env.OMXTERM_RESTORATION_BUILD !== "1")(
  "builds and validates a licensed separate archive without replacing existing outputs",
  async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), "omxterm-restoration-build-"),
    );
    try {
      const output = path.join(root, "restoration.omxext");
      const receipt = await buildExtension(
        "restoration",
        output,
        "a".repeat(40),
      );
      const bytes = await readFile(output);
      const digest = createHash("sha256").update(bytes).digest("hex");
      expect(receipt.archive.sha256).toBe(digest);
      expect(receipt.source.identity).toBe("supplied-commit");
      expect(receipt.qualification.status).toBe("not-run");
      expect(await readFile(output + ".sha256", "utf8")).toBe(
        `${digest}  restoration.omxext\n`,
      );
      const extracted = path.join(root, "extracted");
      await mkdir(extracted);
      const validated = await extractPackage(bytes, extracted, {
        appVersion: "0.28.0",
        apiVersion: "0.1.0",
      });
      expect(validated.manifest).toEqual(receipt.manifest);
      expect(await readFile(path.join(extracted, "LICENSE"), "utf8")).toBe(
        await readFile("LICENSE", "utf8"),
      );
      expect(
        await readFile(path.join(extracted, "licenses/ashyterm.txt"), "utf8"),
      ).toBe(await readFile("assets/licenses/ashyterm-MIT.txt", "utf8"));
      expect(await readFile(path.join(extracted, "NOTICE"), "utf8")).toContain(
        "b3c3a4ad6c1f2224bded65873ba0b09a07ec5d38",
      );
      expect(
        await readFile(path.join(extracted, "index.html"), "utf8"),
      ).toContain("restoration.css");
      expect(await readFile(path.join(extracted, "view.js"), "utf8")).toContain(
        "terminal.captureLayout.v1",
      );
      expect(
        await readFile(path.join(extracted, "backend.mjs"), "utf8"),
      ).not.toContain("node:fs");
      await expect(
        buildExtension("restoration", output, "a".repeat(40)),
      ).rejects.toThrow();
      expect(await readFile(output)).toEqual(bytes);
      const collision = path.join(root, "collision.omxext");
      await writeFile(collision + ".json", "preserved");
      await expect(
        buildExtension("restoration", collision, "a".repeat(40)),
      ).rejects.toThrow();
      expect(await readFile(collision + ".json", "utf8")).toBe("preserved");
      await expect(readFile(collision)).rejects.toMatchObject({
        code: "ENOENT",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
