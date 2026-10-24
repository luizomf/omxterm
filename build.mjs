import { build } from "esbuild";
import { cp, rm } from "node:fs/promises";
import path from "node:path";
import { buildMacOSWindowBlur } from "./scripts/build-macos-window-blur.mjs";

const projectRoot = path.resolve(import.meta.dirname);
const outputRoot = path.join(projectRoot, "dist");

if (path.dirname(outputRoot) !== projectRoot) {
  throw new Error(
    "Refusing to clean an output directory outside the project root",
  );
}

await rm(outputRoot, { recursive: true, force: true });
await Promise.all([
  buildMacOSWindowBlur(path.join(outputRoot, "main")),
  build({
    entryPoints: ["src/main/index.ts"],
    bundle: true,
    format: "esm",
    platform: "node",
    // Keep native/host modules and yaml's CommonJS runtime external. YAML is
    // packaged as a direct dependency so Node can resolve its built-in requires.
    // The main process imports
    // text-shaper directly, so bundling it prevents packaged startup from
    // resolving a development checkout's ancestor node_modules by accident.
    external: ["electron", "node-pty", "yaml"],
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
    outfile: "dist/renderer/index.js",
    sourcemap: true,
  }),
  cp("src/renderer/index.html", "dist/renderer/index.html"),
  cp("assets/application-icon.png", "dist/renderer/application-icon.png"),
]);
