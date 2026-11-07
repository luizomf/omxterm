import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import {
  checkCompatibility,
  extractPackage,
  parseManifest,
} from "../../src/installed-packages/archive";
import { packageCompatible } from "../../src/installed-packages/compatibility";
import {
  catalogCompatible,
  parseCatalog,
} from "../../src/main/extension-catalog";

const manifest = {
  id: "example.extension",
  version: "1.0.0",
  engines: { omxterm: ">=0.24.0-dev.21", api: "0.1.x" },
};
const runtime = (appVersion: string, apiVersion = "0.1.0") => ({
  appVersion,
  apiVersion,
});

it.each([
  [">=0.24.0-dev.8", true],
  [">=0.25.0-dev.20", true],
  ["0.25.0 || 0.26.0", true],
  ["*", true],
  [">=0.25.1", false],
  [">=0.26.0", false],
  [">=0.26.0-dev.1", false],
  [">=0.25.0 <0.26.0", false],
  ["0.25.0", false],
  ["0.26.0", false],
  ["not a range", false],
])("requires both 0.25.0 and 0.26.0 for range %s", (range, expected) => {
  expect(
    packageCompatible(
      { ...manifest, engines: { ...manifest.engines, omxterm: range } },
      runtime("0.26.0-dev.0"),
    ),
  ).toBe(expected);
});

it.each([
  ["0.26.0-dev.0", true],
  ["0.26.0-dev.37", true],
  ["0.26.0-dev.9007199254740992", true],
  ["0.26.0-dev.01", false],
  ["0.26.0-dev.-1", false],
  ["0.26.0-dev.0.extra", false],
  ["0.26.0-dev.0+build", false],
  ["0.26.0-dev.0\n", false],
  ["v0.26.0-dev.0", false],
  [" 0.26.0-dev.0", false],
  ["0.26.0-alpha.0", false],
  ["0.26.1-dev.0", false],
  ["0.27.0-dev.0", false],
  ["invalid", false],
  [`0.26.0-dev.${"9".repeat(300)}`, false],
])("limits the additional bridge to canonical host %j", (host, expected) => {
  expect(packageCompatible(manifest, runtime(host))).toBe(expected);
});

it("keeps ordinary explicit prerelease admission for other families", () => {
  expect(
    packageCompatible(
      {
        ...manifest,
        engines: { ...manifest.engines, omxterm: ">=0.27.0-dev.0 <0.27.0" },
      },
      runtime("0.27.0-dev.0"),
    ),
  ).toBe(true);
});

it.each(["0.2.0", "0.1.1-dev.0", "invalid"])(
  "does not bridge incompatible API %s",
  (api) =>
    expect(packageCompatible(manifest, runtime("0.26.0-dev.0", api))).toBe(
      false,
    ),
);

it("retains capability validation on the new family", () => {
  const input = {
    ...manifest,
    format: 1,
    name: "Example",
    backend: "backend.mjs",
  };
  const admitted = parseManifest({
    ...input,
    capabilities: ["terminal.insertPath.v1"],
  });
  expect(() =>
    checkCompatibility(admitted, runtime("0.26.0-dev.0")),
  ).not.toThrow();
  for (const capabilities of [
    ["terminal.unknown.v1"],
    ["state.v1", "state.v1"],
    [],
  ])
    expect(() => parseManifest({ ...input, capabilities })).toThrow(
      "invalid-package",
    );
});

it("admits the actual pinned default Snippets archive and matches its catalog offer", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-next-family-"));
  try {
    const host = JSON.parse(await readFile("package.json", "utf8")) as {
      version: string;
    };
    const extracted = await extractPackage(
      "assets/default-snippets/snippets-0.1.0.omxext",
      root,
      runtime(host.version),
    );
    expect(extracted.digest).toBe(
      "6c5723724d0dce26c589909405216c608dd071d7e9b04d63f733e012449c0ab7",
    );
    expect(extracted.manifest).toMatchObject({
      id: "omxterm.snippets",
      version: "0.1.0",
      engines: { omxterm: ">=0.24.0-dev.8", api: "0.1.x" },
      capabilities: ["terminal.semanticInput.v1"],
    });
    for (const file of [
      "distribution/official-extensions-v1.json",
      "distribution/official-extensions-darwin-arm64-v1.json",
    ]) {
      const releases = parseCatalog(await readFile(file));
      const snippets = releases.find(
        (entry) => entry.id === "omxterm.snippets",
      )!;
      expect(snippets.engines).toEqual(extracted.manifest.engines);
      expect(snippets.archive.sha256).toBe(extracted.digest);
      for (const target of snippets.targets)
        expect(catalogCompatible(snippets, runtime(host.version), target)).toBe(
          true,
        );
      expect(
        catalogCompatible(
          snippets,
          runtime(host.version, "0.2.0"),
          "linux-arm64",
        ),
      ).toBe(false);
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

it.each([
  ["distribution/official-extensions-v1.json", "linux-arm64"],
  ["distribution/official-extensions-darwin-arm64-v1.json", "darwin-arm64"],
])(
  "admits the actual current Files and SSH offers in %s only on their targets",
  async (file, target) => {
    const releases = parseCatalog(await readFile(file));
    for (const id of ["omxterm.files", "omxterm.ssh"]) {
      const release = releases.find((entry) => entry.id === id)!;
      expect(release.version).toBe(
        id === "omxterm.files"
          ? target === "darwin-arm64"
            ? "0.7.0"
            : "0.6.0"
          : "0.3.1",
      );
      expect(catalogCompatible(release, runtime("0.26.0-dev.0"), target)).toBe(
        true,
      );
      expect(
        catalogCompatible(release, runtime("0.26.0-dev.0", "0.2.0"), target),
      ).toBe(false);
      expect(
        catalogCompatible(release, runtime("0.26.0-dev.0"), "win32-x64"),
      ).toBe(false);
    }
  },
);
