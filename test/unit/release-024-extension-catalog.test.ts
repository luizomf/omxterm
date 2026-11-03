import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fromBufferPromise } from "yauzl";
import { describe, expect, it } from "vitest";
import { parseManifest } from "../../src/installed-packages/archive";
import { packageCompatible } from "../../src/installed-packages/compatibility";
import {
  catalogAction,
  catalogCompatible,
  parseCatalog,
  type CatalogRelease,
} from "../../src/main/extension-catalog";

const targets = [
  ["linux-arm64", "distribution/official-extensions-v1.json"],
  ["darwin-arm64", "distribution/official-extensions-darwin-arm64-v1.json"],
] as const;
const filesSha =
  "50c4fb9f5ab7492cd4ee7cdf1b7f75092b03d6f704b380457cb0b3b996bf8143";
const sshSha =
  "be7589f44a65c8ab763b85e78863deeb487094bd33a936923988fe41bd846b0b";
const runtime = (appVersion: string, apiVersion = "0.1.0") => ({
  appVersion,
  apiVersion,
});
async function readCatalog(file: string) {
  return parseCatalog(await readFile(file));
}
function byId(entries: CatalogRelease[], id: string) {
  const found = entries.find((entry) => entry.id === id);
  expect(found, id).toBeDefined();
  return found!;
}

describe("0.24.0 first-party catalog candidate", () => {
  it.each(targets)(
    "binds Files and SSH exact identities on %s",
    async (target, file) => {
      const entries = await readCatalog(file);
      expect(entries.map(({ id }) => id)).toEqual([
        "omxterm.files",
        "omxterm.ssh",
        "omxterm.snippets",
      ]);
      const files = byId(entries, "omxterm.files");
      const ssh = byId(entries, "omxterm.ssh");
      expect(files).toMatchObject({
        name: "Files — ARM64 preview",
        version: "0.6.0",
        engines: { omxterm: ">=0.24.0-dev.21", api: "0.1.x" },
        targets: [target],
        archive: {
          url: "https://github.com/luizomf/omxterm/releases/download/ext-files-v0.6.0/files-0.6.0.omxext",
          sha256: filesSha,
          bytes: 17331,
        },
        sourceCommit: "cfc9073010df586eec321641ba5013862734f8fe",
        releaseUrl:
          "https://github.com/luizomf/omxterm/releases/tag/ext-files-v0.6.0",
      });
      expect(ssh).toMatchObject({
        name: "SSH Connect",
        version: "0.3.1",
        engines: { omxterm: ">=0.24.0-dev.8", api: "0.1.x" },
        targets: ["linux-arm64"],
        archive: {
          url: "https://github.com/luizomf/omxterm/releases/download/ext-ssh-v0.3.1/ssh-0.3.1.omxext",
          sha256: sshSha,
          bytes: 11606,
        },
        sourceCommit: "8717d47327eeab14f522b1b2a448216860d0923d",
        releaseUrl:
          "https://github.com/luizomf/omxterm/releases/tag/ext-ssh-v0.3.1",
      });
      for (const [name, release] of [
        ["files", files],
        ["ssh", ssh],
      ] as const) {
        const manifest = parseManifest(
          JSON.parse(
            await readFile(`extensions/${name}/extension.json`, "utf8"),
          ),
        );
        expect({
          id: manifest.id,
          version: manifest.version,
          engines: manifest.engines,
        }).toEqual({
          id: release.id,
          version: release.version,
          engines: release.engines,
        });
      }
    },
  );

  it("keeps SSH and Snippets equal across endpoints without restricting later Snippets targets", async () => {
    const linux = await readCatalog(targets[0][1]);
    const macos = await readCatalog(targets[1][1]);
    for (const id of ["omxterm.ssh", "omxterm.snippets"])
      expect(byId(linux, id)).toEqual(byId(macos, id));
    const snippets = byId(linux, "omxterm.snippets");
    expect(snippets).toMatchObject({
      version: "0.1.0",
      sourceCommit: "805e95dbc77552dc137707578b18b48ad6d047e9",
      archive: {
        bytes: 76653,
        sha256:
          "6c5723724d0dce26c589909405216c608dd071d7e9b04d63f733e012449c0ab7",
      },
    });
    expect(snippets.targets).toEqual(
      expect.arrayContaining([
        "linux-arm64",
        "darwin-arm64",
        "linux-x64",
        "win32-arm64",
      ]),
    );
  });

  it.each(targets)(
    "enforces Files version, API and target boundaries on %s",
    async (target, file) => {
      const files = byId(await readCatalog(file), "omxterm.files");
      for (const version of [
        "0.23.0",
        "0.24.0-dev.11",
        "0.24.0-dev.20",
        "0.24.2-dev.0",
      ])
        expect(catalogCompatible(files, runtime(version), target)).toBe(false);
      for (const version of [
        "0.24.0-dev.21",
        "0.24.0-dev.36",
        "0.24.0",
        "0.24.1-dev.0",
        "0.24.1",
        "0.25.0-dev.0",
        "0.25.0-dev.1",
      ])
        expect(catalogCompatible(files, runtime(version), target)).toBe(true);
      for (const host of ["0.24.0", "0.25.0-dev.0"])
        expect(catalogCompatible(files, runtime(host, "0.2.0"), target)).toBe(
          false,
        );
      for (const other of [
        "linux-x64",
        "darwin-x64",
        "win32-arm64",
        "win32-x64",
      ])
        for (const host of ["0.24.0", "0.25.0-dev.0"])
          expect(catalogCompatible(files, runtime(host), other)).toBe(false);
      const otherArm =
        target === "linux-arm64" ? "darwin-arm64" : "linux-arm64";
      for (const host of ["0.24.0", "0.25.0-dev.0"])
        expect(catalogCompatible(files, runtime(host), otherArm)).toBe(false);
      expect(
        catalogAction(files, {
          version: target === "linux-arm64" ? "0.4.0" : "0.5.0",
          digest: "old",
        }),
      ).toBe("update");
      expect(
        catalogAction(files, {
          version: files.version,
          digest: files.archive.sha256,
        }),
      ).toBe("reinstall");
      expect(
        catalogAction(files, { version: files.version, digest: "different" }),
      ).toBe("replace");
    },
  );

  it("preserves the historical manual Files route while the new Linux offer excludes dev.11–dev.20", async () => {
    const historical = byId(
      await readCatalog("test/fixtures/catalog-files-0.4-linux.json"),
      "omxterm.files",
    );
    const selected = byId(await readCatalog(targets[0][1]), "omxterm.files");
    for (const version of ["0.24.0-dev.11", "0.24.0-dev.20"]) {
      expect(
        catalogCompatible(historical, runtime(version), "linux-arm64"),
      ).toBe(true);
      expect(catalogCompatible(selected, runtime(version), "linux-arm64")).toBe(
        false,
      );
    }
    const old = parseManifest({
      format: 1,
      id: "omxterm.files",
      name: "Files",
      version: "0.1.0",
      engines: { omxterm: ">=0.23.0-dev.8 <0.24.0", api: "0.1.x" },
      backend: "backend.mjs",
    });
    expect(packageCompatible(old, runtime("0.24.0"))).toBe(false);
  });

  it("retains SSH host admission but does not advertise other targets", async () => {
    const ssh = byId(await readCatalog(targets[0][1]), "omxterm.ssh");
    expect(catalogCompatible(ssh, runtime("0.24.0-dev.7"), "linux-arm64")).toBe(
      false,
    );
    for (const version of ["0.24.0-dev.8", "0.24.0-dev.11", "0.24.0"])
      expect(catalogCompatible(ssh, runtime(version), "linux-arm64")).toBe(
        true,
      );
    for (const target of [
      "darwin-arm64",
      "linux-x64",
      "win32-arm64",
      "win32-x64",
    ])
      expect(catalogCompatible(ssh, runtime("0.24.0"), target)).toBe(false);
    expect(catalogAction(ssh, { version: "0.3.0", digest: "old" })).toBe(
      "update",
    );
  });
});

async function archiveManifest(bytes: Buffer) {
  const zip = await fromBufferPromise(bytes, { lazyEntries: true });
  try {
    for await (const entry of zip.eachEntry()) {
      if (entry.fileName !== "extension.json") continue;
      const stream = await zip.openReadStreamPromise(entry);
      const chunks: Buffer[] = [];
      for await (const chunk of stream as AsyncIterable<Buffer>)
        chunks.push(chunk);
      return JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
    }
    throw new Error("Missing archive manifest");
  } finally {
    zip.close();
  }
}

it.skipIf(!process.env.OMXTERM_RELEASE_ARCHIVE_DIR)(
  "binds both catalog entries to the explicitly supplied original archive/checksum/receipt trios",
  async () => {
    const root = process.env.OMXTERM_RELEASE_ARCHIVE_DIR!;
    expect(path.isAbsolute(root)).toBe(true);
    const entries = await readCatalog(targets[0][1]);
    for (const [name, id] of [
      ["files-0.6.0.omxext", "omxterm.files"],
      ["ssh-0.3.1.omxext", "omxterm.ssh"],
    ] as const) {
      const release = byId(entries, id);
      const archive = path.join(root, name);
      const bytes = await readFile(archive);
      const receipt = JSON.parse(await readFile(archive + ".json", "utf8")) as {
        source: { commit: string; identity: string; lockSha256: string };
        archive: { name: string; bytes: number; sha256: string };
        qualification: { status: string; intendedHost: string; target: string };
        manifest: unknown;
      };
      const checksum = await readFile(archive + ".sha256", "utf8");
      const digest = createHash("sha256").update(bytes).digest("hex");
      expect({ digest, size: bytes.length }).toEqual({
        digest: release.archive.sha256,
        size: release.archive.bytes,
      });
      expect(checksum).toBe(`${digest}  ${name}\n`);
      expect(receipt.source).toMatchObject({
        commit: release.sourceCommit,
        identity: "clean-git-head",
        lockSha256:
          "8c84b5e9d56878214e4e9468e6d79a3c8d0a92e288c7d1375b5324386b290d94",
      });
      expect(receipt.archive).toEqual({
        name,
        bytes: bytes.length,
        sha256: digest,
      });
      expect(receipt.qualification).toEqual({
        status: "not-run",
        intendedHost: "0.24.0",
        target: "linux-arm64",
      });
      const embedded = await archiveManifest(bytes);
      expect(embedded).toEqual(receipt.manifest);
      const manifest = parseManifest(embedded);
      expect({
        id: manifest.id,
        version: manifest.version,
        engines: manifest.engines,
      }).toEqual({
        id: release.id,
        version: release.version,
        engines: release.engines,
      });
    }
  },
);
