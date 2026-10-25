import { prepareFixture, type FixtureCleanupOwner } from "./prepare-fixture";
import { cp, mkdir, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));

export async function buildFixture(
  root: string,
  cleanupOwner: FixtureCleanupOwner = "recipe",
) {
  return prepareFixture(
    root,
    async (start) => {
      await mkdir(path.join(root, "renderer"));
      await Promise.all([
        start(() =>
          build({
            absWorkingDir: projectRoot,
            bundle: true,
            entryPoints: ["test/fixtures/surface-font-ownership-main.ts"],
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
            plugins: [
              {
                name: "observe-font-ownership-at-real-runtime-readiness",
                setup(builder) {
                  builder.onResolve(
                    { filter: /restty-runtime-contract$/ },
                    (args) =>
                      args.importer ===
                      path.join(
                        projectRoot,
                        "src/terminal-surface/restty-terminal-surface.ts",
                      )
                        ? {
                            path: path.join(
                              projectRoot,
                              "test/fixtures/surface-font-ownership-runtime.ts",
                            ),
                          }
                        : undefined,
                  );
                  builder.onResolve(
                    { filter: /restty-terminal-surface$/ },
                    (args) =>
                      args.importer ===
                      path.join(
                        projectRoot,
                        "src/renderer/start-terminal-window.ts",
                      )
                        ? {
                            path: path.join(
                              projectRoot,
                              "test/fixtures/surface-font-ownership-surface.ts",
                            ),
                          }
                        : undefined,
                  );
                },
              },
            ],
          }),
        ),
        start(() =>
          cp(
            path.join(projectRoot, "src/renderer/index.html"),
            path.join(root, "renderer/index.html"),
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
              name: "omxterm-font-ownership-fixture",
              main: "main.cjs",
            }),
          ),
        ),
      ]);
    },
    cleanupOwner,
  );
}
