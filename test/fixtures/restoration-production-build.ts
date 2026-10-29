import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const project = fileURLToPath(new URL("../..", import.meta.url));
export const RESTORATION_ARTIFACTS = [
  "dist/main/index.js",
  "dist/preload/index.cjs",
  "dist/preload/extension-view.cjs",
  "dist/renderer/index.js",
  "dist/renderer/index.html",
  "dist/extension-runtime/index.mjs",
  "dist/extension-runtime/bootstrap.mjs",
  "dist/extension-runtime/packages.mjs",
  "dist/extension-runtime/extension-leases.node",
] as const;
export type RestorationInputs = {
  source: string;
  archive: string;
  archiveSha256: string;
  evidence: string;
};
const digest = (bytes: Buffer) =>
  createHash("sha256").update(bytes).digest("hex");

/** File-only preparation. Bundles observers, never builds or executes native code. */
export async function prepareRestorationFixture(
  root: string,
  options: RestorationInputs,
) {
  for (const value of [root, options.source, options.archive, options.evidence])
    assert.ok(path.isAbsolute(value), "absolute fixture input required");
  assert.match(options.archiveSha256, /^[a-f0-9]{64}$/);
  const metadata = JSON.parse(
    await readFile(path.join(options.source, "package.json"), "utf8"),
  ) as { version: string };
  // Keep historical dev.1 runs reproducible; admit only the assigned follow-up.
  assert.ok(
    ["0.24.0-dev.1", "0.24.0-dev.2"].includes(metadata.version),
    "selected host milestone",
  );
  const archive = await readFile(options.archive);
  assert.equal(
    digest(archive),
    options.archiveSha256,
    "separate archive digest",
  );
  const artifacts: Record<string, string> = {};
  for (const name of RESTORATION_ARTIFACTS)
    artifacts[name] = digest(await readFile(path.join(options.source, name)));
  await mkdir(options.evidence, { recursive: true });
  await writeFile(
    path.join(options.evidence, "inputs.json"),
    JSON.stringify(
      {
        version: metadata.version,
        archiveSha256: options.archiveSha256,
        artifacts,
        scope:
          "built production entry; controlled consent, synthetic input and isolated account home; no package qualification",
      },
      null,
      2,
    ),
    { flag: "wx" },
  );
  await writeFile(path.join(root, "restoration.omxext"), archive, {
    flag: "wx",
    mode: 0o600,
  });
  await writeFile(
    path.join(root, "package.json"),
    JSON.stringify({
      name: "omxterm",
      version: metadata.version,
      type: "module",
      main: "main.mjs",
    }),
  );
  await writeFile(
    path.join(root, "fixture.json"),
    JSON.stringify({
      source: options.source,
      archiveSha256: options.archiveSha256,
      evidence: options.evidence,
    }),
  );
  const bundled = await build({
    absWorkingDir: project,
    entryPoints: ["test/fixtures/restoration-production-main.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    external: ["electron", "node-pty"],
    outfile: path.join(root, "main.mjs"),
    logLevel: "silent",
    metafile: true,
  });
  await writeFile(
    path.join(options.evidence, "observer-build.json"),
    JSON.stringify(
      {
        sha256: digest(await readFile(path.join(root, "main.mjs"))),
        inputs: Object.keys(bundled.metafile.inputs),
      },
      null,
      2,
    ),
    { flag: "wx" },
  );
}
