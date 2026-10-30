import assert from "node:assert/strict";
import { lstat, readFile, writeFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { packageArchive } from "./extension-package-archive";
import type {
  Installation,
  CleanupResult,
  OpenVersion,
} from "../../src/installed-packages/installed-packages";
import path from "node:path";
import { createHash } from "node:crypto";
import { extensionResourceOwner } from "../../src/main/extension-view-reader";
import type { CapturedResourceOwner } from "../../src/main/extension-view-resources";

async function replacementResources(fresh: OpenVersion, digest: string) {
  try {
    assert.equal(fresh.digest, digest);
    assert.equal(await fresh.revalidate(), true);
  } catch (error) {
    await fresh.release();
    throw error;
  }
  let releases = 0;
  return {
    resources: extensionResourceOwner({
      ...fresh,
      async release() {
        await fresh.release();
        releases += 1;
      },
    }),
    releases: () => releases,
  };
}

// Load the real build artifact as ESM: bundling its import.meta-based native
// loader into Window Chrome's CJS entry would destroy the addon loader's base.
export async function createExtensionFixtureResources(root: string) {
  const built = path.join(root, "installed-packages");
  const { InstalledPackages, createNativeLeaseAdapter } = (await import(
    pathToFileURL(path.join(built, "index.mjs")).href
  )) as typeof import("../../src/installed-packages/installed-packages");
  const store = await InstalledPackages.open({
    root: path.join(root, "package-store"),
    runtime: { appVersion: "0.23.0-dev.1", apiVersion: "0.1.0" },
    leases: createNativeLeaseAdapter(path.join(built, "extension-leases.node")),
  });
  const html = `<!doctype html><meta charset="utf-8"><title>Captured A</title>
<link rel="stylesheet" href="page.css"><h1>Captured A</h1>
<label>Synthetic draft <input id="draft" value="A draft"></label>
<script src="page.js"></script>`;
  const assets = [
    { name: "index.html", data: html },
    {
      name: "page.css",
      data: "body { background: #202430; color: white; font: 18px sans-serif; padding: 20px; } input { font: inherit; }",
    },
    { name: "canary.js", data: "throw new Error('Worker canary executed');" },
    {
      name: "page.js",
      data: `
window.receipts = { violations: [], workers: [], serviceWorker: null, connect: null, popup: null, keys: [] };
document.addEventListener('securitypolicyviolation', event => receipts.violations.push({ directive: event.effectiveDirective, blocked: event.blockedURI }));
document.addEventListener('keydown', event => receipts.keys.push(event.key));
window.probePolicy = async () => {
  for (const kind of ['Worker', 'SharedWorker']) for (const source of ['local', 'blob']) {
    const url = source === 'local' ? new URL('canary.js', location.href).href : URL.createObjectURL(new Blob(['throw new Error("Worker canary executed")'], {type:'text/javascript'}));
    const outcome = await new Promise(resolve => {
      let worker;
      const timer = setTimeout(() => { worker?.terminate?.(); resolve('timeout'); }, 2000);
      const finish = value => { clearTimeout(timer); worker?.terminate?.(); worker?.port?.close(); resolve(value); };
      try { worker = new window[kind](url); worker.onerror = event => { event.preventDefault(); finish('error'); }; worker.onmessage = () => finish('executed'); }
      catch { finish('threw'); }
    });
    receipts.workers.push({kind, source, outcome});
    if (source === 'blob') URL.revokeObjectURL(url);
  }
  try { await navigator.serviceWorker.register('canary.js'); receipts.serviceWorker = 'registered'; } catch { receipts.serviceWorker = 'failed'; }
  try { await fetch(new URL('canary.js', location.href)); receipts.connect = 'allowed'; } catch { receipts.connect = 'failed'; }
  receipts.popup = window.open('index.html') === null ? 'denied' : 'opened';
  return receipts;
};
`,
    },
  ];
  const archive = async (version: "A" | "B") => {
    const file = path.join(root, `resource-${version}.omxext`);
    await writeFile(
      file,
      packageArchive([
        {
          name: "extension.json",
          data: JSON.stringify({
            format: 1,
            id: "test.hosted-composition",
            name: "Synthetic hosted composition",
            version: version === "A" ? "1.0.0" : "2.0.0",
            engines: { omxterm: ">=0.23.0-0 <0.24.0", api: "0.1.x" },
            backend: "backend/index.mjs",
          }),
        },
        // Neither installation nor this UI-only fixture may import this entrypoint.
        {
          name: "backend/index.mjs",
          data: "throw new Error('synthetic backend must never execute');",
          compressed: true,
        },
        ...assets.map((asset) => ({
          ...asset,
          data:
            version === "A"
              ? asset.data
              : asset.data
                  .replaceAll("Captured A", "Latest B")
                  .replaceAll("A draft", "B draft"),
        })),
      ]),
    );
    return file;
  };
  const first = await store.install(await archive("A"), {
    expectedGeneration: 0,
    enabled: true,
  });
  const pin = await store.openVersion(first.id);
  // The complete real pin stays private to this main-process resource owner.
  // Admission revalidation is separate from later reads of an already-live epoch.
  let admitted: boolean;
  try {
    admitted = await pin.revalidate();
    assert.equal(admitted, true);
    assert.equal(pin.digest, first.digest);
    assert.equal(pin.generation, 1);
  } catch (error) {
    await pin.release();
    throw error;
  }
  let replacement: Installation | undefined;
  let pending: CleanupResult | undefined;
  let released = 0;
  let active = 0;
  let attempts = 0;
  let attemptsAtRelease = -1;
  const reads: Array<{ resource: string; bytes: number; sha256: string }> = [];
  const captured = extensionResourceOwner({
    ...pin,
    async release() {
      assert.equal(
        active,
        0,
        "captured owner releases only after actual reads settle",
      );
      attemptsAtRelease = attempts;
      await pin.release();
      released += 1;
    },
  });
  const resources: CapturedResourceOwner = {
    async read(resource, maximum, signal) {
      attempts += 1;
      assert.equal(
        released,
        0,
        "no resource read after captured-owner release",
      );
      active += 1;
      try {
        const bytes = await captured.read(resource, maximum, signal);
        if (resource === "index.html")
          assert.equal(Buffer.from(bytes).toString(), html);
        reads.push({
          resource,
          bytes: bytes.length,
          sha256: createHash("sha256").update(bytes).digest("hex"),
        });
        return bytes;
      } finally {
        active -= 1;
      }
    },
    release: () => captured.release(),
  };
  return {
    resources,
    async openReplacement() {
      assert.ok(replacement);
      assert.ok(replacement.digest);
      return replacementResources(
        await store.openVersion(first.id),
        replacement.digest,
      );
    },
    async replaceCurrent() {
      assert.equal(replacement, undefined, "one bounded update only");
      replacement = await store.install(await archive("B"), {
        expectedGeneration: 1,
        enabled: true,
      });
      assert.equal(replacement.generation, 2);
      assert.notEqual(replacement.digest, first.digest);
      assert.equal(
        await pin.revalidate(),
        false,
        "A is no longer current, but its live epoch retains the pin",
      );
      pending = await store.collect();
      assert.deepEqual(pending.removed, []);
      assert.deepEqual(pending.pending, [first.digest]);
      assert.equal(pending.more, false);
      assert.equal((await lstat(pin.directory)).isDirectory(), true);
      // A fresh actual reader call after registry replacement must still read A.
      const bytes = await resources.read(
        "index.html",
        4096,
        new AbortController().signal,
      );
      assert.equal(Buffer.from(bytes).toString(), html);
      const current = await store.openVersion(first.id);
      try {
        assert.equal(current.digest, replacement.digest);
        assert.equal(
          await readFile(path.join(current.directory, "index.html"), "utf8"),
          html
            .replaceAll("Captured A", "Latest B")
            .replaceAll("A draft", "B draft"),
        );
      } finally {
        await current.release();
      }
    },
    async assertRetired() {
      assert.ok(replacement);
      assert.ok(pending);
      assert.equal(released, 1);
      assert.equal(active, 0);
      assert.equal(
        attempts,
        attemptsAtRelease,
        "retired host never calls captured owner again",
      );
      const count = reads.length;
      await assert.rejects(
        captured.read("index.html", 1024, new AbortController().signal),
      );
      assert.equal(reads.length, count);
      const collected = await store.collect();
      assert.deepEqual(collected.removed, [first.digest]);
      assert.deepEqual(collected.pending, []);
      assert.equal(collected.more, false);
      await assert.rejects(lstat(pin.directory), { code: "ENOENT" });
      const current = await store.openVersion(first.id);
      try {
        assert.equal(current.digest, replacement.digest);
        assert.equal((await lstat(current.directory)).isDirectory(), true);
        assert.equal(
          await readFile(path.join(current.directory, "index.html"), "utf8"),
          html
            .replaceAll("Captured A", "Latest B")
            .replaceAll("A draft", "B draft"),
        );
      } finally {
        await current.release();
      }
      assert.deepEqual((await store.collect()).removed, []);
      return {
        admitted,
        first: { digest: first.digest, generation: first.generation },
        replacement: {
          digest: replacement.digest,
          generation: replacement.generation,
        },
        pending,
        collected,
        replacementDirectoryRetained: true,
        reads: [...reads],
        capturedVersion: "A",
        installedCurrentVersion: "B",
        attempts,
        attemptsAtRelease,
        released,
        active,
        postReleaseRead: "rejected",
      };
    },
  };
}
