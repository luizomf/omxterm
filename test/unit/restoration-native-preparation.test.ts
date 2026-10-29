import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it } from "vitest";
import {
  prepareRestorationFixture,
  RESTORATION_ARTIFACTS,
} from "../fixtures/restoration-production-build";
import {
  assertRestorationReceipt,
  RESTORATION_CHECKS,
  type RestorationReceipt,
} from "../fixtures/restoration-native-contract";
const roots: string[] = [];
afterEach(async () => {
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});
const hash = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");
async function inputs(version = "0.24.0-dev.2") {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "omxterm-restoration-preparation-"),
  );
  roots.push(root);
  const source = path.join(root, "source");
  const run = path.join(root, "run");
  await mkdir(source);
  await mkdir(run);
  await writeFile(
    path.join(source, "package.json"),
    JSON.stringify({ version }),
  );
  for (const name of RESTORATION_ARTIFACTS) {
    await mkdir(path.dirname(path.join(source, name)), { recursive: true });
    // Intentionally not executable artifacts: headless preparation must only read
    // these bytes, never import production Electron or load the native addon.
    await writeFile(path.join(source, name), `headless-placeholder:${name}`);
  }
  const archive = path.join(root, "input.omxext");
  await writeFile(archive, "captured-fixture-archive");
  return {
    root: run,
    options: {
      source,
      archive,
      archiveSha256: hash(await readFile(archive)),
      evidence: path.join(root, "evidence"),
    },
  };
}
it.each(["0.24.0-dev.1", "0.24.0-dev.2"])(
  "preserves actual host %s and production artifacts while bundling only observers",
  async (version) => {
    const f = await inputs(version);
    const before = await readFile(
      path.join(f.options.source, "dist/main/index.js"),
    );
    await prepareRestorationFixture(f.root, f.options);
    expect(await readFile(path.join(f.root, "restoration.omxext"))).toEqual(
      await readFile(f.options.archive),
    );
    expect(
      await readFile(path.join(f.options.source, "dist/main/index.js")),
    ).toEqual(before);
    const metadata = JSON.parse(
      await readFile(path.join(f.root, "package.json"), "utf8"),
    ) as { version: string; main: string };
    expect(metadata).toMatchObject({ version, main: "main.mjs" });
    const recorded = JSON.parse(
      await readFile(path.join(f.options.evidence, "inputs.json"), "utf8"),
    );
    expect(recorded.version).toBe(version);
    const build = JSON.parse(
      await readFile(
        path.join(f.options.evidence, "observer-build.json"),
        "utf8",
      ),
    ) as { sha256: string; inputs: string[] };
    expect(build.sha256).toBe(
      hash(await readFile(path.join(f.root, "main.mjs"))),
    );
    expect(build.inputs).toContain("test/fixtures/native-fixture-pty.ts");
    expect(build.inputs).toContain("test/fixtures/native-fixture-ownership.ts");
    expect(build.inputs).not.toContain("src/main/index.ts");
    expect(
      build.inputs.some((input) => input.includes("restty-terminal-surface")),
    ).toBe(false);
    const bundled = await readFile(path.join(f.root, "main.mjs"), "utf8");
    expect(bundled).toContain("dist/main/index.js");
    expect(bundled).toContain("extension-runtime/bootstrap.mjs");
    expect(bundled).toContain("cold-saved-layout.png");
    expect(bundled).toContain("restored-window-fallback.png");
    await expect(
      prepareRestorationFixture(f.root, f.options),
    ).rejects.toMatchObject({ code: "EEXIST" });
  },
);
it("refuses the wrong archive digest or host version before building/launching", async () => {
  const f = await inputs();
  await expect(
    prepareRestorationFixture(f.root, {
      ...f.options,
      archiveSha256: "0".repeat(64),
    }),
  ).rejects.toThrow("separate archive digest");
  for (const version of ["0.24.0-dev.0", "0.24.0-dev.3", "0.24.0", "0.25.0"]) {
    await writeFile(
      path.join(f.options.source, "package.json"),
      JSON.stringify({ version }),
    );
    await expect(prepareRestorationFixture(f.root, f.options)).rejects.toThrow(
      "selected host milestone",
    );
  }
});
function receipt(): RestorationReceipt {
  return {
    failed: false,
    checks: [...RESTORATION_CHECKS],
    approvals: 1,
    quit: "joined",
    ptys: Array.from({ length: 8 }, (_, index) => ({
      pid: 100 + index,
      exited: true,
    })),
    backends: [
      { pid: 200, closed: true },
      { pid: 201, closed: true },
    ],
    sourcePreserved: true,
    freshOutput: true,
    verifiedPanes: 4,
    fallbackNotice: true,
  };
}
it("requires every production phase and actual retirement facts, not a completion marker alone", () => {
  expect(() => assertRestorationReceipt(receipt())).not.toThrow();
  for (const corrupt of [
    (value: RestorationReceipt) => {
      value.checks.splice(4, 1);
    },
    (value: RestorationReceipt) => {
      value.ptys[0]!.exited = false;
    },
    (value: RestorationReceipt) => {
      value.backends[1]!.closed = false;
    },
    (value: RestorationReceipt) => {
      value.sourcePreserved = false;
    },
    (value: RestorationReceipt) => {
      value.freshOutput = false;
    },
    (value: RestorationReceipt) => {
      value.fallbackNotice = false;
    },
    (value: RestorationReceipt) => {
      value.verifiedPanes = 3;
    },
    (value: RestorationReceipt) => {
      value.ptys.push({ pid: 500, exited: true });
    },
  ]) {
    const invalid = receipt();
    corrupt(invalid);
    expect(() => assertRestorationReceipt(invalid)).toThrow();
  }
});
