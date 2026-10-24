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
      await mkdir(path.join(root, "dist", "renderer"), { recursive: true });
      const shared = {
        absWorkingDir: projectRoot,
        bundle: true,
        logLevel: "silent" as const,
      };
      await Promise.all([
        start(() =>
          build({
            ...shared,
            entryPoints: ["src/main/index.ts"],
            external: ["electron", "node-pty", "yaml"],
            format: "esm",
            platform: "node",
            outfile: path.join(root, "dist", "main", "index.js"),
          }),
        ),
        start(() =>
          build({
            ...shared,
            entryPoints: ["test/fixtures/production-shutdown-main.ts"],
            external: ["electron", "node-pty"],
            format: "esm",
            platform: "node",
            outfile: path.join(root, "main.js"),
          }),
        ),
        start(() =>
          build({
            ...shared,
            entryPoints: ["src/preload/index.ts"],
            external: ["electron"],
            format: "cjs",
            platform: "node",
            outfile: path.join(root, "dist", "preload", "index.cjs"),
          }),
        ),
        start(() =>
          build({
            ...shared,
            entryPoints: ["src/renderer/index.ts"],
            format: "iife",
            platform: "browser",
            loader: { ".ttf": "binary" },
            outfile: path.join(root, "dist", "renderer", "index.js"),
          }),
        ),
        start(() =>
          cp(
            path.join(projectRoot, "src", "renderer", "index.html"),
            path.join(root, "dist", "renderer", "index.html"),
          ),
        ),
        start(() =>
          cp(
            path.join(projectRoot, "assets", "application-icon.png"),
            path.join(root, "assets", "application-icon.png"),
          ),
        ),
        start(() =>
          symlink(
            path.join(projectRoot, "node_modules"),
            path.join(root, "node_modules"),
            "junction",
          ),
        ),
        start(() =>
          writeFile(
            path.join(root, "package.json"),
            JSON.stringify({
              name: "omxterm-production-shutdown-fixture",
              version: "0.0.0",
              type: "module",
              main: "main.js",
            }),
          ),
        ),
      ]);
    },
    cleanupOwner,
  );
}
