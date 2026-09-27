import { createRequire } from "node:module";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "esbuild";
import { expect, it } from "vitest";
import { buildMacOSWindowBlur } from "../../scripts/build-macos-window-blur.mjs";
import { runNativeFixture } from "../fixtures/run-native-fixture";

it.skipIf(process.platform !== "darwin" || process.arch !== "arm64")(
  "loads the production Node-API addon and validates live owned windows and main-thread calls",
  async () => {
    const root = await mkdtemp(path.join(tmpdir(), "omxterm-macos-blur-"));
    let supervised = false;
    try {
      await Promise.all([
        buildMacOSWindowBlur(root),
        build({
          entryPoints: ["test/fixtures/restty-background-renderer.ts"],
          outfile: path.join(root, "index.js"),
          bundle: true,
          format: "iife",
          platform: "browser",
          loader: { ".ttf": "binary" },
          logLevel: "silent",
        }),
        readFile("src/renderer/index.html", "utf8").then((html) =>
          writeFile(path.join(root, "index.html"), html),
        ),
        build({
          entryPoints: ["test/fixtures/macos-window-blur-main.ts"],
          outfile: path.join(root, "main.js"),
          bundle: true,
          external: ["electron"],
          format: "esm",
          platform: "node",
          logLevel: "silent",
        }),
        writeFile(
          path.join(root, "package.json"),
          JSON.stringify({
            name: "omxterm-macos-blur-fixture",
            type: "module",
            main: "main.js",
          }),
        ),
      ]);
      supervised = true;
      const result = await runNativeFixture({
        executable: createRequire(import.meta.url)("electron") as string,
        args: [
          root,
          ...(process.env.OMXTERM_TEST_MACOS_FULLSCREEN === "1"
            ? ["--fullscreen-control"]
            : []),
        ],
        root,
        timeout: 60_000,
      });
      expect(result, result.stderr).toMatchObject({
        exitCode: 0,
        reason: "exit",
        cleanupErrors: [],
      });
      expect(result.stdout).toContain('"nativeApply":0,"nativeReset":0');
      expect(result.stdout).toContain('"workerRejected":true');
      expect(result.stdout).toContain('"productionLifecycle":true');
      expect(result.stdout).toContain('"sameCanvas":true');
    } finally {
      if (!supervised) await rm(root, { recursive: true, force: true });
    }
  },
  90_000,
);
