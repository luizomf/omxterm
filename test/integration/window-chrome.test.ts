import { buildFixture } from "../fixtures/window-chrome-build";
import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyChromiumSandboxPolicy } from "../../src/main/chromium-sandbox-policy";
import { runNativeFixture } from "../fixtures/run-native-fixture";
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
  control?: string,
) {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-window-chrome-"));
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
    return await runNativeFixture({
      executable,
      args: [
        ...args,
        root,
        `--fixture-native-maximize=${expectation}`,
        ...(mode === "fail-fast" ? ["--fixture-fail-fast"] : []),
        ...(control ? [`--fixture-chrome-control=${control}`] : []),
      ],
      root,
      timeout: mode === "fail-fast" ? 10_000 : 100_000,
    });
  } finally {
    if (!supervised) await rm(root, { recursive: true, force: true });
  }
}

describe.skipIf(!["darwin", "linux", "win32"].includes(process.platform))(
  "Window Chrome through real Electron, Surfaces and PTYs",
  () => {
    it.each(["continuity", "fail-fast"])(
      "checks %s without leaking a native dialog or process",
      async (mode) => {
        rejectLegacyNativeWindowDeclarations();
        const expectation =
          mode === "continuity" && process.platform !== "darwin"
            ? await observeNativeWindow("chrome")
            : process.platform === "darwin"
              ? "not-exercised-macos"
              : "native-maximize-observed";
        const execution = await runChrome(mode, expectation);
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
      nativeWindowDiscoveryTimeout("chrome") + 120_000,
    );

    it.skipIf(process.platform === "darwin")(
      "rejects broken native routing and disabling product construction after valid independent observation",
      async () => {
        const expectation = await observeNativeWindow("chrome");
        // One fresh comparison is shared only by this sequential test invocation,
        // not a worker/session cache. Every control still runs a real owned fixture.
        for (const [control, message] of [
          ["drop-route", "custom control invokes intended native action"],
          ["wrong-owner", "Custom control invoked wrong native owner"],
          ["duplicate-route", "Custom control duplicated native invocation"],
          ["disabled-maximize", "Native Chrome must remain maximizable"],
          ["disabled-resize", "Native Chrome must remain resizable"],
        ]) {
          const execution = await runChrome("continuity", expectation, control);
          const evidence = JSON.stringify(execution);
          expect(execution, evidence).toMatchObject({
            exitCode: 1,
            signal: null,
            reason: "exit",
            cleanupErrors: [],
          });
          expect(execution.stdout, evidence).toContain(
            `__OMXTERM_CHROME_CONTROL__${control}`,
          );
          expect(execution.stdout, evidence).not.toContain(prefix);
          expect(execution.stderr, evidence).toContain(message);
        }
      },
      nativeWindowDiscoveryTimeout("chrome") + 5 * 120_000,
    );
  },
);
