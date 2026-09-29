import { createRequire } from "node:module";
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";
import { applyChromiumSandboxPolicy } from "../../src/main/chromium-sandbox-policy";
import { runNativeFixture } from "../fixtures/run-native-fixture";

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));
const executable = createRequire(import.meta.url)("electron") as string;
const prefix = "__OMXTERM_STARTUP_TITLES_RESULT__";

describe.skipIf(!["darwin", "linux", "win32"].includes(process.platform))(
  "Startup titles through real Electron, Surfaces and PTYs",
  () => {
    it("displays first and additional silent-program fallback labels without OSC repair", async () => {
      const root = await mkdtemp(
        path.join(tmpdir(), "omxterm-startup-tab-titles-"),
      );
      let supervised = false;
      try {
        await buildFixture(root);
        const args: string[] = [];
        applyChromiumSandboxPolicy({
          appendSwitch(name) {
            args.push(`--${name}`);
          },
        });
        if (process.platform === "linux") args.push("--ozone-platform=x11");
        supervised = true;
        const execution = await runNativeFixture({
          executable,
          args: [...args, root],
          root,
          timeout: 90_000,
        });
        expect(
          execution,
          `Startup titles fixture failed.\nstdout:\n${execution.stdout}\nstderr:\n${execution.stderr}`,
        ).toMatchObject({
          exitCode: 0,
          signal: null,
          reason: "exit",
          cleanupErrors: [],
        });
        const result = execution.stdout
          .split("\n")
          .find((line) => line.startsWith(prefix));
        expect(result).toBeDefined();
        expect(JSON.parse(result!.slice(prefix.length)) as unknown).toEqual({
          fallbackLabels: true,
          nativeTitle: true,
          silentPrograms: 2,
          oscTitles: 0,
        });
      } finally {
        if (!supervised) await rm(root, { recursive: true, force: true });
      }
    }, 110_000);
  },
);

async function buildFixture(root: string) {
  await mkdir(path.join(root, "renderer"));
  await Promise.all([
    build({
      absWorkingDir: projectRoot,
      bundle: true,
      entryPoints: ["test/fixtures/startup-tab-titles-main.ts"],
      external: ["electron", "node-pty"],
      format: "cjs",
      platform: "node",
      logLevel: "silent",
      outfile: path.join(root, "main.cjs"),
    }),
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
    cp(
      path.join(projectRoot, "src/renderer/index.html"),
      path.join(root, "renderer/index.html"),
    ),
    symlink(
      path.join(projectRoot, "node_modules"),
      path.join(root, "node_modules"),
      "dir",
    ),
    writeFile(
      path.join(root, "package.json"),
      JSON.stringify({
        name: "omxterm-startup-tab-titles-fixture",
        main: "main.cjs",
      }),
    ),
  ]);
}
