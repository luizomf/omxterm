import { createRequire } from "node:module";
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";
import { runNativeFixture } from "../fixtures/run-native-fixture";
import { nativeFixturePlatform } from "../fixtures/restty-host-platform";

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));
const executable = createRequire(import.meta.url)("electron") as string;
const prefix = "__OMXTERM_PRODUCTION_SHUTDOWN_RESULT__";

// Windows-specific regression: explicit PowerShell first command, then two
// configured Node REPLs in two real production windows. Other platforms must
// not claim coverage of ConPTY startup/deferred termination.
describe.skipIf(process.platform !== "win32")(
  "production Windows native shutdown",
  () => {
    it.each([
      { action: "close", readiness: "started" },
      { action: "quit", readiness: "started" },
      { action: "close", readiness: "prompt" },
      { action: "quit", readiness: "prompt" },
    ])(
      "waits for native exits on $action at $readiness readiness",
      async ({ action, readiness }) => {
        const root = await mkdtemp(
          path.join(tmpdir(), "omxterm-production-shutdown-"),
        );
        let supervised = false;
        try {
          await mkdir(path.join(root, "dist", "renderer"), { recursive: true });
          const shared = {
            absWorkingDir: projectRoot,
            bundle: true,
            logLevel: "silent" as const,
          };
          await Promise.all([
            build({
              ...shared,
              entryPoints: ["src/main/index.ts"],
              external: ["electron", "node-pty"],
              format: "esm",
              platform: "node",
              outfile: path.join(root, "dist", "main", "index.js"),
            }),
            build({
              ...shared,
              entryPoints: ["test/fixtures/production-shutdown-main.ts"],
              external: ["electron", "node-pty"],
              format: "esm",
              platform: "node",
              outfile: path.join(root, "main.js"),
            }),
            build({
              ...shared,
              entryPoints: ["src/preload/index.ts"],
              external: ["electron"],
              format: "cjs",
              platform: "node",
              outfile: path.join(root, "dist", "preload", "index.cjs"),
            }),
            build({
              ...shared,
              entryPoints: ["src/renderer/index.ts"],
              format: "iife",
              platform: "browser",
              loader: { ".ttf": "binary" },
              outfile: path.join(root, "dist", "renderer", "index.js"),
            }),
            cp(
              path.join(projectRoot, "src", "renderer", "index.html"),
              path.join(root, "dist", "renderer", "index.html"),
            ),
            cp(
              path.join(projectRoot, "assets", "application-icon.png"),
              path.join(root, "assets", "application-icon.png"),
            ),
            symlink(
              path.join(projectRoot, "node_modules"),
              path.join(root, "node_modules"),
              "junction",
            ),
            writeFile(
              path.join(root, "package.json"),
              JSON.stringify({
                name: "omxterm-production-shutdown-fixture",
                version: "0.0.0",
                type: "module",
                main: "main.js",
              }),
            ),
          ]);
          supervised = true;
          const execution = await runNativeFixture({
            executable,
            args: [
              root,
              ...(readiness === "prompt" ? ["--prompt-ready"] : []),
              ...(action === "quit" ? ["--quit-menu"] : []),
              "-e",
              nativeFixturePlatform.defaultShell,
              "-NoLogo",
              "-NoProfile",
              "-Command",
              "[Console]::ReadLine() | Out-Null",
            ],
            root,
            timeout: 40_000,
          });
          expect(
            execution,
            `Production shutdown failed.\nstdout:\n${execution.stdout}\nstderr:\n${execution.stderr}`,
          ).toMatchObject({
            exitCode: 0,
            signal: null,
            reason: "exit",
            cleanupErrors: [],
          });
          const results = execution.stdout
            .split("\n")
            .filter((line) => line.startsWith(prefix));
          expect(results).toHaveLength(1);
          expect(
            JSON.parse(results[0]!.slice(prefix.length)) as unknown,
          ).toEqual({
            created: 3,
            exited: 3,
            windows: 2,
            surfaces: 3,
            readiness,
            action,
          });
        } finally {
          if (!supervised) await rm(root, { recursive: true, force: true });
        }
      },
      60_000,
    );
  },
);
