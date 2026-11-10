import { readFile } from "node:fs/promises";
import { expect, it } from "vitest";
import {
  checkCompatibility,
  parseManifest,
} from "../../src/installed-packages/archive";
import { packageCompatible } from "../../src/installed-packages/compatibility";
import {
  catalogCompatible,
  type CatalogRelease,
} from "../../src/main/extension-catalog";

// Historical sealed archives, independent of the currently promoted catalog.
const historicalFiles: CatalogRelease = {
  id: "omxterm.files",
  name: "Files — Linux ARM64 preview",
  description:
    "Project-maintained local file manager preview: browse, create, rename, move, trash and delete files.",
  version: "0.1.0",
  engines: { omxterm: ">=0.23.0-dev.8 <0.24.0", api: "0.1.x" },
  targets: ["linux-arm64"],
  archive: {
    url: "https://github.com/luizomf/omxterm/releases/download/ext-files-v0.1.0/files-0.1.0.omxext",
    sha256: "c1fd36c4ddb966c93235f38973730a74c86303051ca7a095b6e5df4787bc7b9f",
    bytes: 7917,
  },
  sourceCommit: "959f69ae5148182b0da67734b15b77922f7e4212",
  releaseUrl:
    "https://github.com/luizomf/omxterm/releases/tag/ext-files-v0.1.0",
};

it("admits the unchanged historical Files preview only on its assigned development hosts", () => {
  const manifest = parseManifest({
    format: 1,
    id: historicalFiles.id,
    name: historicalFiles.name,
    version: historicalFiles.version,
    engines: historicalFiles.engines,
    backend: "backend.mjs",
  });
  for (const appVersion of ["0.24.0-dev.0", "0.24.0-dev.5"]) {
    const runtime = { appVersion, apiVersion: "0.1.0" };
    expect(() => checkCompatibility(manifest, runtime)).not.toThrow();
    expect(catalogCompatible(historicalFiles, runtime, "linux-arm64")).toBe(
      true,
    );
    expect(catalogCompatible(historicalFiles, runtime, "darwin-arm64")).toBe(
      false,
    );
    expect(
      packageCompatible(manifest, { ...runtime, apiVersion: "0.2.0" }),
    ).toBe(false);
    for (const changed of [
      { ...manifest, id: "other.files" },
      { ...manifest, version: "0.1.1" },
      { ...manifest, engines: { ...manifest.engines, omxterm: "<0.24.0" } },
    ])
      expect(() => checkCompatibility(changed, runtime)).toThrow(
        "incompatible",
      );
  }
  for (const appVersion of ["0.24.0-dev.6", "0.24.0", "0.25.0-dev.0"])
    expect(
      packageCompatible(manifest, { appVersion, apiVersion: "0.1.0" }),
    ).toBe(false);
});

it.each(["files", "ssh"])(
  "admits the bundled %s source on the current host and refuses other API minors",
  async (name) => {
    const manifest = parseManifest(
      JSON.parse(await readFile(`extensions/${name}/extension.json`, "utf8")),
    );
    const release = {
      ...manifest,
      targets: ["linux-arm64"],
    } as unknown as CatalogRelease;
    const { version: appVersion } = JSON.parse(
      await readFile("package.json", "utf8"),
    ) as { version: string };
    const runtime = { appVersion, apiVersion: "0.1.0" };
    expect(() => checkCompatibility(manifest, runtime)).not.toThrow();
    expect(catalogCompatible(release, runtime, "linux-arm64")).toBe(true);
    for (const apiVersion of ["0.2.0", "0.1.1-dev.0"])
      expect(packageCompatible(manifest, { ...runtime, apiVersion })).toBe(
        false,
      );
  },
);
