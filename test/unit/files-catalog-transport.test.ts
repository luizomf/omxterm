import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import { createHash } from "node:crypto";
import { expect, it } from "vitest";
import { downloadExtension } from "../../src/main/extension-download";
import {
  OFFICIAL_CATALOG_URL,
  catalogAction,
  parseCatalog,
} from "../../src/main/extension-catalog";
const require = createRequire(import.meta.url);
it
  .skipIf(process.platform === "win32")
  .each(["0.1.0", "0.4.0", "0.4.0-rc.1+build.2"])(
  "the controlled catalog previews a newer offer and restores exact %s bytes over real TLS",
  async (version) => {
    const root = await mkdtemp(path.join(os.tmpdir(), "omxterm-catalog-tls-"));
    const helper = require("../fixtures/files-catalog-transport.cjs") as {
      start(options: Record<string, string>): Promise<{
        requests: string[];
        available(value: boolean): void;
        validArchive(value: boolean): void;
        previewUpdate(): void;
        restoreRelease(): void;
        close(): Promise<void>;
      }>;
    };
    let transport: Awaited<ReturnType<typeof helper.start>> | undefined;
    try {
      const archive = path.join(root, "files.omxext");
      const archiveUrl =
        "https://github.com/luizomf/omxterm/releases/download/ext-files-fixture/files.omxext";
      const bytes = Buffer.from("fixture bytes");
      const hash = createHash("sha256").update(bytes).digest("hex");
      const catalogFile = path.join(root, "catalog.json");
      const catalogCertificate = path.join(root, "cert.pem");
      const catalogKey = path.join(root, "key.pem");
      await writeFile(archive, bytes);
      await writeFile(
        catalogFile,
        JSON.stringify(
          {
            schemaVersion: 1,
            entries: [
              {
                id: "omxterm.files",
                name: "Files",
                description: "Controlled fixture",
                version,
                engines: { omxterm: ">=0.24.0-dev.8", api: "0.1.x" },
                targets: ["linux-arm64"],
                archive: { url: archiveUrl, sha256: hash, bytes: bytes.length },
                sourceCommit: "a".repeat(40),
                releaseUrl:
                  "https://github.com/luizomf/omxterm/releases/tag/ext-files-fixture",
              },
            ],
          },
          null,
          2,
        ) + "\n",
      );
      execFileSync(
        "openssl",
        [
          "req",
          "-x509",
          "-newkey",
          "rsa:2048",
          "-nodes",
          "-keyout",
          catalogKey,
          "-out",
          catalogCertificate,
          "-days",
          "1",
          "-subj",
          "/CN=127.0.0.1",
          "-addext",
          "subjectAltName=IP:127.0.0.1",
        ],
        { timeout: 10000, stdio: "pipe" },
      );
      transport = await helper.start({
        archive,
        archiveSha256: hash,
        catalogFile,
        catalogCertificate,
        catalogKey,
      });
      const signal = new AbortController().signal;
      await expect(
        downloadExtension(OFFICIAL_CATALOG_URL, signal, 262144),
      ).rejects.toThrow("download-failed");
      transport.available(true);
      expect(
        await downloadExtension(OFFICIAL_CATALOG_URL, signal, 262144),
      ).toEqual(await readFile(catalogFile));
      expect(await downloadExtension(archiveUrl, signal)).toEqual(
        Buffer.from("wrong bytes"),
      );
      transport.validArchive(true);
      expect(await downloadExtension(archiveUrl, signal)).toEqual(bytes);
      const originalCatalog = await readFile(catalogFile);
      const original = parseCatalog(originalCatalog)[0]!;
      const installed = { version, digest: hash };
      expect(catalogAction(original, installed)).toBe("reinstall");
      transport.previewUpdate();
      // Repeated preview calls must not keep incrementing the offered version.
      transport.previewUpdate();
      const preview = parseCatalog(
        await downloadExtension(OFFICIAL_CATALOG_URL, signal, 262144),
      )[0]!;
      expect(catalogAction(preview, installed)).toBe("update");
      expect(preview).toEqual({ ...original, version: preview.version });
      expect(preview.version).toBe(version === "0.1.0" ? "0.1.1" : "0.4.1");
      // Synthetic metadata is presentation-only, even with valid archive bytes.
      await expect(downloadExtension(archiveUrl, signal)).rejects.toThrow(
        "download-failed",
      );
      transport.restoreRelease();
      transport.restoreRelease();
      const restored = await downloadExtension(
        OFFICIAL_CATALOG_URL,
        signal,
        262144,
      );
      expect(restored).toEqual(originalCatalog);
      expect(catalogAction(parseCatalog(restored)[0]!, installed)).toBe(
        "reinstall",
      );
      expect(await downloadExtension(archiveUrl, signal)).toEqual(bytes);
      expect(await readFile(catalogFile)).toEqual(originalCatalog);
      expect(transport.requests).toEqual([
        "/catalog",
        "/catalog",
        "/archive",
        "/archive",
        "/catalog",
        "/archive",
        "/catalog",
        "/archive",
      ]);
      await transport.close();
      await transport.close();
    } finally {
      await transport?.close();
      await rm(root, { recursive: true, force: true });
    }
  },
);
