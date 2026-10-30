import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { parseManifest } from "../../src/installed-packages/archive";
import { downloadExtension } from "../../src/main/extension-download";
import {
  catalogCompatible,
  createExtensionCatalog,
  parseCatalog,
  type CatalogRelease,
} from "../../src/main/extension-catalog";

vi.mock("../../src/main/extension-download", async (original) => ({
  ...(await original<typeof import("../../src/main/extension-download")>()),
  downloadExtension: vi.fn(),
}));

let files: CatalogRelease;
let catalogBytes: Buffer;
beforeAll(async () => {
  catalogBytes = await readFile("distribution/official-extensions-v1.json");
  const catalog = parseCatalog(catalogBytes);
  expect(catalog.map((entry) => entry.id)).toEqual([
    "omxterm.files",
    "omxterm.ssh",
    "omxterm.snippets",
  ]);
  files = catalog.find((entry) => entry.id === "omxterm.files")!;
});

describe("published Files catalog candidate", () => {
  it("binds the original immutable archive and embedded manifest, not a rebuild", async () => {
    expect(files).toMatchObject({
      id: "omxterm.files",
      version: "0.4.0",
      engines: { omxterm: ">=0.24.0-dev.8", api: "0.1.x" },
      targets: ["linux-arm64"],
      sourceCommit: "b6044d65d14345adb8d7ae59340fbca978512107",
      releaseUrl:
        "https://github.com/luizomf/omxterm/releases/tag/ext-files-v0.4.0",
      archive: {
        url: "https://github.com/luizomf/omxterm/releases/download/ext-files-v0.4.0/omxterm-files-language-b6044d6.omxext",
        bytes: 13188,
        sha256:
          "384de7da4cc2fafe7e42cd4ccf19a455a2e634036069160c75e15b7371d2eb6e",
      },
    });
    const manifest = parseManifest(
      JSON.parse(await readFile("extensions/files/extension.json", "utf8")),
    );
    // Source advances independently; never relabel the published 0.4 bytes.
    expect(manifest.id).toBe(files.id);
    expect(manifest.version).toBe("0.5.0");
    expect(manifest.engines.omxterm).toBe(">=0.24.0-dev.21");
    expect(files.name).toBe("Files — Linux ARM64 preview");
  });

  it.each([
    ["0.23.0-dev.9", false],
    ["0.23.0", false],
    ["0.24.0-dev.0", false],
    ["0.24.0-dev.5", false],
    ["0.24.0-dev.6", false],
    ["0.24.0-dev.7", false],
    ["0.24.0-dev.8", true],
    ["0.24.0-dev.11", true],
    ["0.24.0-dev.20", true],
    ["0.24.0", true],
    ["0.25.0-dev.0", false],
  ])(
    "preserves semver admission for %s (not execution qualification)",
    (appVersion, compatible) => {
      expect(
        catalogCompatible(
          files,
          { appVersion, apiVersion: "0.1.0" },
          "linux-arm64",
        ),
      ).toBe(compatible);
    },
  );

  it.each([
    "darwin-arm64",
    "linux-x64",
    "darwin-x64",
    "win32-arm64",
    "win32-x64",
  ])("does not admit Files on %s", (target) => {
    expect(
      catalogCompatible(
        files,
        { appVersion: "0.24.0-dev.11", apiVersion: "0.1.0" },
        target,
      ),
    ).toBe(false);
  });

  it("rejects incompatible API metadata", () => {
    expect(
      catalogCompatible(
        files,
        { appVersion: "0.24.0-dev.11", apiVersion: "0.2.0" },
        "linux-arm64",
      ),
    ).toBe(false);
  });

  it("offers captured Files 0.4 bytes for install, historical update and exact reinstall", async () => {
    vi.mocked(downloadExtension).mockResolvedValue(catalogBytes);
    const catalog = createExtensionCatalog(
      { appVersion: "0.24.0-dev.11", apiVersion: "0.1.0" },
      "linux-arm64",
    );
    await catalog.refresh(new AbortController().signal);
    const card = catalog
      .snapshot([])
      .entries.find((entry) => entry.id === files.id)!;
    expect(card).toMatchObject({ compatible: true, action: "install" });
    expect(catalog.select(card.selection)).toEqual(files);
    for (const [version, digest, action] of [
      [
        "0.1.0",
        "c1fd36c4ddb966c93235f38973730a74c86303051ca7a095b6e5df4787bc7b9f",
        "update",
      ],
      [files.version, files.archive.sha256, "reinstall"],
    ] as const) {
      expect(
        catalog
          .snapshot([{ id: files.id, manifest: { version }, digest }])
          .entries.find((entry) => entry.id === files.id),
      ).toMatchObject({ compatible: true, action });
    }
  });
});
