import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import {
  prepareMirrorFixture,
  MIRROR_ARTIFACTS,
} from "../fixtures/mirror-production-build";
import {
  assertMirrorReceipt,
  MIRROR_CHECKS,
  MIRROR_EXPECTED_FENCES,
  type MirrorReceipt,
} from "../fixtures/mirror-native-contract";
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
const hash = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
async function inputs() {
  const base = await mkdtemp(
    path.join(os.tmpdir(), "omxterm-mirror-preparation-"),
  );
  roots.push(base);
  const source = path.join(base, "source");
  const root = path.join(base, "run");
  await mkdir(root);
  for (const name of ["src", "extensions", "scripts", "test"])
    await mkdir(path.join(source, name), { recursive: true });
  await writeFile(
    path.join(source, "package.json"),
    JSON.stringify({ version: "0.24.0-dev.2" }),
  );
  for (const name of [
    "package-lock.json",
    "build.mjs",
    "src/synthetic.ts",
    ...MIRROR_ARTIFACTS,
  ]) {
    await mkdir(path.dirname(path.join(source, name)), { recursive: true });
    // Not executable. Preparation must never import a host or native addon.
    await writeFile(path.join(source, name), `headless-placeholder:${name}`);
  }
  const archive = path.join(base, "input.omxext");
  await writeFile(archive, "synthetic-separate-archive");
  return {
    root,
    options: {
      source,
      sourceCommit: "a".repeat(40),
      archive,
      archiveSha256: hash(await readFile(archive)),
      evidence: path.join(base, "evidence"),
    },
  };
}
it("bundles only observers and records separate archive, source and host hashes without executing them", async () => {
  const f = await inputs();
  const main = path.join(f.options.source, "dist/main/index.js");
  const before = await readFile(main);
  await prepareMirrorFixture(f.root, f.options);
  expect(await readFile(main)).toEqual(before);
  expect(await readFile(path.join(f.root, "mirror.omxext"))).toEqual(
    await readFile(f.options.archive),
  );
  const receipt = JSON.parse(
    await readFile(path.join(f.options.evidence, "inputs.json"), "utf8"),
  ) as {
    version: string;
    artifacts: Record<string, string>;
    sources: Record<string, string>;
    sourceManifestSha256: string;
  };
  expect(receipt.version).toBe("0.24.0-dev.2");
  expect(receipt.artifacts["dist/main/index.js"]).toBe(hash(before));
  expect(receipt.sources["src/synthetic.ts"]).toBe(
    hash(await readFile(path.join(f.options.source, "src/synthetic.ts"))),
  );
  expect(receipt.sourceManifestSha256).toBe(
    hash(Buffer.from(JSON.stringify(receipt.sources))),
  );
  const build = JSON.parse(
    await readFile(
      path.join(f.options.evidence, "observer-build.json"),
      "utf8",
    ),
  ) as { sha256: string; inputs: Record<string, string> };
  expect(build.sha256).toBe(
    hash(await readFile(path.join(f.root, "main.mjs"))),
  );
  expect(Object.keys(build.inputs)).toContain(
    "test/fixtures/native-fixture-pty.ts",
  );
  expect(Object.keys(build.inputs)).toContain(
    "test/fixtures/native-fixture-ownership.ts",
  );
  expect(
    Object.keys(build.inputs).some(
      (name) =>
        name.startsWith("src/") || name.includes("mirror-production-build"),
    ),
  ).toBe(false);
  await expect(prepareMirrorFixture(f.root, f.options)).rejects.toMatchObject({
    code: "EEXIST",
  });
});
it("rejects archive mismatch, wrong milestone and invalid source identity before launch", async () => {
  const f = await inputs();
  await expect(
    prepareMirrorFixture(f.root, {
      ...f.options,
      archiveSha256: "0".repeat(64),
    }),
  ).rejects.toThrow("separate archive digest");
  await expect(
    prepareMirrorFixture(f.root, { ...f.options, sourceCommit: "unknown" }),
  ).rejects.toThrow();
  await writeFile(
    path.join(f.options.source, "package.json"),
    JSON.stringify({ version: "0.24.0-dev.1" }),
  );
  await expect(prepareMirrorFixture(f.root, f.options)).rejects.toThrow(
    "selected host milestone",
  );
});
function receipt(): MirrorReceipt {
  return {
    failed: false,
    checks: [...MIRROR_CHECKS],
    approvals: 1,
    semanticStopBeforeWrite: true,
    quit: "joined",
    ptys: [100, 101, 102].map((pid) => ({ pid, exited: true })),
    backends: [{ pid: 200, closed: true }],
    fences: [
      "first-source",
      "second-source",
      "stopped",
      "paste",
      "retired",
    ].map((label, i) => ({
      label,
      expected: [...MIRROR_EXPECTED_FENCES[i]!],
      received: [...MIRROR_EXPECTED_FENCES[i]!],
    })),
  };
}
it("rejects empty-peer false passes, duplicate delivery, missing stages and unjoined retirement", () => {
  expect(() => assertMirrorReceipt(receipt())).not.toThrow();
  const corruptions: ((value: MirrorReceipt) => void)[] = [
    (r) => {
      r.semanticStopBeforeWrite = false;
    },
    (r) => {
      r.fences[0]!.received[1] = "";
    },
    (r) => {
      r.fences[0]!.received[0] = "aa|";
    },
    (r) => {
      r.fences[0]!.received[2] = "a|";
    },
    (r) => {
      r.fences[0]!.expected = r.fences[0]!.received = ["", "", ""];
    },
    (r) => {
      r.checks.pop();
    },
    (r) => {
      r.ptys[0]!.exited = false;
    },
    (r) => {
      r.backends[0]!.closed = false;
    },
    (r) => {
      r.quit = "unsettled";
    },
    (r) => {
      r.failed = true;
    },
  ];
  for (const corrupt of corruptions) {
    const value = receipt();
    corrupt(value);
    expect(() => assertMirrorReceipt(value)).toThrow();
  }
});
