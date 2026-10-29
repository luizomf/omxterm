import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { buildMirrorTypingExtension } from "../../scripts/build-mirror-typing-extension.mjs";
import {
  checkCompatibility,
  extractPackage,
  parseManifest,
} from "../../src/installed-packages/archive";

it("declares only memory-only mirror authority for the implementing host and API preview", async () => {
  const manifest = parseManifest(
    JSON.parse(
      await readFile("extensions/mirror-typing/extension.json", "utf8"),
    ),
  );
  expect(manifest).toMatchObject({
    id: "omxterm.mirror-typing",
    name: "Mirror Typing",
    version: "0.1.0",
    capabilities: ["terminal.mirrorTyping.v1"],
    view: { context: "window", action: "omxterm.mirror-typing.open" },
  });
  for (const appVersion of ["0.24.0-dev.0", "0.24.0-dev.1", "0.25.0"])
    expect(() =>
      checkCompatibility(manifest, { appVersion, apiVersion: "0.1.0" }),
    ).toThrow("incompatible");
  expect(() =>
    checkCompatibility(manifest, {
      appVersion: "0.24.0-dev.2",
      apiVersion: "0.1.0",
    }),
  ).not.toThrow();
  expect(() =>
    checkCompatibility(manifest, {
      appVersion: "0.24.0-dev.2",
      apiVersion: "0.2.0",
    }),
  ).toThrow("incompatible");
  expect(
    await readFile("extensions/mirror-typing/licenses/ashyterm.txt", "utf8"),
  ).toBe(await readFile("assets/licenses/ashyterm-MIT.txt", "utf8"));
});

// Parent-owned archive qualification after integrating the capability allowlist.
it.skipIf(process.env.OMXTERM_MIRROR_TYPING_BUILD !== "1")(
  "builds a licensed separate archive with shared styles and no-clobber receipts",
  async () => {
    const root = await mkdtemp(
      path.join(os.tmpdir(), "omxterm-mirror-build-test-"),
    );
    try {
      const output = path.join(root, "mirror.omxext");
      const receipt = await buildMirrorTypingExtension(output, "a".repeat(40));
      const bytes = await readFile(output);
      const digest = createHash("sha256").update(bytes).digest("hex");
      expect(receipt.archive.sha256).toBe(digest);
      expect(receipt.source.identity).toBe("supplied-commit");
      expect(receipt.qualification.status).toBe("not-run");
      expect(await readFile(output + ".sha256", "utf8")).toBe(
        `${digest}  mirror.omxext\n`,
      );
      const extracted = path.join(root, "extracted");
      await mkdir(extracted);
      const validated = await extractPackage(bytes, extracted, {
        appVersion: "0.24.0-dev.2",
        apiVersion: "0.1.0",
      });
      expect(validated.manifest).toEqual(receipt.manifest);
      expect(await readFile(path.join(extracted, "LICENSE"), "utf8")).toBe(
        await readFile("LICENSE", "utf8"),
      );
      expect(
        await readFile(path.join(extracted, "licenses/ashyterm.txt"), "utf8"),
      ).toBe(await readFile("assets/licenses/ashyterm-MIT.txt", "utf8"));
      const notice = await readFile(path.join(extracted, "NOTICE"), "utf8");
      for (const credit of [
        "Rafael Ruscher (@ruscher)",
        "Community Big",
        "BigLinux",
        "AshyTerm",
      ])
        expect(notice).toContain(credit);
      const css = await readFile(
        path.join(extracted, "mirror-typing.css"),
        "utf8",
      );
      expect(css).toContain(".application-page-header");
      expect(css).toContain("--ui-input-border:");
      expect(css).not.toContain("@import");
      const view = await readFile(path.join(extracted, "view.js"), "utf8");
      expect(view).toContain("terminal.mirrorTyping.v1");
      expect(view).not.toContain("localStorage");
      await expect(
        buildMirrorTypingExtension(output, "a".repeat(40)),
      ).rejects.toThrow();
      expect(await readFile(output)).toEqual(bytes);
      const collision = path.join(root, "collision.omxext");
      await writeFile(collision + ".json", "preserved");
      await expect(
        buildMirrorTypingExtension(collision, "a".repeat(40)),
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
