import { expect, it } from "vitest";
import { observeNativeWindow } from "../fixtures/native-window-observation";
import { nativeWindowDiscoveryTimeout } from "../fixtures/window-policy";

it(
  "rejects native discovery exceptions, unhealthy initial state, health deadlines and missing/duplicate/nonzero completion",
  async (testContext) => {
    for (const control of [
      "error",
      "initial-hidden",
      "initial-maximized",
      "held-health",
      "missing-report",
      "duplicate-report",
      "nonzero-report",
    ] as const) {
      let failure: unknown;
      try {
        await observeNativeWindow("cursor", 1, control, testContext);
      } catch (error) {
        failure = error;
      }
      expect(failure, control).toBeInstanceOf(Error);
      if (control === "duplicate-report" || control === "nonzero-report") {
        expect(failure, control).toMatchObject({
          message: expect.stringContaining(
            control === "duplicate-report"
              ? "Expected one complete independent native window observation"
              : "Independent native observation failed",
          ) as unknown,
          cause: {
            stdout: expect.stringContaining(
              "__OMXTERM_NATIVE_WINDOW__",
            ) as unknown,
          },
        });
      }
      expect(failure, control).toMatchObject({
        cause: {
          exitCode: ["missing-report", "duplicate-report"].includes(control)
            ? 0
            : 1,
          reason: "exit",
          signal: null,
          cleanupErrors: [],
          stdout: expect.stringContaining(
            `__OMXTERM_NATIVE_WINDOW_CONTROL__${control}`,
          ) as unknown,
        },
      });
    }
  },
  7 * nativeWindowDiscoveryTimeout("cursor"),
);
