import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import { buildExtension } from "../../scripts/build-files-extension.mjs";
import {
  checkCompatibility,
  extractPackage,
  parseManifest,
} from "../../src/installed-packages/archive";

it("declares window-scoped state and layout capabilities without changing saved data identity", async () => {
  const manifest = parseManifest(
    JSON.parse(await readFile("extensions/restoration/extension.json", "utf8")),
  );
  expect(manifest).toMatchObject({
    id: "omxterm.restoration",
    version: "0.1.1",
    name: "Saved Layout",
    view: { context: "window" },
  });
  expect(manifest.capabilities).toEqual([
    "terminal.captureLayout.v1",
    "terminal.openLayout.v1",
    "state.v1",
  ]);
  expect(manifest.engines).toEqual({
    omxterm: ">=0.24.0-dev.1 <0.26.0",
    api: "^0.1.0",
  });
});

it("admits the built source on the current host through real archive validation", async () => {
  const manifest = parseManifest(
    JSON.parse(await readFile("extensions/restoration/extension.json", "utf8")),
  );
  const host = JSON.parse(await readFile("package.json", "utf8")) as {
    version: string;
  };
  for (const appVersion of [
    "0.24.0-dev.1",
    "0.24.0-dev.36",
    "0.24.0",
    "0.24.1-dev.0",
    "0.24.1",
    "0.25.0-dev.0",
    host.version,
    "0.25.0",
    "0.25.1",
  ])
    expect(() =>
      checkCompatibility(manifest, { appVersion, apiVersion: "0.1.0" }),
    ).not.toThrow();

  // Historical archive metadata stays refused on this host, not globally waived.
  const historical = parseManifest({
    ...manifest,
    version: "0.1.0",
    engines: { ...manifest.engines, omxterm: ">=0.24.0-dev.1 <0.25.0" },
  });
  expect(() =>
    checkCompatibility(historical, {
      appVersion: host.version,
      apiVersion: "0.1.0",
    }),
  ).toThrow("incompatible");
});

it("keeps earlier hosts, future minor families and incompatible APIs refused", async () => {
  const manifest = parseManifest(
    JSON.parse(await readFile("extensions/restoration/extension.json", "utf8")),
  );
  for (const appVersion of [
    "0.23.0",
    "0.24.0-dev.0",
    "0.24.2-dev.0",
    "0.25.0-beta.1",
    "0.25.1-dev.0",
    "0.26.0-dev.0",
    "0.26.0",
  ])
    expect(() =>
      checkCompatibility(manifest, { appVersion, apiVersion: "0.1.0" }),
    ).toThrow("incompatible");
  for (const apiVersion of ["0.0.9", "0.2.0", "0.1.1-dev.0"])
    expect(() =>
      checkCompatibility(manifest, { appVersion: "0.25.0-dev.4", apiVersion }),
    ).toThrow("incompatible");
});
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
      const host = JSON.parse(await readFile("package.json", "utf8")) as {
        version: string;
      };
      const validated = await extractPackage(bytes, extracted, {
        appVersion: host.version,
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
