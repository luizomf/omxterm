import { prepareFixture, type FixtureCleanupOwner } from "./prepare-fixture";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import { buildMacOSWindowBlur } from "../../scripts/build-macos-window-blur.mjs";

export async function buildFixture(
  root: string,
  cleanupOwner: FixtureCleanupOwner = "recipe",
): Promise<void> {
  return prepareFixture(
    root,
    async (start) => {
      await Promise.all([
        start(() => buildMacOSWindowBlur(root)),
        start(() =>
          build({
            entryPoints: ["test/fixtures/restty-background-renderer.ts"],
            outfile: path.join(root, "index.js"),
            bundle: true,
            format: "iife",
            platform: "browser",
            loader: { ".ttf": "binary" },
            logLevel: "silent",
          }),
        ),
        start(() =>
          readFile("src/renderer/index.html", "utf8").then((html) =>
            writeFile(path.join(root, "index.html"), html),
          ),
        ),
        start(() =>
          build({
            entryPoints: ["test/fixtures/macos-window-blur-main.ts"],
            outfile: path.join(root, "main.js"),
            bundle: true,
            external: ["electron"],
            format: "esm",
            platform: "node",
            logLevel: "silent",
          }),
        ),
        start(() =>
          writeFile(
            path.join(root, "package.json"),
            JSON.stringify({
              name: "omxterm-macos-blur-fixture",
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
