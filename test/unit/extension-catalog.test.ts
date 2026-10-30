import { readFile } from "node:fs/promises";
import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  parseCatalog,
  CATALOG_BYTES,
  createExtensionCatalog,
  catalogCompatible,
  catalogAction,
  type CatalogRelease,
  OFFICIAL_CATALOG_URL,
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
beforeEach(() => vi.mocked(downloadExtension).mockReset());
describe("official catalog", () => {
  it("offers the exact separate SSH preview without changing immutable Files metadata", async () => {
    const catalog = parseCatalog(
      await readFile("distribution/official-extensions-v1.json"),
    );
    const ssh = catalog.find((entry) => entry.id === "omxterm.ssh")!;
    const files = catalog.find((entry) => entry.id === "omxterm.files")!;
    expect(ssh).toMatchObject({
      version: "0.3.0",
      engines: { omxterm: ">=0.24.0-dev.8", api: "0.1.x" },
      sourceCommit: "77937fcf87ae71a68709111df7ace7359fb3f0b6",
      releaseUrl:
        "https://github.com/luizomf/omxterm/releases/tag/ext-ssh-v0.3.0",
      targets: ["linux-arm64"],
      archive: {
        bytes: 11572,
        sha256:
          "13b265058ba051bb1dcf57ba1cef9347ed8d6851069a4ad1206af0469feb46cf",
        url: "https://github.com/luizomf/omxterm/releases/download/ext-ssh-v0.3.0/ssh-0.3.0-77937fc.omxext",
      },
    });
    expect(files).toMatchObject({
      version: "0.1.0",
      engines: { omxterm: ">=0.23.0-dev.8 <0.24.0", api: "0.1.x" },
      archive: {
        bytes: 7917,
        sha256:
          "c1fd36c4ddb966c93235f38973730a74c86303051ca7a095b6e5df4787bc7b9f",
      },
    });
    expect(catalogCompatible(ssh, runtime, "linux-arm64")).toBe(false);
    expect(
      catalogCompatible(
        files,
        { ...runtime, appVersion: "0.24.0-dev.0" },
        "linux-arm64",
      ),
    ).toBe(true);
    for (const appVersion of ["0.24.0-dev.0", "0.24.0-dev.7"])
      expect(
        catalogCompatible(ssh, { ...runtime, appVersion }, "linux-arm64"),
      ).toBe(false);
    for (const appVersion of ["0.24.0-dev.8", "0.24.0-dev.11"])
      expect(
        catalogCompatible(ssh, { ...runtime, appVersion }, "linux-arm64"),
      ).toBe(true);
    expect(
      catalogAction(ssh, {
        version: "0.1.0",
        digest:
          "d11d16df09876d20a6fc766fcb1e5d76e2214d0d0965ad90be47496e4b066699",
      }),
    ).toBe("update");
    expect(
      catalogAction(ssh, { version: ssh.version, digest: ssh.archive.sha256 }),
    ).toBe("reinstall");
  });
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
  it("does no startup I/O, loads only the fixed endpoint with smaller budget, and preserves stale success", async () => {
    const catalog = createExtensionCatalog(runtime, "linux-arm64");
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
      OFFICIAL_CATALOG_URL,
      signal,
      CATALOG_BYTES,
    );
    const first = catalog.snapshot([]);
    await expect(catalog.refresh(signal)).rejects.toThrow("offline");
    expect(catalog.snapshot([])).toEqual({ ...first, stale: true });
  });
  it("captures immutable selections and refuses stale IDs, owner loss and refresh supersession", async () => {
    const catalog = createExtensionCatalog(runtime, "linux-arm64");
    vi.mocked(downloadExtension).mockResolvedValue(bytes());
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
  });
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
