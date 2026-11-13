import { build } from "esbuild";
import { chmod, cp, rm, writeFile } from "node:fs/promises";
import electronBinary from "electron";
import path from "node:path";
import { buildMacOSWindowBlur } from "./scripts/build-macos-window-blur.mjs";
import { buildMacOSOptionShortcut } from "./scripts/build-macos-option-shortcut.mjs";
import { buildExtensionRuntime } from "./scripts/build-extension-runtime.mjs";

const projectRoot = path.resolve(import.meta.dirname);
const outputRoot = path.join(projectRoot, "dist");

if (path.dirname(outputRoot) !== projectRoot) {
  throw new Error(
    "Refusing to clean an output directory outside the project root",
  );
}

await rm(outputRoot, { recursive: true, force: true });
await Promise.all([
  ...((process.platform === "linux" &&
    ["arm64", "x64"].includes(process.arch)) ||
  (process.platform === "darwin" && process.arch === "arm64") ||
  (process.platform === "win32" && ["arm64", "x64"].includes(process.arch))
    ? [buildExtensionRuntime(path.join(outputRoot, "extension-runtime"))]
    : []),
  buildMacOSWindowBlur(path.join(outputRoot, "main")),
  buildMacOSOptionShortcut(path.join(outputRoot, "main")),
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
    external: ["electron", "node-pty", "yaml", "yauzl", "semver"],
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
    entryPoints: ["src/preload/extension-view.cjs"],
    bundle: true,
    format: "cjs",
    platform: "node",
    external: ["electron"],
    outfile: "dist/preload/extension-view.cjs",
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
  // The agent client and its launcher (ADR 0052). An unpackaged build tells
  // the launcher which Electron to run; packages find their own binary.
  (async () => {
    await build({
      entryPoints: ["src/agent-ctl/omxterm-ctl.ts"],
      bundle: true,
      format: "cjs",
      platform: "node",
      outfile: "dist/agent-ctl/omxterm-ctl.cjs",
    });
    await cp("src/agent-ctl/omxterm-ctl", "dist/agent-ctl/omxterm-ctl");
    // Every account that runs the installed app can run its client.
    await chmod("dist/agent-ctl/omxterm-ctl", 0o755);
    await chmod("dist/agent-ctl/omxterm-ctl.cjs", 0o644);
    await writeFile("dist/agent-ctl/runtime", `${electronBinary}\n`);
  })(),
  cp("src/renderer/index.html", "dist/renderer/index.html"),
  cp("assets/application-icon.png", "dist/renderer/application-icon.png"),
]);
