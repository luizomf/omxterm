import { prepareFixture } from "./prepare-fixture";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";

export async function buildFixture(root: string): Promise<void> {
  return prepareFixture(root, async (start) => {
    await Promise.all([
      start(() =>
        build({
          entryPoints: ["test/fixtures/restty-background-main.ts"],
          outfile: path.join(root, "main.cjs"),
          bundle: true,
          external: ["electron"],
          format: "cjs",
          platform: "node",
          logLevel: "silent",
        }),
      ),
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
        writeFile(
          path.join(root, "package.json"),
          JSON.stringify({
            name: "omxterm-background-fixture",
            main: "main.cjs",
          }),
        ),
      ),
    ]);
  });
}
