import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { RESTORATION_ARTIFACTS } from "./restoration-production-build";

export const MIRROR_ARTIFACTS = RESTORATION_ARTIFACTS;
export type MirrorInputs = {
  source: string;
  sourceCommit: string;
  archive: string;
  archiveSha256: string;
  evidence: string;
};
const digest = (bytes: Buffer | string) =>
  createHash("sha256").update(bytes).digest("hex");
/** Read-only identities; transported source commit is caller-attested, not Git verification. */
async function inventory(source: string, names: string[]) {
  const result: Record<string, string> = {};
  async function visit(name: string) {
    const entries = await readdir(path.join(source, name), {
      withFileTypes: true,
    });
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const child = `${name}/${entry.name}`;
      if (entry.isDirectory()) await visit(child);
      else if (entry.isFile())
        result[child] = digest(await readFile(path.join(source, child)));
      else throw new Error(`Unexpected non-regular identity input: ${child}`);
    }
  }
  for (const name of names) await visit(name);
  return result;
}
export async function prepareMirrorFixture(
  root: string,
  options: MirrorInputs,
) {
  for (const value of [root, options.source, options.archive, options.evidence])
    assert.ok(path.isAbsolute(value), "absolute fixture input required");
  assert.match(options.sourceCommit, /^[a-f0-9]{40}$/);
  assert.match(options.archiveSha256, /^[a-f0-9]{64}$/);
  const metadata = JSON.parse(
    await readFile(path.join(options.source, "package.json"), "utf8"),
  ) as { version: string };
  assert.equal(metadata.version, "0.24.0-dev.2", "selected host milestone");
  const archive = await readFile(options.archive);
  assert.equal(
    digest(archive),
    options.archiveSha256,
    "separate archive digest",
  );
  for (const name of MIRROR_ARTIFACTS)
    await readFile(path.join(options.source, name));
  const artifacts = await inventory(options.source, ["dist"]);
  const sources = await inventory(options.source, [
    "src",
    "extensions",
    "scripts",
    "test",
  ]);
  for (const name of ["package.json", "package-lock.json", "build.mjs"])
    sources[name] = digest(await readFile(path.join(options.source, name)));
  await mkdir(options.evidence, { recursive: true });
  await writeFile(
    path.join(options.evidence, "inputs.json"),
    JSON.stringify(
      {
        version: metadata.version,
        sourceCommit: options.sourceCommit,
        sourceIdentity:
          "caller-supplied commit; hashed source bytes, not build correspondence proof",
        sources,
        sourceManifestSha256: digest(JSON.stringify(sources)),
        artifacts,
        archiveSha256: options.archiveSha256,
        scope:
          "built production main; synthetic chooser/trust, Chromium keyboard, raw PTY fence program, isolated profile; en-US; not physical input or package qualification",
      },
      null,
      2,
    ),
    { flag: "wx" },
  );
  await writeFile(path.join(root, "mirror.omxext"), archive, {
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
  await writeFile(path.join(root, "fixture.json"), JSON.stringify(options));
  const bundled = await build({
    absWorkingDir: fileURLToPath(new URL("../..", import.meta.url)),
    entryPoints: ["test/fixtures/mirror-production-main.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    external: ["electron", "node-pty"],
    outfile: path.join(root, "main.mjs"),
    logLevel: "silent",
    metafile: true,
  });
  const inputs: Record<string, string> = {};
  for (const name of Object.keys(bundled.metafile.inputs))
    inputs[name] = digest(
      await readFile(fileURLToPath(new URL(`../../${name}`, import.meta.url))),
    );
  await writeFile(
    path.join(options.evidence, "observer-build.json"),
    JSON.stringify(
      {
        sha256: digest(await readFile(path.join(root, "main.mjs"))),
        inputs,
      },
      null,
      2,
    ),
    { flag: "wx" },
  );
}
