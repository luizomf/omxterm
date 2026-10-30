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
  type CatalogRelease,
} from "../../src/main/extension-catalog";

// Historical sealed archive, independent of the currently promoted catalog.
const historicalSsh: CatalogRelease = {
  id: "omxterm.ssh",
  name: "SSH Connect",
  description: "Historical Linux ARM64 preview",
  version: "0.1.0",
  engines: { omxterm: ">=0.24.0-dev.0", api: "0.1.x" },
  targets: ["linux-arm64"],
  archive: {
    url: "https://github.com/luizomf/omxterm/releases/download/ext-ssh-v0.1.0/ssh-6d939f0.omxext",
    sha256: "d11d16df09876d20a6fc766fcb1e5d76e2214d0d0965ad90be47496e4b066699",
    bytes: 9418,
  },
  sourceCommit: "6d939f0e837dba90728e6e892010a4a1889fe0c9",
  releaseUrl: "https://github.com/luizomf/omxterm/releases/tag/ext-ssh-v0.1.0",
};

it.each([
  "0.24.0-dev.0",
  "0.24.0-dev.1",
  "0.24.0-dev.2",
  "0.24.0-dev.3",
  "0.24.0-dev.4",
  "0.24.0-dev.5",
])(
  "retains historical Files/SSH admission on explicitly assigned host %s",
  async (appVersion) => {
    const catalog = parseCatalog(
      await readFile("distribution/official-extensions-v1.json"),
    );
    const runtime = { appVersion, apiVersion: "0.1.0" };
    for (const id of ["omxterm.files", "omxterm.ssh"]) {
      const release =
        id === "omxterm.ssh"
          ? historicalSsh
          : catalog.find((entry) => entry.id === id)!;
      expect(release.version).toBe("0.1.0");
      const manifest = parseManifest({
        format: 1,
        id,
        name: release.name,
        version: release.version,
        engines: release.engines,
        backend: "backend.mjs",
      });
      expect(() => checkCompatibility(manifest, runtime)).not.toThrow();
      expect(catalogCompatible(release, runtime, "linux-arm64")).toBe(true);
      expect(catalogCompatible(release, runtime, "darwin-arm64")).toBe(false);
      expect(
        packageCompatible(manifest, { ...runtime, apiVersion: "0.2.0" }),
      ).toBe(false);
      if (id !== "omxterm.files") continue;
      for (const appVersion of ["0.24.0", "0.24.0-dev.6", "0.25.0-dev.0"])
        expect(packageCompatible(manifest, { ...runtime, appVersion })).toBe(
          false,
        );
      for (const changed of [
        { ...manifest, id: "other.files" },
        { ...manifest, version: "0.1.1" },
        { ...manifest, engines: { ...manifest.engines, omxterm: "<0.24.0" } },
      ])
        expect(() => checkCompatibility(changed, runtime)).toThrow(
          "incompatible",
        );
    }
  },
);

it.each(["files", "ssh"])(
  "requires hosts with the presentation capabilities used by new %s bytes",
  async (name) => {
    const manifest = parseManifest(
      JSON.parse(await readFile(`extensions/${name}/extension.json`, "utf8")),
    );
    expect(manifest.version).toBe(name === "files" ? "0.4.0" : "0.3.0");
    const release = {
      ...manifest,
      targets: ["linux-arm64"],
    } as unknown as CatalogRelease;
    const incompatibleHosts = [
      "0.23.0-dev.8",
      "0.24.0-dev.0",
      "0.24.0-dev.3",
      "0.24.0-dev.4",
      "0.24.0-dev.5",
      "0.24.0-dev.6",
      "0.24.0-dev.7",
    ];
    for (const appVersion of incompatibleHosts) {
      const runtime = { appVersion, apiVersion: "0.1.0" };
      expect(() => checkCompatibility(manifest, runtime)).toThrow(
        "incompatible",
      );
      expect(catalogCompatible(release, runtime, "linux-arm64")).toBe(false);
    }
    const compatibleHosts = [
      "0.24.0-dev.8",
      "0.24.0-dev.11",
      "0.24.0-dev.12",
      "0.24.0",
    ];
    for (const appVersion of compatibleHosts) {
      const runtime = { appVersion, apiVersion: "0.1.0" };
      expect(() => checkCompatibility(manifest, runtime)).not.toThrow();
      expect(catalogCompatible(release, runtime, "linux-arm64")).toBe(true);
    }
  },
);

it.each([
  "0.24.0-dev.1",
  "0.24.0-dev.2",
  "0.24.0-dev.3",
  "0.24.0-dev.4",
  "0.24.0-dev.5",
])("keeps unchanged restoration compatible on %s", async (appVersion) => {
  const manifest = parseManifest(
    JSON.parse(await readFile("extensions/restoration/extension.json", "utf8")),
  );
  expect(() =>
    checkCompatibility(manifest, { appVersion, apiVersion: "0.1.0" }),
  ).not.toThrow();
});
