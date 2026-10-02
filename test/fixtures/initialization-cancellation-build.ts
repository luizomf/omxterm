import { prepareFixture } from "./prepare-fixture";
import { cp, mkdir, symlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));

export async function buildFixture(root: string) {
  return prepareFixture(root, async (start) => {
    await mkdir(path.join(root, "renderer"));
    await Promise.all([
      start(() =>
        build({
          absWorkingDir: projectRoot,
          bundle: true,
          entryPoints: ["test/fixtures/initialization-cancellation-main.ts"],
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
              name: "hold-second-runtime-readiness",
              setup(builder) {
                builder.onResolve(
                  { filter: /restty-runtime-contract$/ },
                  (args) => {
                    if (
                      args.importer ===
                      path.join(
                        projectRoot,
                        "src/terminal-surface/restty-terminal-surface.ts",
                      )
                    )
                      return {
                        path: path.join(
                          projectRoot,
                          "test/fixtures/initialization-cancellation-runtime.ts",
                        ),
                      };
                    return undefined;
                  },
                );
                builder.onResolve(
                  { filter: /restty-terminal-surface$/ },
                  (args) => {
                    if (
                      args.importer ===
                      path.join(projectRoot, "src/renderer/index.ts")
                    )
                      return {
                        path: path.join(
                          projectRoot,
                          "test/fixtures/initialization-cancellation-surface.ts",
                        ),
                      };
                    return undefined;
                  },
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
            name: "omxterm-cancellation-fixture",
            main: "main.cjs",
          }),
        ),
      ),
    ]);
  });
}
