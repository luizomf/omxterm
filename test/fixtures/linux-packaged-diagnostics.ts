import assert from "node:assert/strict";

// A completed scenario is not a disposition of native diagnostics.
export function publicNativeDiagnostics(
  enabled: boolean,
  stderrTruncated: boolean,
) {
  return enabled
    ? { stderrTruncated, disposition: "manual-review-required" as const }
    : undefined;
}

export function assertCompletePublicStderr(
  enabled: boolean,
  truncated: boolean,
) {
  if (enabled) assert.equal(truncated, false, "native stderr truncated");
}
