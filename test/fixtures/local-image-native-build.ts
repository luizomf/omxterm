import { prepareFixture } from "./prepare-fixture";
import { copyFile, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));

export const PNG_1X1 = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

export async function buildFixture(root: string): Promise<void> {
  return prepareFixture(root, async (start) => {
    await build({
      entryPoints: [
        path.join(projectRoot, "test", "fixtures", "local-image-main.ts"),
      ],
      bundle: true,
      platform: "node",
      format: "cjs",
      outfile: path.join(root, "main.cjs"),
      external: ["electron"],
    });
    await build({
      entryPoints: [
        path.join(projectRoot, "test/fixtures/local-image-renderer.ts"),
      ],
      bundle: true,
      platform: "browser",
      format: "iife",
      outfile: path.join(root, "preview.js"),
    });
    const productionHtml = await readFile(
      path.join(projectRoot, "src/renderer/index.html"),
      "utf8",
    );
    const policy = productionHtml.match(/content="(?<policy>[^"]+)"/u)?.groups
      ?.policy;
    if (!policy) throw new Error("Production renderer CSP is missing");
    await Promise.all([
      start(() =>
        writeFile(
          path.join(root, "preview.html"),
          `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="${policy}"><link rel="stylesheet" href="./preview.css"></head><body><textarea aria-label="Terminal input"></textarea><script src="./preview.js"></script></body></html>`,
        ),
      ),
      start(() =>
        copyFile(
          path.join(projectRoot, "src/renderer/terminal-window.css"),
          path.join(root, "preview.css"),
        ),
      ),
      start(() =>
        writeFile(
          path.join(root, "package.json"),
          `${JSON.stringify({ name: "omxterm-local-image-fixture", main: "main.cjs" })}\n`,
        ),
      ),
      start(() =>
        writeFile(path.join(root, "fixture%23#literal.data"), PNG_1X1),
      ),
    ]);
  });
}
