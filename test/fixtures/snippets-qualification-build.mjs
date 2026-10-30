// Isolated native qualification output with unchanged production composition.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";

const source = path.resolve(import.meta.dirname, "../..");
const output = process.argv[2];
assert.ok(output && path.isAbsolute(output), "absolute new output required");
assert.ok(["linux", "darwin"].includes(process.platform));
assert.equal(process.arch, "arm64");
await mkdir(output);
// Preserve the ordinary development layout: main resolves ../.. / assets
// from dist/main. Every copied asset stays inside this newly owned output.
await cp(path.join(source, "dist"), path.join(output, "dist"), {
  recursive: true,
});
const icon = "assets/application-icon.png";
await mkdir(path.join(output, "assets"));
await cp(path.join(source, icon), path.join(output, icon));
await symlink(
  path.join(source, "node_modules"),
  path.join(output, "node_modules"),
);
await writeFile(path.join(output, "package.json"), '{"type":"module"}\n');
const inputs = {
  [icon]: createHash("sha256")
    .update(await readFile(path.join(source, icon)))
    .digest("hex"),
};
const common = {
  absWorkingDir: source,
  bundle: true,
  sourcemap: true,
  metafile: true,
};
const results = await Promise.all([
  build({
    ...common,
    entryPoints: ["src/main/index.ts"],
    platform: "node",
    format: "esm",
    external: ["electron", "node-pty", "yaml", "yauzl", "semver"],
    outfile: path.join(output, "dist/main/index.js"),
  }),
  build({
    ...common,
    entryPoints: ["src/renderer/index.ts"],
    platform: "browser",
    format: "iife",
    loader: { ".ttf": "binary" },
    outfile: path.join(output, "dist/renderer/index.js"),
  }),
]);
for (const result of results) {
  for (const name of Object.keys(result.metafile.inputs))
    inputs[name] = createHash("sha256")
      .update(await readFile(path.join(source, name)))
      .digest("hex");
}
await writeFile(
  path.join(output, "qualification.json"),
  JSON.stringify(
    {
      inputs,
      differences: [],
      scope: `Unchanged production ${process.platform} ARM64 composition in an isolated qualification output; not publication or cross-platform qualification`,
    },
    null,
    2,
  ),
);
console.log(path.join(output, "dist/main/index.js"));
