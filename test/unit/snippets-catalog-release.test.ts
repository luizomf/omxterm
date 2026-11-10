import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { downloadExtension } from "../../src/main/extension-download";
import {
  catalogCompatible,
  createExtensionCatalog,
  MACOS_OFFICIAL_CATALOG_URL,
  OFFICIAL_CATALOG_URL,
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
  it("keeps complete fixed catalogs with synchronized common entries", async () => {
    const legacy = parseCatalog(catalogBytes);
    const macos = parseCatalog(
      await readFile("distribution/official-extensions-darwin-arm64-v1.json"),
    );
    expect(macos.map((entry) => entry.id)).toEqual(
      legacy.map((entry) => entry.id),
    );
    for (const id of ["omxterm.ssh", "omxterm.snippets"])
      expect(macos.find((entry) => entry.id === id)).toEqual(
        legacy.find((entry) => entry.id === id),
      );
  });

  it("binds the verified immutable archive, original receipt and embedded manifest", () => {
    // Recorded from public archive/checksum/receipt readback, not a new build.
    expect(snippets).toMatchObject({
      id: "omxterm.snippets",
      version: "0.1.1",
      engines: { omxterm: ">=0.24.0-dev.8", api: "0.1.x" },
      targets: ["linux-arm64", "darwin-arm64", "linux-x64", "win32-arm64"],
      sourceCommit: "12c54a09060364982de4e9833d112167a4e21d26",
      releaseUrl:
        "https://github.com/luizomf/omxterm/releases/tag/ext-snippets-v0.1.1",
      archive: {
        url: "https://github.com/luizomf/omxterm/releases/download/ext-snippets-v0.1.1/snippets-0.1.1.omxext",
        bytes: 82635,
        sha256:
          "e9c798132f09cb3b86783bd9bfe85b72e191243d583defe6f682d7dfcc32fe1b",
      },
    });
  });

  describe.each(["linux-arm64", "darwin-arm64", "linux-x64", "win32-arm64"])(
    "%s admission",
    (target) => {
      it.each([
        ["0.23.0", false],
        ["0.24.0-dev.7", false],
        ["0.24.0-dev.8", true],
        ["0.24.0-dev.11", true],
        ["0.24.0-dev.16", true],
        ["0.24.0-dev.30", true],
        ["0.24.0-dev.31", true],
        ["0.24.0-dev.32", true],
        ["0.24.0-dev.36", true],
        ["0.24.0", true],
        ["0.24.1-dev.0", true],
        ["0.25.0-dev.0", true],
        ["0.25.0-dev.1", true],
        ["0.25.0", true],
        ["0.26.0-dev.4", true],
        ["0.25.1-dev.0", false],
      ])(
        "applies host compatibility for %s (not qualification)",
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
    },
  );

  it.each(["darwin-x64", "win32-x64"])(
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
    ["linux-x64", "0.24.0-dev.30"],
    ["darwin-arm64", "0.24.0-dev.16"],
    ["darwin-arm64", "0.24.0-dev.26"],
    ["win32-arm64", "0.24.0-dev.36"],
  ])(
    "offers the same captured archive on %s / %s",
    async (target, appVersion) => {
      // This exercises current source with supplied runtime metadata, not the
      // endpoint embedded in the historical dev.16 executable.
      vi.mocked(downloadExtension).mockImplementation(async (url) => {
        expect(url).toBe(
          target === "darwin-arm64"
            ? MACOS_OFFICIAL_CATALOG_URL
            : OFFICIAL_CATALOG_URL,
        );
        if (url === OFFICIAL_CATALOG_URL) return catalogBytes;
        expect(url).toBe(MACOS_OFFICIAL_CATALOG_URL);
        return readFile(
          "distribution/official-extensions-darwin-arm64-v1.json",
        );
      });
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
      const oldDefault = JSON.parse(
        await readFile("assets/default-snippets.json", "utf8"),
      ) as { id: string; version: string; sha256: string };
      expect(oldDefault).toMatchObject({
        id: "omxterm.snippets",
        version: "0.1.0",
        sha256:
          "6c5723724d0dce26c589909405216c608dd071d7e9b04d63f733e012449c0ab7",
      });
      expect(
        catalog
          .snapshot([
            {
              id: oldDefault.id,
              manifest: { version: oldDefault.version },
              digest: oldDefault.sha256,
            },
          ])
          .entries.find((entry) => entry.id === snippets.id),
      ).toMatchObject({ action: "update", installedVersion: "0.1.0" });
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
      if (
        target === "darwin-arm64" ||
        target === "linux-x64" ||
        target === "win32-arm64"
      ) {
        for (const other of catalog
          .snapshot([])
          .entries.filter((entry) => entry.id !== snippets.id)) {
          const compatible =
            target === "darwin-arm64" && other.id === "omxterm.ssh";
          expect(other.compatible).toBe(compatible);
          if (!compatible)
            expect(() => catalog.select(other.selection)).toThrow(
              "incompatible",
            );
        }
      }
    },
  );
});
