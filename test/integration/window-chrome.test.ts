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

import {
  FEATURE_SMOKE_CASE,
  FEATURE_SMOKE_FLAG,
  FEATURE_SMOKE_PHASE_PREFIX,
  FEATURE_SMOKE_PHASES,
  FEATURE_SMOKE_RESULT,
} from "../fixtures/feature-native-smoke-contract";

const executable = createRequire(import.meta.url)("electron") as string;
const prefix = "__OMXTERM_WINDOW_CHROME_RESULT__";
async function runChrome(
  mode: string,
  expectation: ChromeNativeExpectation | undefined,
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
        ...(expectation === undefined
          ? []
          : [`--fixture-native-maximize=${expectation}`]),
        ...(mode === "fail-fast" ? ["--fixture-fail-fast"] : []),
        ...(mode === "about-only" ? ["--fixture-about-only"] : []),
        ...(mode === "settings-only"
          ? [
              "--fixture-settings-only",
              `--fixture-settings-evidence=${path.resolve(".scratch/native-fixtures", `${path.basename(root)}-settings`)}`,
            ]
          : []),
        ...(mode === "feature-smoke" ? [FEATURE_SMOKE_FLAG] : []),
        ...(mode === "theme-appearance" ? ["--fixture-theme-appearance"] : []),
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
    it.for(["continuity", "fail-fast", "about-only", "settings-only"])(
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
        if (mode === "settings-only") {
          const { settings } = JSON.parse(results[0]!.slice(prefix.length)) as {
            settings: { rejectedStatus: string };
          };
          expect(settings.rejectedStatus).toMatch(
            /font\.family.*must exactly name an installed font family/u,
          );
          expect({
            settings: {
              ...settings,
              rejectedStatus:
                "Settings fixture rejection is checked separately",
            },
          }).toEqual({
            settings: {
              opened: true,
              onePanelVisible: true,
              liveStatus: "Saved.",
              liveFile: { version: 1, terminal: { padding: { top: 24 } } },
              livePaddingApplied: true,
              newWindowStatus: "Saved. It applies to new windows.",
              newWindowFile: {
                version: 1,
                terminal: { padding: { top: 24 } },
                window: { showTabBar: false },
              },
              rejectedStatus:
                "Settings fixture rejection is checked separately",
              rejectedFileUnchanged: true,
              shortcutStatus: "Saved.",
              shortcutFile: {
                version: 1,
                terminal: { padding: { top: 24 } },
                window: { showTabBar: false },
                keybinds: { find: "F2" },
              },
              deliveredDuringCapture: [],
              deliveredAfterCapture: ["find"],
              focusReturned: true,
              layout: {
                cases: 144,
                breakpoints: 4,
                synthetic: true,
                physicalKeyboard: false,
              },
            },
          });
          return;
        }
        if (mode === "about-only") {
          expect(
            JSON.parse(results[0]!.slice(prefix.length)) as unknown,
          ).toEqual({ about: "menu-keyboard-focus-layout-verified" });
          return;
        }
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
    it(
      "reloads theme appearance without losing separator focus, resize targets or native grids",
      { timeout: 120_000 },
      async (testContext) => {
        const execution = await runChrome(
          "theme-appearance",
          undefined,
          testContext,
        );
        expect(
          execution,
          `Theme appearance failed.\n${execution.stdout}\n${execution.stderr}`,
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
        expect(JSON.parse(results[0]!.slice(prefix.length))).toEqual({
          appearance: "file-reload-three-roles-both-axes-panel-focus-and-grids",
          input: "synthetic-chromium-not-physical",
        });
      },
    );
    it(FEATURE_SMOKE_CASE, { timeout: 120_000 }, async (testContext) => {
      // No native maximize discovery or unrelated continuity exercise is needed.
      const execution = await runChrome(
        "feature-smoke",
        undefined,
        testContext,
      );
      expect(
        execution,
        `Feature smoke failed.\n${execution.stdout}\n${execution.stderr}`,
      ).toMatchObject({
        exitCode: 0,
        signal: null,
        reason: "exit",
        cleanupErrors: [],
      });
      const lines = execution.stdout.split("\n");
      expect(
        lines
          .filter((line) => line.startsWith(FEATURE_SMOKE_PHASE_PREFIX))
          .map((line) => line.slice(FEATURE_SMOKE_PHASE_PREFIX.length)),
      ).toEqual(FEATURE_SMOKE_PHASES);
      const results = lines.filter((line) => line.startsWith(prefix));
      expect(results).toHaveLength(1);
      expect(JSON.parse(results[0]!.slice(prefix.length)) as unknown).toEqual({
        features: FEATURE_SMOKE_RESULT,
      });
    });
  },
);
