import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it, vi } from "vitest";
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

let snippets: CatalogRelease;
let catalogBytes: Buffer;
beforeAll(async () => {
  catalogBytes = await readFile("distribution/official-extensions-v1.json");
  const catalog = parseCatalog(catalogBytes);
  expect(catalog.map((entry) => entry.id)).toEqual([
    "omxterm.files",
    "omxterm.ssh",
    "omxterm.snippets",
  ]);
  snippets = catalog.find((entry) => entry.id === "omxterm.snippets")!;
});

describe("published Snippets catalog candidate", () => {
  it("binds the verified immutable archive, original receipt and embedded manifest", () => {
    // Recorded from public archive/checksum/receipt readback, not a new build.
    expect(snippets).toMatchObject({
      id: "omxterm.snippets",
      version: "0.1.0",
      engines: { omxterm: ">=0.24.0-dev.8", api: "0.1.x" },
      targets: ["linux-arm64", "darwin-arm64"],
      sourceCommit: "805e95dbc77552dc137707578b18b48ad6d047e9",
      releaseUrl:
        "https://github.com/luizomf/omxterm/releases/tag/ext-snippets-v0.1.0",
      archive: {
        url: "https://github.com/luizomf/omxterm/releases/download/ext-snippets-v0.1.0/snippets-0.1.0.omxext",
        bytes: 76653,
        sha256:
          "6c5723724d0dce26c589909405216c608dd071d7e9b04d63f733e012449c0ab7",
      },
    });
  });

  describe.each(["linux-arm64", "darwin-arm64"])("%s admission", (target) => {
    it.each([
      ["0.23.0", false],
      ["0.24.0-dev.7", false],
      ["0.24.0-dev.8", true],
      ["0.24.0-dev.11", true],
      ["0.24.0-dev.16", true],
      ["0.24.0", true],
      ["0.24.1-dev.0", false],
      ["0.25.0-dev.0", false],
    ])(
      "preserves manifest semver admission for %s (not qualification)",
      (appVersion, compatible) => {
        expect(
          catalogCompatible(
            snippets,
            { appVersion, apiVersion: "0.1.0" },
            target,
          ),
        ).toBe(compatible);
      },
    );

    it.each(["0.0.9", "0.2.0", "0.1.1-dev.0"])(
      "rejects incompatible API %s",
      (apiVersion) => {
        expect(
          catalogCompatible(
            snippets,
            { appVersion: "0.24.0-dev.16", apiVersion },
            target,
          ),
        ).toBe(false);
      },
    );
  });

  it.each(["linux-x64", "darwin-x64", "win32-arm64", "win32-x64"])(
    "does not admit the installed preview on %s",
    (target) => {
      expect(
        catalogCompatible(
          snippets,
          { appVersion: "0.24.0-dev.16", apiVersion: "0.1.0" },
          target,
        ),
      ).toBe(false);
    },
  );

  it.each([
    ["linux-arm64", "0.24.0-dev.11"],
    ["darwin-arm64", "0.24.0-dev.16"],
  ])(
    "offers the same captured archive on %s / %s",
    async (target, appVersion) => {
      vi.mocked(downloadExtension).mockResolvedValue(catalogBytes);
      const catalog = createExtensionCatalog(
        { appVersion, apiVersion: "0.1.0" },
        target,
      );
      await catalog.refresh(new AbortController().signal);
      const card = catalog
        .snapshot([])
        .entries.find((entry) => entry.id === snippets.id)!;
      expect(card).toMatchObject({ compatible: true, action: "install" });
      expect(catalog.select(card.selection)).toEqual(snippets);
      expect(
        catalog
          .snapshot([
            {
              id: snippets.id,
              manifest: { version: snippets.version },
              digest: snippets.archive.sha256,
            },
          ])
          .entries.find((entry) => entry.id === snippets.id)?.action,
      ).toBe("reinstall");
      if (target === "darwin-arm64") {
        for (const other of catalog
          .snapshot([])
          .entries.filter((entry) => entry.id !== snippets.id)) {
          expect(other.compatible).toBe(false);
          expect(() => catalog.select(other.selection)).toThrow("incompatible");
        }
      }
    },
  );
});
