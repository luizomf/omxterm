import { createRequire } from "node:module";
import { cp, mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { describe, expect, it } from "vitest";
import { applyChromiumSandboxPolicy } from "../../src/main/chromium-sandbox-policy";
import { runNativeFixture } from "../fixtures/run-native-fixture";
import { fixtureWindowPolicy } from "../fixtures/window-policy";

const projectRoot = fileURLToPath(new URL("../..", import.meta.url));
const executable = createRequire(import.meta.url)("electron") as string;
const prefix = "__OMXTERM_WINDOW_CHROME_RESULT__";

describe.skipIf(!["darwin", "linux", "win32"].includes(process.platform))(
  "Window Chrome through real Electron, Surfaces and PTYs",
  () => {
    it.each(["continuity", "fail-fast"])(
      "checks %s without leaking a native dialog or process",
      async (mode) => {
        const root = await mkdtemp(
          path.join(tmpdir(), "omxterm-window-chrome-"),
        );
        let supervised = false;
        try {
          await mkdir(path.join(root, "renderer"));
          await Promise.all([
            build({
              absWorkingDir: projectRoot,
              bundle: true,
              entryPoints: ["test/fixtures/window-chrome-main.ts"],
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
              path.join(projectRoot, "src", "renderer", "index.html"),
              path.join(root, "renderer", "index.html"),
            ),
            symlink(
              path.join(projectRoot, "node_modules"),
              path.join(root, "node_modules"),
              "dir",
            ),
            writeFile(
              path.join(root, "package.json"),
              JSON.stringify({
                name: "omxterm-window-chrome-fixture",
                main: "main.cjs",
              }),
            ),
          ]);
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
            args: [
              ...args,
              root,
              ...(mode === "fail-fast" ? ["--fixture-fail-fast"] : []),
            ],
            root,
            timeout: mode === "fail-fast" ? 10_000 : 100_000,
          });
          if (mode === "fail-fast") {
            expect(execution).toMatchObject({
              exitCode: 1,
              signal: null,
              reason: "exit",
              cleanupErrors: [],
            });
            expect(execution.stderr).toContain("Controlled fixture failure");
            return;
          }
          expect(
            execution,
            `Window Chrome fixture failed.\nstdout:\n${execution.stdout}\nstderr:\n${execution.stderr}`,
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
            platform: process.platform,
            windowPolicy: fixtureWindowPolicy(),
            nativeGeometryVerified: true,
            menu:
              process.platform === "darwin"
                ? "unchanged-macos"
                : "native-popup-reload-and-shortcuts",
            titlePixels: process.platform === "darwin" ? 30 : 34,
            sameWindowAndContents: true,
            sameCanvasesAndSessions: true,
            hiddenGeometryPreserved: true,
            selectedPtyRefitted: true,
            hoverGeometryUnchanged: true,
            fullscreenHandleRestored: true,
            nativeHandleDrag:
              process.platform === "win32" ? "verified" : "not-exercised",
            guardedBusyClose: true,
            reloadPreservedChoices: true,
            futureDefaults: true,
            isolated: true,
          });
        } finally {
          if (!supervised) await rm(root, { recursive: true, force: true });
        }
      },
      120_000,
    );
  },
);
