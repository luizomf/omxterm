import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { downloadExtension } from "../../src/main/extension-download";
import {
  catalogAction,
  catalogCompatible,
  createExtensionCatalog,
  MACOS_OFFICIAL_CATALOG_URL,
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
  catalogBytes = await readFile(
    "distribution/official-extensions-darwin-arm64-v1.json",
  );
  files = parseCatalog(catalogBytes)[0]!;
});

describe("macOS Files catalog publication candidate", () => {
  it("preserves legacy bytes and every common release", async () => {
    const legacyBytes = await readFile(
      "distribution/official-extensions-v1.json",
    );
    // Exact pre-selection catalog: old published hosts keep fetching these bytes.
    expect(createHash("sha256").update(legacyBytes).digest("hex")).toBe(
      "315c7208328b401a31944c97f8c259d8b449ab6c7185a1ded00c691d997c26f9",
    );
    const legacy = parseCatalog(legacyBytes);
    const macos = parseCatalog(catalogBytes);
    expect(macos.map(({ id }) => id)).toEqual(legacy.map(({ id }) => id));
    expect(macos.filter(({ id }) => id !== files.id)).toEqual(
      legacy.filter(({ id }) => id !== files.id),
    );
  });

  it("binds the immutable published 0.5 archive and exact manifest metadata", () => {
    expect(files).toEqual({
      id: "omxterm.files",
      name: "Files — ARM64 preview",
      description:
        "Project-maintained local file manager preview: browse, create, rename, move, trash and delete files.",
      version: "0.5.0",
      engines: { omxterm: ">=0.24.0-dev.21", api: "0.1.x" },
      targets: ["darwin-arm64"],
      sourceCommit: "a343704c0794cb913fba9ad312e90e5f6daa4bb1",
      releaseUrl:
        "https://github.com/luizomf/omxterm/releases/tag/ext-files-v0.5.0",
      archive: {
        url: "https://github.com/luizomf/omxterm/releases/download/ext-files-v0.5.0/files-0.5.0-a343704c0794.omxext",
        bytes: 13200,
        sha256:
          "82bd4bfe6f5a3ae7c22642741718dea94543f92b636a50b357c13d3c4be6aa18",
      },
    });
  });

  it.each([
    ["0.24.0-dev.11", false],
    ["0.24.0-dev.20", false],
    ["0.24.0-dev.21", true],
    ["0.24.0-dev.26", true],
    ["0.24.0", true],
    ["0.25.0-dev.0", false],
  ])(
    "admits manifest range %s without claiming execution qualification",
    (appVersion, expected) => {
      expect(
        catalogCompatible(
          files,
          { appVersion, apiVersion: "0.1.0" },
          "darwin-arm64",
        ),
      ).toBe(expected);
    },
  );

  it.each([
    "linux-arm64",
    "linux-x64",
    "darwin-x64",
    "win32-arm64",
    "win32-x64",
  ])("does not promote 0.5 qualification to %s", (target) => {
    expect(
      catalogCompatible(
        files,
        { appVersion: "0.24.0-dev.26", apiVersion: "0.1.0" },
        target,
      ),
    ).toBe(false);
  });

  it("rejects the wrong API and preserves deliberate replacement actions", () => {
    expect(
      catalogCompatible(
        files,
        { appVersion: "0.24.0-dev.26", apiVersion: "0.2.0" },
        "darwin-arm64",
      ),
    ).toBe(false);
    expect(catalogAction(files)).toBe("install");
    expect(catalogAction(files, { version: "0.4.0", digest: "old" })).toBe(
      "update",
    );
    expect(
      catalogAction(files, {
        version: files.version,
        digest: files.archive.sha256,
      }),
    ).toBe("reinstall");
    expect(
      catalogAction(files, { version: files.version, digest: "different" }),
    ).toBe("replace");
    expect(catalogAction(files, { version: "0.6.0", digest: "newer" })).toBe(
      "replace",
    );
  });

  it("offers compatible Files/Snippets and incompatible SSH through the selected endpoint", async () => {
    vi.mocked(downloadExtension).mockImplementation(async (url) => {
      expect(url).toBe(MACOS_OFFICIAL_CATALOG_URL);
      return catalogBytes;
    });
    const catalog = createExtensionCatalog(
      { appVersion: "0.24.0-dev.26", apiVersion: "0.1.0" },
      "darwin-arm64",
    );
    await catalog.refresh(new AbortController().signal);
    expect(
      catalog
        .snapshot([])
        .entries.map(({ id, compatible }) => ({ id, compatible })),
    ).toEqual([
      { id: "omxterm.files", compatible: true },
      { id: "omxterm.ssh", compatible: false },
      { id: "omxterm.snippets", compatible: true },
    ]);
    expect(catalog.select(catalog.snapshot([]).entries[0]!.selection)).toEqual(
      files,
    );
  });
});
