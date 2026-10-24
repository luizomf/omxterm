import { prepareFixture, type FixtureCleanupOwner } from "./prepare-fixture";
import { cp, mkdir, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));

export async function buildFixture(
  root: string,
  cleanupOwner: FixtureCleanupOwner = "recipe",
): Promise<void> {
  return prepareFixture(
    root,
    async (start) => {
      await mkdir(path.join(root, "renderer"));
      await Promise.all([
        start(() =>
          build({
            absWorkingDir: projectRoot,
            bundle: true,
            entryPoints: ["test/fixtures/window-chrome-main.ts"],
            external: ["electron", "node-pty"],
            format: "cjs",
            platform: "node",
            logLevel: "silent",
            outfile: path.join(root, "main.cjs"),
          }),
        ),
        start(() =>
          build({
            absWorkingDir: projectRoot,
            bundle: true,
            entryPoints: ["src/preload/index.ts"],
            external: ["electron"],
            format: "cjs",
            platform: "node",
            logLevel: "silent",
            outfile: path.join(root, "preload.cjs"),
          }),
        ),
        start(() =>
          build({
            absWorkingDir: projectRoot,
            bundle: true,
            entryPoints: ["src/renderer/index.ts"],
            format: "iife",
            platform: "browser",
            loader: { ".ttf": "binary" },
            logLevel: "silent",
            outfile: path.join(root, "renderer", "index.js"),
          }),
        ),
        start(() =>
          cp(
            path.join(projectRoot, "src", "renderer", "index.html"),
            path.join(root, "renderer", "index.html"),
          ),
        ),
        start(() =>
          cp(
            path.join(projectRoot, "assets/application-icon.png"),
            path.join(root, "renderer/application-icon.png"),
          ),
        ),
        start(() =>
          symlink(
            path.join(projectRoot, "node_modules"),
            path.join(root, "node_modules"),
            "dir",
          ),
        ),
        start(() =>
          writeFile(
            path.join(root, "package.json"),
            JSON.stringify({
              name: "omxterm-window-chrome-fixture",
              main: "main.cjs",
            }),
          ),
        ),
      ]);
    },
    cleanupOwner,
  );
}
