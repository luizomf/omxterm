import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import os from "node:os";
import { it, expect } from "vitest";
import { createFilesCatalog } from "../../scripts/create-files-catalog.mjs";
import { parseCatalog } from "../../src/main/extension-catalog";
import { packageArchive } from "../fixtures/extension-package-archive";
it("generates a production-valid catalog from exact archive/receipt metadata, refuses clobber and tampering", async () => {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "omxterm-catalog-artifact-"),
  );
  try {
    const metadata: unknown = JSON.parse(
      await readFile("extensions/files/extension.json", "utf8"),
    );
    const bytes = packageArchive([
      { name: "extension.json", data: JSON.stringify(metadata) },
      { name: "LICENSE", data: "MIT" },
    ]);
    const file = path.join(root, "files-candidate.omxext");
    const output = path.join(root, "catalog.json");
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    const receipt = {
      format: 1,
      archive: { name: path.basename(file), bytes: bytes.length, sha256 },
      manifest: metadata,
      source: { commit: "a".repeat(40) },
    };
    await writeFile(file, bytes);
    await writeFile(file + ".json", JSON.stringify(receipt));
    await writeFile(file + ".sha256", `${sha256}  ${path.basename(file)}\n`);
    const candidate = await createFilesCatalog(file, output);
    expect(parseCatalog(await readFile(output))).toEqual(candidate.entries);
    expect(candidate.entries[0]?.archive.sha256).toBe(sha256);
    expect(candidate.entries[0]?.sourceCommit).toBe(receipt.source.commit);
    await expect(createFilesCatalog(file, output)).rejects.toThrow("EEXIST");
    await writeFile(file, Buffer.concat([bytes, Buffer.from("changed")]));
    await expect(
      createFilesCatalog(file, path.join(root, "bad.json")),
    ).rejects.toThrow("mismatch");
    await expect(readFile(path.join(root, "bad.json"))).rejects.toThrow(
      "ENOENT",
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
