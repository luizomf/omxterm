import { expect, it } from "vitest";
import {
  assertCompletePublicStderr,
  publicNativeDiagnostics,
} from "../fixtures/linux-packaged-diagnostics.js";

it("does not confuse completed public scenarios with reviewed native diagnostics", () => {
  expect(publicNativeDiagnostics(true, false)).toEqual({
    stderrTruncated: false,
    disposition: "manual-review-required",
  });
  expect(publicNativeDiagnostics(true, true)).toEqual({
    stderrTruncated: true,
    disposition: "manual-review-required",
  });
  expect(publicNativeDiagnostics(false, true)).toBeUndefined();
  expect(() => assertCompletePublicStderr(true, false)).not.toThrow();
  expect(() => assertCompletePublicStderr(true, true)).toThrow(/truncated/);
  expect(() => assertCompletePublicStderr(false, true)).not.toThrow();
});
