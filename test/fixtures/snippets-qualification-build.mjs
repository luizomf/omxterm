// Test-only composition: no production flag, mutation or shipped cutover.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { cp, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";

const source = path.resolve(import.meta.dirname, "../..");
const output = process.argv[2];
assert.ok(output && path.isAbsolute(output), "absolute new output required");
assert.equal(process.platform, "linux");
assert.equal(process.arch, "arm64");
await mkdir(output); // Refuse reuse/overwrite of prior qualification artifacts.
await cp(path.join(source, "dist"), output, { recursive: true });
await symlink(
  path.join(source, "node_modules"),
  path.join(output, "node_modules"),
);
await writeFile(path.join(output, "package.json"), '{"type":"module"}\n');
const inputs = {};
function replaceOnce(text, before, after) {
  assert.equal(text.split(before).length, 2, "qualification seam changed");
  return text.replace(before, after);
}
const composition = {
  name: "snippets-qualification-only",
  setup(builder) {
    builder.onLoad(
      { filter: /src\/(main\/index|renderer\/start-terminal-window)\.ts$/ },
      async ({ path: file }) => {
        let contents = await readFile(file, "utf8");
        if (file.endsWith("/main/index.ts")) {
          contents = replaceOnce(
            contents,
            "extensions = await startApplicationExtensions({",
            "extensions = await startApplicationExtensions({\n          qualifySnippets: true,",
          );
          contents = replaceOnce(
            contents,
            "sendSnippetsToggle: notifyWindow(terminalIpc.snippetsToggle),",
            'sendSnippetsToggle: () => extensions?.actions().find(action => action.id === "omxterm.snippets.open")?.invoke(),',
          );
          contents = replaceOnce(
            contents,
            "extensions?.actions(),",
            'extensions?.actions().filter(action => action.id !== "omxterm.snippets.open"),',
          );
        } else {
          contents = replaceOnce(
            contents,
            `          snippets: {
            load: bridge.terminal.snippets,
            subscribeToToggle: bridge.terminal.onSnippetsToggle,
          },`,
            "",
          );
        }
        return { contents, loader: "ts" };
      },
    );
  },
};
const common = {
  absWorkingDir: source,
  bundle: true,
  sourcemap: true,
  metafile: true,
  plugins: [composition],
};
const results = await Promise.all([
  build({
    ...common,
    entryPoints: ["src/main/index.ts"],
    platform: "node",
    format: "esm",
    external: ["electron", "node-pty", "yaml", "yauzl", "semver"],
    outfile: path.join(output, "main/index.js"),
  }),
  build({
    ...common,
    entryPoints: ["src/renderer/index.ts"],
    platform: "browser",
    format: "iife",
    loader: { ".ttf": "binary" },
    outfile: path.join(output, "renderer/index.js"),
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
      differences: [
        "qualifySnippets enabled",
        "built-in view omitted",
        "existing Snippets entry invokes installed companion; duplicate extension action omitted",
      ],
      scope:
        "Explicit test composition; not unchanged shipping host or platform cutover",
    },
    null,
    2,
  ),
);
console.log(path.join(output, "main/index.js"));
