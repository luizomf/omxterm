import { buildFixture } from "../fixtures/window-chrome-build";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { applyChromiumSandboxPolicy } from "../../src/main/chromium-sandbox-policy";
import { runNativeFixture } from "../fixtures/run-native-fixture";
import { fixtureWindowPolicy } from "../fixtures/window-policy";

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
        await buildFixture(root);
        let supervised = false;
        try {
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
