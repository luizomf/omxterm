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
const prefix = "__OMXTERM_PENDING_TAB_RESULT__";

describe.skipIf(!["darwin", "linux", "win32"].includes(process.platform))(
  "Pending tab ownership through real Electron, Restty and native PTYs",
  () => {
    it("keeps B's held initialization alive through ordinary A exit and starts exactly one usable PTY", async () => {
      const root = await mkdtemp(path.join(tmpdir(), "omxterm-pending-tab-"));
      let supervised = false;
      try {
        await buildFixture(root);
        const args: string[] = [];
        applyChromiumSandboxPolicy({
          appendSwitch: (name) => {
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
          `Pending tab fixture failed.\nstdout:\n${execution.stdout}\nstderr:\n${execution.stderr}`,
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
          heldBeforePty: true,
          survivedOrdinaryExit: true,
          exactlyOnePty: true,
          usable: true,
          lastTabClosed: true,
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
      entryPoints: ["test/fixtures/pending-tab-main.ts"],
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
      plugins: [
        {
          name: "hold-second-surface-font-acquisition",
          setup(builder) {
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
                      "test/fixtures/pending-tab-surface.ts",
                    ),
                  };
                return undefined;
              },
            );
          },
        },
      ],
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
      JSON.stringify({ name: "omxterm-pending-tab-fixture", main: "main.cjs" }),
    ),
  ]);
}
