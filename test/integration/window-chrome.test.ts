import { buildFixture } from "../fixtures/window-chrome-build";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyChromiumSandboxPolicy } from "../../src/main/chromium-sandbox-policy";
import {
  runNativeFixture,
  type NativeFixtureTestContext,
} from "../fixtures/run-native-fixture";
import { observeNativeWindow } from "../fixtures/native-window-observation";
import {
  nativeWindowDiscoveryTimeout,
  rejectLegacyNativeWindowDeclarations,
  type ChromeNativeExpectation,
} from "../fixtures/window-policy";

const executable = createRequire(import.meta.url)("electron") as string;
const prefix = "__OMXTERM_WINDOW_CHROME_RESULT__";
async function runChrome(
  mode: string,
  expectation: ChromeNativeExpectation,
  testContext: NativeFixtureTestContext,
) {
  testContext.signal.throwIfAborted();
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-window-chrome-"));
  let supervised = false;
  try {
    const args: string[] = [];
    applyChromiumSandboxPolicy({
      appendSwitch(name) {
        args.push(`--${name}`);
      },
    });
    if (process.platform === "linux") args.push("--ozone-platform=x11");
    testContext.signal.throwIfAborted();
    supervised = true;
    return await runNativeFixture({
      executable,
      args: [
        ...args,
        root,
        `--fixture-native-maximize=${expectation}`,
        ...(mode === "fail-fast" ? ["--fixture-fail-fast"] : []),
      ],
      root,
      timeout: mode === "fail-fast" ? 10_000 : 100_000,
      testContext,
      prepare: () => buildFixture(root, "runner"),
    });
  } finally {
    if (!supervised) await rm(root, { recursive: true, force: true });
  }
}

describe.skipIf(!["darwin", "linux", "win32"].includes(process.platform))(
  "Window Chrome through real Electron, Surfaces and PTYs",
  () => {
    it.for(["continuity", "fail-fast"])(
      "checks %s without leaking a native dialog or process",
      { timeout: nativeWindowDiscoveryTimeout("chrome") + 120_000 },
      async (mode, testContext) => {
        rejectLegacyNativeWindowDeclarations();
        const expectation =
          mode === "continuity" && process.platform !== "darwin"
            ? await observeNativeWindow(
                "chrome",
                undefined,
                undefined,
                testContext,
              )
            : process.platform === "darwin"
              ? "not-exercised-macos"
              : "native-maximize-observed";
        const execution = await runChrome(mode, expectation, testContext);
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
        const results = execution.stdout
          .split("\n")
          .filter((line) => line.startsWith(prefix));
        expect(results).toHaveLength(1);
        expect(JSON.parse(results[0]!.slice(prefix.length)) as unknown).toEqual(
          {
            platform: process.platform,
            nativeExpectation: expectation,
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
          },
        );
      },
    );
  },
);
