import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import {
  checkCompatibility,
  parseManifest,
} from "../../src/installed-packages/archive";
import { packageCompatible } from "../../src/installed-packages/compatibility";
import {
  catalogCompatible,
  parseCatalog,
} from "../../src/main/extension-catalog";

it("admits a maintenance dev host when the original range admits both stable endpoints", () => {
  const manifest = {
    id: "example.extension",
    version: "1.0.0",
    engines: { omxterm: ">=0.24.0-dev.21", api: "0.1.x" },
  };
  expect(
    packageCompatible(manifest, {
      appVersion: "0.24.1-dev.0",
      apiVersion: "0.1.0",
    }),
  ).toBe(true);
});

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
  [">=0.24.0 <0.25.0", true],
  ["0.24.0 || 0.24.1", true],
  ["*", true],
  ["0.24.0", false],
  ["<0.24.1", false],
  [">=0.24.1", false],
  ["not a range", false],
])("requires both stable endpoints for range %s", (range, expected) => {
  expect(
    packageCompatible(
      { ...manifest, engines: { ...manifest.engines, omxterm: range } },
      runtime("0.24.1-dev.1"),
    ),
  ).toBe(expected);
});

it.each([
  ["0.24.1-dev.0", true],
  ["0.24.1-dev.1", true],
  ["0.24.1-dev.37", true],
  ["0.24.1-dev.9007199254740992", true],
  ["0.24.1-dev.01", false],
  ["0.24.1-dev.-1", false],
  ["0.24.1-dev.0.extra", false],
  ["0.24.1-dev.0+build", false],
  ["0.24.1-dev.0\n", false],
  ["v0.24.1-dev.0", false],
  [" 0.24.1-dev.0", false],
  ["0.24.1-alpha.0", false],
  ["0.24.1-beta.1", false],
  ["0.24.1-rc.0", false],
  ["0.24.2-dev.0", false],
  ["0.25.0-dev.0", false],
  ["invalid", false],
  [`0.24.1-dev.${"9".repeat(300)}`, false],
])("limits additional admission for host %j", (host, expected) => {
  expect(packageCompatible(manifest, runtime(host))).toBe(expected);
});

it("preserves ordinary explicit prerelease and stable semver admission", () => {
  for (const [host, range] of [
    ["0.24.1-dev.0+build", ">=0.24.1-dev.0 <0.24.1"],
    ["0.24.2-dev.0", ">=0.24.2-dev.0 <0.24.2"],
    ["0.25.0-alpha.1", ">=0.25.0-alpha.0 <0.25.0"],
    ["0.24.0", ">=0.24.0"],
    ["0.24.1", ">=0.24.1"],
  ])
    expect(
      packageCompatible(
        { ...manifest, engines: { ...manifest.engines, omxterm: range! } },
        runtime(host!),
      ),
    ).toBe(true);
});

it.each(["0.2.0", "0.1.1-dev.0", "invalid"])(
  "does not bridge an incompatible API %s",
  (api) =>
    expect(packageCompatible(manifest, runtime("0.24.1-dev.0", api))).toBe(
      false,
    ),
);

it.each([
  [
    "omxterm.files",
    "0.6.0",
    ">=0.24.0-dev.21",
    "50c4fb9f5ab7492cd4ee7cdf1b7f75092b03d6f704b380457cb0b3b996bf8143",
  ],
  [
    "omxterm.ssh",
    "0.3.1",
    ">=0.24.0-dev.8",
    "be7589f44a65c8ab763b85e78863deeb487094bd33a936923988fe41bd846b0b",
  ],
  [
    "omxterm.snippets",
    "0.1.0",
    ">=0.24.0-dev.8",
    "6c5723724d0dce26c589909405216c608dd071d7e9b04d63f733e012449c0ab7",
  ],
])(
  "agrees across predicate, archive and catalog for published %s",
  async (id, version, range, digest) => {
    const releases = parseCatalog(
      await readFile("distribution/official-extensions-v1.json"),
    );
    const release = releases.find((item) => item.id === id)!;
    expect(release).toMatchObject({
      version,
      engines: { omxterm: range, api: "0.1.x" },
      archive: { sha256: digest },
    });
    const archived = parseManifest({
      format: 1,
      id,
      version,
      name: release.name,
      engines: release.engines,
      backend: "backend.mjs",
    });
    for (const host of [
      "0.24.0",
      "0.24.1-dev.0",
      "0.24.1-dev.1",
      "0.24.1-dev.37",
      "0.24.1",
    ]) {
      expect(packageCompatible(archived, runtime(host))).toBe(true);
      expect(() => checkCompatibility(archived, runtime(host))).not.toThrow();
      expect(catalogCompatible(release, runtime(host), "linux-arm64")).toBe(
        true,
      );
      expect(
        catalogCompatible(release, runtime(host, "0.2.0"), "linux-arm64"),
      ).toBe(false);
    }
  },
);
