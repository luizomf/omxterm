import { readFile, writeFile, mkdir, copyFile } from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { build } from "esbuild";
import { Font, UnicodeBuffer, shape } from "text-shaper";
import { compactCollection } from "./compact.mjs";

if (process.platform !== "darwin")
  throw new Error("This experiment requires macOS");
const root = path.resolve(process.argv[2] ?? ".scratch/emoji-experiment");
await mkdir(path.dirname(root), { recursive: true });
await mkdir(root); // Refuse reuse: every observation needs a fresh profile.
const original = "/System/Library/Fonts/Apple Color Emoji.ttc";
const compact = path.join(root, "compact.ttc");
const source = await readFile(original);
const derivative = compactCollection(source);
await writeFile(compact, derivative);
const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
const parse = (bytes) =>
  Font.collection(
    bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength),
  );
const before = parse(source);
const after = parse(derivative);
const samples = ["😀", "👩‍💻", "👨‍👩‍👧‍👦", "👍🏽", "🇧🇷", "❤️", "漢字", "☃∑→"];
const shaping = (collection) =>
  collection.names().map(({ index }) => {
    const font = collection.get(index);
    return {
      metrics: [font.unitsPerEm, font.ascender, font.descender, font.numGlyphs],
      samples: samples.map((text) => {
        const buffer = new UnicodeBuffer();
        buffer.addStr(text);
        const result = shape(font, buffer);
        return JSON.parse(JSON.stringify(result));
      }),
    };
  });
const parser = {
  namesEqual: JSON.stringify(before.names()) === JSON.stringify(after.names()),
  shapingEqual:
    JSON.stringify(shaping(before)) === JSON.stringify(shaping(after)),
  faces: after.names().length,
};
if (!parser.namesEqual || !parser.shapingEqual)
  throw new Error("Parser comparison failed");
const runtime = await readFile(
  "node_modules/restty/dist/chunk-c0rcpsc5.js",
  "utf8",
);
if (
  hash(runtime) !==
  "3b1076d32880f0f28b8cbb465687825c4bb980d34d1af67862e23b5eda2871e3"
)
  throw new Error("Unreviewed Restty runtime");
const html = await readFile("src/renderer/index.html", "utf8");
const policy = html.match(/content="([^"]+)"/u)[1];
const electron = createRequire(import.meta.url)("electron");
const sourceFiles = [
  "scripts/emoji-experiment/run.mjs",
  "scripts/emoji-experiment/compact.mjs",
  "test/fixtures/restty-emoji-main.ts",
  "test/fixtures/restty-emoji-experiment.ts",
  "src/main/installed-font-family.ts",
  "src/main/apple-emoji-shaping-input.ts",
  "package-lock.json",
];
const sourceHashes = Object.fromEntries(
  await Promise.all(
    sourceFiles.map(async (file) => [file, hash(await readFile(file))]),
  ),
);
const summary = {
  sourceHashes,
  sourceBase: spawnSync("git", ["rev-parse", "HEAD"], {
    encoding: "utf8",
  }).stdout.trim(),
  platform: {
    architecture: process.arch,
    os: spawnSync("sw_vers", [], { encoding: "utf8" }).stdout.trim(),
  },
  originalBytes: source.length,
  compactBytes: derivative.length,
  originalSha256: hash(source),
  compactSha256: hash(derivative),
  runtimeSha256: hash(runtime),
  parser,
  runs: [],
};
for (const mode of [
  "native",
  "no-canvas",
  "atlas-only",
  "configured",
  "production",
]) {
  for (
    let trial = 0;
    trial < (mode === "native" || mode === "production" ? 3 : 1);
    trial += 1
  ) {
    for (const [variant, input] of [
      ["original", original],
      ["compact", compact],
    ]) {
      const directory = path.join(root, `${mode}-${trial}-${variant}`);
      await mkdir(directory, { recursive: true });
      await build({
        entryPoints: ["test/fixtures/restty-emoji-experiment.ts"],
        bundle: true,
        format: "iife",
        platform: "browser",
        loader: { ".ttf": "binary" },
        outfile: path.join(directory, "renderer.js"),
        plugins: [
          {
            name: "emoji-path-probe",
            setup(builder) {
              builder.onLoad({ filter: /chunk-c0rcpsc5\.js$/ }, async () => {
                let contents = runtime;
                const replace = (needle, replacement) => {
                  if (contents.split(needle).length !== 2)
                    throw new Error("Probe seam drift");
                  contents = contents.replace(needle, replacement);
                };
                replace(
                  "const buildColorEmojiAtlasWithCanvas = (options) => {",
                  `const buildColorEmojiAtlasWithCanvas = (options) => {globalThis.emojiProbe.canvas++;${mode === "no-canvas" || mode === "atlas-only" ? "return null;" : ""}`,
                );
                replace(
                  "if (!atlas && rasterizeGlyph && colorGlyphAtlas) {",
                  `if (!atlas && rasterizeGlyph && colorGlyphAtlas${mode === "atlas-only" ? " && false" : ""}) {globalThis.emojiProbe.raster++;`,
                );
                replace(
                  "atlas = buildAtlas(entry.font, [...union], {",
                  "globalThis.emojiProbe.atlas++;atlas = buildAtlas(entry.font, [...union], {",
                );
                return {
                  contents:
                    "globalThis.emojiProbe={canvas:0,raster:0,atlas:0};" +
                    contents,
                  loader: "js",
                };
              });
            },
          },
        ],
      });
      await build({
        entryPoints: ["test/fixtures/restty-emoji-main.ts"],
        bundle: true,
        format: "cjs",
        platform: "node",
        external: ["electron"],
        outfile: path.join(directory, "main.cjs"),
        plugins: [
          {
            name: "original-reference",
            setup(builder) {
              builder.onLoad(
                { filter: /installed-font-family\.ts$/ },
                async ({ path: file }) => {
                  const source = await readFile(file, "utf8");
                  for (const needle of [
                    'face.family === "Apple Color Emoji"',
                    "const bytes = Buffer.alloc(length);",
                  ])
                    if (source.split(needle).length !== 2)
                      throw new Error("Main probe seam drift");
                  return {
                    loader: "ts",
                    contents: source
                      .replace(
                        'face.family === "Apple Color Emoji"',
                        mode === "production" && variant === "compact"
                          ? 'face.family === "Apple Color Emoji"'
                          : "false /* original reader reference */",
                      )
                      .replace(
                        "const bytes = Buffer.alloc(length);",
                        "globalThis.emojiReads.bytes += length; globalThis.emojiReads.largest = Math.max(globalThis.emojiReads.largest, length); const bytes = Buffer.alloc(length);",
                      ),
                  };
                },
              );
            },
          },
        ],
      });
      await writeFile(
        path.join(directory, "preload.cjs"),
        `const {contextBridge,ipcRenderer}=require('electron');contextBridge.exposeInMainWorld('emojiExperiment',{fonts:()=>ipcRenderer.invoke('fonts'),phase:name=>ipcRenderer.invoke('phase',name),report:value=>ipcRenderer.send('report',value)});`,
      );
      await writeFile(
        path.join(directory, "index.html"),
        `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${policy}"><link rel="stylesheet" href="renderer.css"></head><body data-configured="${mode === "configured"}"><div id="terminal-window-content"><main id="terminal-tabs" class="terminal-surface"></main></div><script src="renderer.js"></script></body></html>`,
      );
      await copyFile(
        "src/renderer/terminal-window.css",
        path.join(directory, "renderer.css"),
      );
      const child = spawnSync(
        electron,
        [
          path.join(directory, "main.cjs"),
          directory,
          mode === "production" ? original : input,
          mode,
        ],
        {
          encoding: "utf8",
          timeout: 100000,
          maxBuffer: 1000000,
          env: {
            ...process.env,
            XDG_CONFIG_HOME: path.join(directory, "config"),
            XDG_STATE_HOME: path.join(directory, "state"),
          },
        },
      );
      await writeFile(path.join(directory, "stderr.txt"), child.stderr ?? "");
      if (child.status !== 0)
        throw new Error(
          `Fixture failed ${directory}: status=${child.status} signal=${child.signal} error=${child.error} stdout=${child.stdout} stderr=${child.stderr}`,
        );
      const result = JSON.parse(child.stdout.trim().split("\n").at(-1));
      if (result.result.error) throw new Error(JSON.stringify(result));
      summary.runs.push({ mode, trial, variant, ...result });
      await writeFile(
        path.join(root, "results.json"),
        JSON.stringify(summary, null, 2) + "\n",
      );
      console.log(mode, trial, variant, result.result.probe);
    }
  }
}
for (let index = 0; index < summary.runs.length; index += 2) {
  const before = summary.runs[index];
  const after = summary.runs[index + 1];
  if (
    JSON.stringify(before.result.results) !==
      JSON.stringify(after.result.results) ||
    before.phases.some((phase, i) => phase.hash !== after.phases[i].hash)
  )
    throw new Error(`Rendering regression: ${before.mode}`);
  if (!after.result.fontBytes.includes(derivative.length))
    throw new Error("Compact input was not used");
  if (!after.result.probe.canvas)
    throw new Error("Canvas branch not exercised");
  if (after.mode === "no-canvas" && !after.result.probe.raster)
    throw new Error("Raster fallback not exercised");
}
if (hash(await readFile(original)) !== summary.originalSha256)
  throw new Error("Original changed");
console.log(root);
