import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  parseCatalog,
  CATALOG_BYTES,
  createExtensionCatalog,
  catalogCompatible,
  catalogAction,
  type CatalogRelease,
  OFFICIAL_CATALOG_URL,
  MACOS_OFFICIAL_CATALOG_URL,
} from "../../src/main/extension-catalog";
import { downloadExtension } from "../../src/main/extension-download";
import { isExtensionsRequest } from "../../src/shared/extensions";
vi.mock("../../src/main/extension-download", async (original) => ({
  ...(await original<typeof import("../../src/main/extension-download")>()),
  downloadExtension: vi.fn(),
}));
const runtime = { appVersion: "0.23.0-dev.9", apiVersion: "0.1.0" };
const release: CatalogRelease = {
  id: "omxterm.files",
  name: "Files",
  description: "<b>plain text</b>",
  version: "0.1.0",
  engines: { omxterm: ">=0.23.0-dev.8 <0.24.0", api: "0.1.x" },
  targets: ["linux-arm64"],
  archive: {
    url: "https://github.com/luizomf/omxterm/releases/download/ext-files-v0.1.0/files-0.1.0.omxext",
    sha256: "a".repeat(64),
    bytes: 100,
  },
  sourceCommit: "b".repeat(40),
  releaseUrl:
    "https://github.com/luizomf/omxterm/releases/tag/ext-files-v0.1.0",
};
const bytes = (entries: unknown[] = [release]) =>
  Buffer.from(JSON.stringify({ schemaVersion: 1, entries }));
beforeEach(() => {
  vi.mocked(downloadExtension).mockReset();
});
describe("official catalog", () => {
  it("accepts bounded plain-text releases and an explicitly empty published catalog", () => {
    expect(parseCatalog(bytes())).toEqual([release]);
    expect(parseCatalog(bytes([]))).toEqual([]);
  });
  it("rejects malformed, oversized, duplicate and unknown-schema data", () => {
    for (const input of [
      Buffer.from("{"),
      Buffer.from([0xff]),
      Buffer.alloc(CATALOG_BYTES + 1),
      bytes([release, release]),
      bytes(Array(101).fill(release)),
      Buffer.from('{"schemaVersion":2,"entries":[]}'),
      bytes([{ ...release, signed: true }]),
      bytes([{ ...release, name: "a".repeat(129) }]),
    ])
      expect(() => parseCatalog(input)).toThrow("invalid-catalog");
  });
  it("requires immutable project release URLs and matching release tags", () => {
    for (const url of [
      "https://example.com/files.omxext",
      "https://github.com/luizomf/omxterm/releases/latest/download/files.omxext",
      release.archive.url + "?secret=x",
      release.archive.url.replace("v0.1.0/", "v0.2.0/"),
    ])
      expect(() =>
        parseCatalog(
          bytes([{ ...release, archive: { ...release.archive, url } }]),
        ),
      ).toThrow("invalid-catalog");
  });
  it("enforces target/API and ordinary prerelease semver semantics", () => {
    expect(catalogCompatible(release, runtime, "linux-arm64")).toBe(true);
    for (const appVersion of [
      "0.22.0",
      "0.23.0-dev.7",
      "0.23.1-dev.0",
      "0.24.0",
    ])
      expect(
        catalogCompatible(release, { ...runtime, appVersion }, "linux-arm64"),
      ).toBe(false);
    expect(
      catalogCompatible(
        release,
        { ...runtime, appVersion: "0.23.0-dev.8" },
        "linux-arm64",
      ),
    ).toBe(true);
    expect(catalogCompatible(release, runtime, "linux-x64")).toBe(false);
    expect(
      catalogCompatible(
        release,
        { ...runtime, apiVersion: "0.2.0" },
        "linux-arm64",
      ),
    ).toBe(false);
  });
  it.each([
    ["linux-arm64", "0.23.0-dev.9", null, true],
    ["darwin-arm64", "0.23.0-dev.9", "platform", false],
    ["linux-arm64", "0.22.0", "engine", false],
    ["darwin-arm64", "0.22.0", "platform-and-engine", false],
  ] as const)(
    "reports platform and host/API compatibility separately for %s / %s",
    async (target, version, incompatibility, compatible) => {
      const catalog = createExtensionCatalog(
        { ...runtime, appVersion: version },
        target,
      );
      vi.mocked(downloadExtension).mockResolvedValue(bytes());
      await catalog.refresh(new AbortController().signal);
      const card = catalog.snapshot([]).entries[0]!;
      expect(card).toMatchObject({
        incompatibility,
        compatible,
      });
      if (!compatible)
        expect(() => catalog.select(card.selection)).toThrow("incompatible");
      else expect(catalog.select(card.selection).id).toBe(release.id);
    },
  );
  it("distinguishes update, exact reinstall, different bytes and downgrade", () => {
    expect(catalogAction(release)).toBe("install");
    expect(catalogAction(release, { version: "0.0.9", digest: "x" })).toBe(
      "update",
    );
    expect(
      catalogAction(release, {
        version: release.version,
        digest: release.archive.sha256,
      }),
    ).toBe("reinstall");
    for (const version of [release.version, "0.2.0"])
      expect(catalogAction(release, { version, digest: "x" })).toBe("replace");
  });
  it.each([
    [undefined, "install"],
    [{ version: "0.0.9", digest: "x" }, "update"],
    [{ version: release.version, digest: release.archive.sha256 }, null],
    [{ version: release.version, digest: "x" }, null],
    [{ version: "0.2.0", digest: "x" }, null],
    [{ version: "0.0.9", digest: null }, "install"],
  ] as const)(
    "offers only a first install or a real update (%o)",
    async (installed, action) => {
      const catalog = createExtensionCatalog(runtime, "linux-arm64");
      vi.mocked(downloadExtension).mockResolvedValue(bytes());
      await catalog.refresh(new AbortController().signal);
      const card = catalog.snapshot(
        installed
          ? [
              {
                id: release.id,
                manifest: { version: installed.version },
                digest: installed.digest,
              },
            ]
          : [],
      ).entries[0]!;
      expect(card.action).toBe(action);
    },
  );
  it.each([
    ["linux-arm64", OFFICIAL_CATALOG_URL],
    ["linux-x64", OFFICIAL_CATALOG_URL],
    ["darwin-arm64", MACOS_OFFICIAL_CATALOG_URL],
    ["darwin-x64", OFFICIAL_CATALOG_URL],
    ["win32-arm64", OFFICIAL_CATALOG_URL],
    ["win32-x64", OFFICIAL_CATALOG_URL],
    ["unknown", OFFICIAL_CATALOG_URL],
  ])(
    "loads only the fixed endpoint for %s and preserves its stale success",
    async (target, url) => {
      const catalog = createExtensionCatalog(runtime, target);
      expect(catalog.snapshot([])).toEqual({
        loaded: false,
        stale: false,
        entries: [],
      });
      expect(downloadExtension).not.toHaveBeenCalled();
      vi.mocked(downloadExtension)
        .mockResolvedValueOnce(bytes())
        .mockRejectedValueOnce(new Error("offline"));
      const signal = new AbortController().signal;
      await catalog.refresh(signal);
      expect(downloadExtension).toHaveBeenCalledWith(
        url,
        signal,
        CATALOG_BYTES,
      );
      const first = catalog.snapshot([]);
      await expect(catalog.refresh(signal)).rejects.toThrow("offline");
      expect(catalog.snapshot([])).toEqual({ ...first, stale: true });
      expect(downloadExtension).toHaveBeenCalledTimes(2);
      expect(
        vi.mocked(downloadExtension).mock.calls.map(([requested]) => requested),
      ).toEqual([url, url]);
    },
  );
  it("keeps a cold macOS endpoint failure unavailable without legacy fallback", async () => {
    vi.mocked(downloadExtension).mockRejectedValue(new Error("offline"));
    const catalog = createExtensionCatalog(runtime, "darwin-arm64");
    await expect(catalog.refresh(new AbortController().signal)).rejects.toThrow(
      "offline",
    );
    expect(catalog.snapshot([])).toEqual({
      loaded: false,
      stale: true,
      entries: [],
    });
    expect(downloadExtension).toHaveBeenCalledTimes(1);
    expect(vi.mocked(downloadExtension).mock.calls[0]![0]).toBe(
      MACOS_OFFICIAL_CATALOG_URL,
    );
  });
  it.each(["linux-arm64", "darwin-arm64"])(
    "captures immutable selections and refuses stale IDs, owner loss and refresh supersession on %s",
    async (target) => {
      const catalog = createExtensionCatalog(runtime, target);
      vi.mocked(downloadExtension).mockResolvedValue(
        bytes([{ ...release, targets: [target] }]),
      );
      await catalog.refresh(new AbortController().signal);
      const selection = catalog.snapshot([]).entries[0]!.selection;
      const captured = catalog.select(selection);
      captured.archive.sha256 = "c".repeat(64);
      expect(catalog.select(selection).archive.sha256).toBe(
        release.archive.sha256,
      );
      let resolve!: (value: Buffer) => void;
      vi.mocked(downloadExtension).mockImplementationOnce(
        () =>
          new Promise((done) => {
            resolve = done;
          }),
      );
      const late = catalog.refresh(new AbortController().signal);
      await catalog.refresh(new AbortController().signal);
      resolve(bytes([{ ...release, version: "9.0.0" }]));
      await expect(late).rejects.toThrow("catalog-selection");
      expect(() => catalog.select(selection)).toThrow("catalog-selection");
      const abort = new AbortController();
      abort.abort();
      await expect(catalog.refresh(abort.signal)).rejects.toThrow(
        "catalog-selection",
      );
      expect(catalog.snapshot([]).entries[0]!.version).toBe(release.version);
    },
  );
  it("does not accept renderer URL/hash/Official authority", () => {
    const token = "a".repeat(36);
    expect(
      isExtensionsRequest({
        operation: "catalog-install",
        token,
        selection: token,
      }),
    ).toBe(true);
    for (const extra of [
      { url: release.archive.url },
      { sha256: release.archive.sha256 },
      { official: true },
    ])
      expect(
        isExtensionsRequest({
          operation: "catalog-install",
          token,
          selection: token,
          ...extra,
        }),
      ).toBe(false);
  });
});
