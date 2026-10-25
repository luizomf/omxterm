import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { applyChromiumSandboxPolicy } from "../../src/main/chromium-sandbox-policy";
import { buildFixture } from "../fixtures/window-chrome-build";
import { runNativeFixture } from "../fixtures/run-native-fixture";
import type { exerciseShortcutCapture } from "../fixtures/settings-shortcut-native";

const executable = createRequire(import.meta.url)("electron") as string;
const prefix = "__OMXTERM_WINDOW_CHROME_RESULT__";

describe.skipIf(process.platform !== "linux")(
  "Settings capture through actual actions, native menu and raw PTY",
  () => {
    it.for(["none", "repeat", "release"])(
      "checks %s capture control without leaking owned processes",
      { timeout: 120_000 },
      async (control, context) => {
        context.signal.throwIfAborted();
        const root = await mkdtemp(
          path.join(tmpdir(), "omxterm-shortcut-native-"),
        );
        let supervised = false;
        try {
          const args: string[] = [];
          applyChromiumSandboxPolicy({
            appendSwitch(name) {
              args.push(`--${name}`);
            },
          });
          context.signal.throwIfAborted();
          supervised = true;
          const execution = await runNativeFixture({
            executable,
            args: [
              ...args,
              "--ozone-platform=x11",
              root,
              "--fixture-shortcut-capture",
              ...(control === "none" ? [] : [`--shortcut-control-${control}`]),
            ],
            root,
            timeout: 100_000,
            testContext: context,
            prepare: () => buildFixture(root, "runner"),
          });
          expect(
            execution,
            `${execution.stdout}\n${execution.stderr}`,
          ).toMatchObject({
            exitCode: control === "none" ? 0 : 1,
            signal: null,
            reason: "exit",
            cleanupErrors: [],
          });
          if (control !== "none") {
            expect(execution.stdout).not.toContain(prefix);
            expect(execution.stderr).toMatch(
              /held-fullscreen: (captured gesture leaked to the actual PTY|application action invoked during capture|actual fullscreen changed)/u,
            );
            return;
          }
          const results = execution.stdout
            .split("\n")
            .filter((line) => line.startsWith(prefix));
          expect(results).toHaveLength(1);
          const observation = JSON.parse(results[0]!.slice(prefix.length)) as {
            shortcuts: Awaited<ReturnType<typeof exerciseShortcutCapture>>;
          };
          const { nativeOwnedRepeats, nativeOwnedReleases, ...shortcuts } =
            observation.shortcuts;
          expect(nativeOwnedRepeats).toBeGreaterThanOrEqual(4);
          expect(
            Number.isSafeInteger(nativeOwnedReleases) &&
              nativeOwnedReleases >= 0,
          ).toBe(true);
          expect({ shortcuts }).toEqual({
            shortcuts: {
              phases: [
                "held-fullscreen",
                "held-quit",
                "overlapping-invalid-modifier",
                "missing-release-fresh-press",
                "page-departure-without-blur",
                "window-blur",
                "real-timeout",
                "normal-action-menu-controls",
              ],
              actualRawPty: true,
              syntheticInput: true,
              physicalLayout: false,
              unchangedConfiguration: true,
            },
          });
        } finally {
          if (!supervised) await rm(root, { recursive: true, force: true });
        }
      },
    );
  },
);
