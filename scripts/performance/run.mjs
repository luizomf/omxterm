import { build } from "esbuild";
import {
  mkdir,
  mkdtemp,
  readFile,
  writeFile,
  copyFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import os from "node:os";
import path from "node:path";

const [destination, environment, mode = "normal"] = process.argv.slice(2);
if (!destination || !environment || !["normal", "control"].includes(mode))
  throw new Error(
    "Usage: node scripts/performance/run.mjs NEW_DIRECTORY ENVIRONMENT_LABEL [normal|control]",
  );
const root = path.resolve(destination);
const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();
if (git("status", "--porcelain", "--untracked-files=no"))
  throw new Error("Commit tracked changes before measuring");
await mkdir(root, { recursive: false });
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const files = [
  "package-lock.json",
  "scripts/performance/run.mjs",
  "scripts/performance/main.cjs",
  "test/fixtures/performance-renderer.ts",
  "test/fixtures/restty-depth-renderer.ts",
  "test/fixtures/restty-hidden-session.ts",
  "test/fixtures/restty-hidden-presentation.ts",
  "src/renderer/terminal-window.css",
  "src/renderer/index.html",
  "node_modules/restty/dist/chunk-c0rcpsc5.js",
  "assets/restty/omxterm-restty-core.wasm",
];
const hashes = Object.fromEntries(
  await Promise.all(
    files.map(async (file) => [file, hash(await readFile(file))]),
  ),
);
const supervisor = path.join(root, "runner.mjs");
await build({
  entryPoints: ["test/fixtures/run-native-fixture.ts"],
  outfile: supervisor,
  bundle: true,
  platform: "node",
  format: "esm",
  packages: "external",
  logLevel: "silent",
});
const { runNativeFixture } = await import(pathToFileURL(supervisor).href);
const electron = createRequire(import.meta.url)("electron");
const summary = {
  schema: 1,
  buildNode: process.version,
  electronSha256: hash(await readFile(electron)),
  source: git("rev-parse", "HEAD"),
  tree: git("rev-parse", "HEAD^{tree}"),
  environment,
  mode,
  hashes,
  protocol: "surface-1-3-1-v1",
  repetitions: 3,
  runs: [],
};
for (let trial = 0; trial < summary.repetitions; trial++) {
  const profile = await mkdtemp(path.join(os.tmpdir(), "omxterm-performance-"));
  let bundles;
  const execution = await runNativeFixture({
    executable: electron,
    args: [
      ...(process.platform === "linux"
        ? ["--no-sandbox", "--ozone-platform=x11"]
        : []),
      path.join(profile, "main.cjs"),
      ...(mode === "control" ? ["--performance-control"] : []),
    ],
    root: profile,
    timeout: 70000,
    evidencePath: path.join(root, `settlement-${trial}.json`),
    async prepare() {
      for (const name of ["home", "config", "state"])
        await mkdir(path.join(profile, name));
      await build({
        entryPoints: ["test/fixtures/performance-renderer.ts"],
        outfile: path.join(profile, "renderer.js"),
        bundle: true,
        platform: "browser",
        format: "iife",
        loader: { ".ttf": "binary" },
        logLevel: "silent",
      });
      await copyFile(
        "scripts/performance/main.cjs",
        path.join(profile, "main.cjs"),
      );
      await copyFile(
        "src/renderer/terminal-window.css",
        path.join(profile, "renderer.css"),
      );
      const html = await readFile("src/renderer/index.html", "utf8");
      const policy = html.match(/content="([^"]+)"/u)?.[1];
      if (!policy) throw new Error("Missing production CSP");
      await writeFile(
        path.join(profile, "index.html"),
        `<!doctype html><html style="--native-title-inset:0px"><head><meta http-equiv="Content-Security-Policy" content="${policy}"><link rel="stylesheet" href="renderer.css"></head><body><div id="terminal-window-content"><div id="terminal-tabs"></div></div><script src="renderer.js"></script></body></html>`,
      );
      bundles = Object.fromEntries(
        await Promise.all(
          ["renderer.js", "main.cjs", "renderer.css", "index.html"].map(
            async (file) => [
              file,
              hash(await readFile(path.join(profile, file))),
            ],
          ),
        ),
      );
    },
  });
  await writeFile(
    path.join(root, `execution-${trial}.json`),
    JSON.stringify(execution, null, 2),
  );
  if (
    execution.reason !== "exit" ||
    execution.exitCode !== 0 ||
    execution.signal ||
    execution.cleanupErrors.length ||
    execution.cleanupAssistance !== "none"
  )
    throw new Error(
      `Performance execution ${trial} failed; inspect local execution/settlement receipts`,
    );
  const lines = execution.stdout
    .split("\n")
    .filter((line) => line.startsWith("__OMXTERM_PERFORMANCE__"));
  if (lines.length !== 1)
    throw new Error("Missing or ambiguous performance result");
  summary.runs.push({
    trial,
    bundles,
    ...JSON.parse(lines[0].slice("__OMXTERM_PERFORMANCE__".length)),
  });
  await writeFile(
    path.join(root, "results.json"),
    JSON.stringify(summary, null, 2) + "\n",
  );
}
console.log(
  `Recorded ${summary.runs.length} settled repetitions. Compare results.json; raw execution receipts are private.`,
);
