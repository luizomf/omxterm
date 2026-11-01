import { execFile } from "node:child_process";
import { copyFile, mkdir, readFile, writeFile } from "node:fs/promises";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { packageArchive } from "./extension-package-archive";

const project = fileURLToPath(new URL("../..", import.meta.url));

export async function prepareFixtureSnippetCatalog(root: string) {
  const directory = path.join(root, "config", "omxterm");
  await mkdir(directory, { recursive: true });
  await writeFile(
    path.join(directory, "snippets.yaml"),
    "version: 1\nsnippets:\n  - name: Synthetic\n    body: snippet\n    execute: true\n",
    { flag: "wx" },
  );
}

/** Bundle the real Snippets sources into a private, unqualified fixture archive. */
export async function prepareFixtureSnippets(root: string) {
  const output = async (
    entry: string,
    platform: "node" | "browser",
    format: "esm" | "iife",
    banner?: string,
  ) => {
    const result = await build({
      absWorkingDir: project,
      entryPoints: [entry],
      bundle: true,
      platform,
      format,
      write: false,
      ...(banner ? { banner: { js: banner } } : {}),
      logLevel: "silent",
    });
    if (result.outputFiles.length !== 1)
      throw new Error("Unexpected Snippets build output");
    return result.outputFiles[0]!.contents;
  };
  // Sequential builds ensure no unjoined writer remains if one fails.
  const backend = await output(
    "extensions/snippets/backend.ts",
    "node",
    "esm",
    'import { createRequire } from "node:module"; const require = createRequire(import.meta.url);',
  );
  const view = await output("extensions/snippets/view.ts", "browser", "iife");
  const css = await output(
    "extensions/snippets/snippets.css",
    "browser",
    "iife",
  );
  const resources = [
    ["extension.json", "extensions/snippets/extension.json"],
    ["index.html", "extensions/snippets/index.html"],
    ["README.md", "extensions/snippets/README.md"],
    ["snippets.example.yaml", "extensions/snippets/snippets.example.yaml"],
    ["LICENSE", "LICENSE"],
    ["licenses/yaml.txt", "node_modules/yaml/LICENSE"],
  ] as const;
  const entries: { name: string; data: Buffer | Uint8Array }[] = [
    { name: "backend.mjs", data: backend },
    { name: "view.js", data: view },
    { name: "snippets.css", data: css },
  ];
  for (const [name, source] of resources)
    entries.push({ name, data: await readFile(path.join(project, source)) });
  const archive = path.join(root, "snippets.omxext");
  await writeFile(
    archive,
    packageArchive(
      entries.map((entry) => ({ ...entry, data: Buffer.from(entry.data) })),
    ),
    { flag: "wx" },
  );
  await prepareFixtureSnippetCatalog(root);
  const metadata = JSON.parse(
    await readFile(path.join(project, "package.json"), "utf8"),
  ) as { version: string };
  return { archive, version: metadata.version };
}

/** Native runtime artifacts belong to the same supervised fixture root. */
export async function prepareFixtureSnippetsRuntime(root: string) {
  const runtime = path.join(root, "extension-runtime");
  await mkdir(runtime, { recursive: true });
  await promisify(execFile)(
    process.execPath,
    [path.join(project, "scripts/build-extension-leases.mjs"), runtime],
    // The builder bounds and joins its own compiler; do not time out its Node
    // owner independently while that directly owned compiler may still run.
    { cwd: project },
  );
  await build({
    absWorkingDir: project,
    entryPoints: ["src/extension-runtime/bootstrap.ts"],
    bundle: true,
    platform: "node",
    format: "esm",
    external: ["electron", "yauzl", "semver"],
    outfile: path.join(runtime, "bootstrap.mjs"),
    logLevel: "silent",
  });
  await mkdir(path.join(root, "preload"));
  await copyFile(
    path.join(project, "src/preload/extension-view.cjs"),
    path.join(root, "preload/extension-view.cjs"),
  );
}
