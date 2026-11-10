import { createRequire } from "node:module";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { buildFixture } from "../fixtures/window-chrome-build";
import { runNativeFixture } from "../fixtures/run-native-fixture";
import {
  POPUP_INPUT_PROVISIONING_ENV,
  POPUP_INPUT_RECEIPT_PREFIX,
} from "../fixtures/terminal-popup-input-admission";

const executable = createRequire(import.meta.url)("electron") as string;
const prefix = "__OMXTERM_POPUP_NATIVE__";

describe.skipIf(process.platform !== "linux")(
  "native terminal popup ownership with real PTYs",
  () => {
    // An uncertain input/portal state must not receive the next case's keys.
    let previousCaseFailed = false;
    it.for(["none", "close-retarget", "clipboard-retarget"])(
      "checks %s routing with settled native ownership",
      { timeout: 120_000 },
      async (control, context) => {
        // An unprovisioned desktop is a missing prerequisite, not a regression.
        if (process.env[POPUP_INPUT_PROVISIONING_ENV] !== "1")
          context.skip(
            `Native popup input lane not provisioned; set ${POPUP_INPUT_PROVISIONING_ENV}=1 after provisioning (see docs/development.md#native-terminal-popup-linux)`,
          );
        context.signal.throwIfAborted();
        if (previousCaseFailed)
          throw new Error(
            "Native popup input lane requires operator inspection after the previous case failed",
          );
        previousCaseFailed = true;
        const root = await mkdtemp(
          path.join(tmpdir(), "omxterm-popup-native-"),
        );
        let supervised = false;
        try {
          context.signal.throwIfAborted();
          supervised = true;
          const execution = await runNativeFixture({
            executable,
            args: [
              "--no-sandbox",
              "--ozone-platform=x11",
              root,
              `--popup-control=${control}`,
            ],
            root,
            timeout: 90_000,
            testContext: context,
            prepare: () =>
              buildFixture(
                root,
                "runner",
                "test/fixtures/terminal-popup-native-main.ts",
              ),
          });
          const inputReceipts = execution.stdout
            .split("\n")
            .filter((line) => line.startsWith(POPUP_INPUT_RECEIPT_PREFIX));
          expect(
            inputReceipts,
            `Native popup input admission did not complete.\n${execution.stdout}\n${execution.stderr}`,
          ).toHaveLength(1);
          expect(
            JSON.parse(
              inputReceipts[0]!.slice(POPUP_INPUT_RECEIPT_PREFIX.length),
            ) as unknown,
          ).toEqual({
            warmupSubmitted: true,
            probeSubmitted: true,
            ownedWindow: true,
            keyDown: true,
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
            expect(execution.stderr).toContain(
              control === "close-retarget"
                ? "stale Close Pane must not inspect/confirm the surviving Busy child"
                : "source popup must not read clipboard after selected-window change",
            );
            previousCaseFailed = false;
            return;
          }
          const results = execution.stdout
            .split("\n")
            .filter((line) => line.startsWith(prefix));
          expect(results).toHaveLength(1);
          expect(
            JSON.parse(results[0]!.slice(prefix.length)) as unknown,
          ).toEqual({
            realNativePopup: true,
            nativeActivationFocusedWindow: true,
            clickedChildPaste: true,
            nativeClipboardSelection: true,
            nullableRemappedLocalized: true,
            busySharedSlot: true,
            ordinaryExitStaleInert: true,
            selectedWindowChangeInert: true,
            survivorCanvasRetained: true,
            childCount: 4,
            screenshot: !!process.env.OMXTERM_POPUP_EVIDENCE_DIR,
            syntheticInput: true,
            physicalInput: false,
            confirmationAnswers:
              "fixture-controlled; native dialog widgets not exercised",
          });
          previousCaseFailed = false;
        } finally {
          if (!supervised) await rm(root, { recursive: true, force: true });
        }
      },
    );
  },
);
