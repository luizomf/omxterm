import { build } from "esbuild";
import { cp, mkdir, rm } from "node:fs/promises";
import path from "node:path";

const projectRoot = path.resolve(import.meta.dirname);
const outputRoot = path.join(projectRoot, "dist");

if (path.dirname(outputRoot) !== projectRoot) {
  throw new Error(
    "Refusing to clean an output directory outside the project root",
  );
}

await rm(outputRoot, { recursive: true, force: true });
await mkdir(path.join(outputRoot, "renderer", "fonts"), { recursive: true });

await Promise.all([
  build({
    entryPoints: ["src/main/index.ts"],
    bundle: true,
    format: "esm",
    platform: "node",
    packages: "external",
    outfile: "dist/main/index.js",
    sourcemap: true,
  }),
  build({
    entryPoints: ["src/preload/index.ts"],
    bundle: true,
    format: "cjs",
    platform: "node",
    external: ["electron"],
    outfile: "dist/preload/index.cjs",
    sourcemap: true,
  }),
  build({
    entryPoints: ["src/renderer/index.ts"],
    bundle: true,
    format: "iife",
    platform: "browser",
    loader: { ".ttf": "binary" },
    external: ["./fonts/JetBrainsMonoNerdFontMono-Regular.woff2"],
    outfile: "dist/renderer/index.js",
    sourcemap: true,
  }),
  cp("src/renderer/index.html", "dist/renderer/index.html"),
  cp(
    "assets/fonts/JetBrainsMonoNerdFontMono-Regular.woff2",
    "dist/renderer/fonts/JetBrainsMonoNerdFontMono-Regular.woff2",
  ),
  cp("assets/fonts/OFL.txt", "dist/renderer/fonts/OFL.txt"),
]);
