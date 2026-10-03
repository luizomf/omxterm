const stages = [
  "entry",
  "app-ready",
  "window-load",
  "a-ready",
  "b-held",
  "surface-count",
  "b-close",
  "b-removed",
  "b-release",
  "b-settled",
  "evidence",
  "failure-banner",
  "paste-input",
  "paste-response",
  "last-close",
  "complete",
] as const;

// Fixed fixture vocabulary only; the supervisor retains stdout after timeout.
export function recordInitializationStage(
  boundary: "fonts" | "runtime",
  stage: (typeof stages)[number],
  status: "begin" | "complete",
): void {
  try {
    if (
      !["fonts", "runtime"].includes(boundary) ||
      !stages.includes(stage) ||
      !["begin", "complete"].includes(status)
    )
      return;
    process.stdout.write(
      `__OMXTERM_INITIALIZATION_STAGE__${JSON.stringify({ version: 1, boundary, stage, status, at: Date.now() })}\n`,
    );
  } catch {
    // Diagnostic failure must not change the original operation or outcome.
  }
}
