import { writeSync } from "node:fs";
import { performance } from "node:perf_hooks";

const phases = [
  "app-ready",
  "window-load",
  "first-session",
  "native-focus-request",
  "native-focus-event",
  "native-focus",
  "dom-focus",
  "dom-focus-query",
  "output-session",
  "output-producer-ready",
  "output-configuration",
  "output-renderer-stall",
  "output-high-water",
  "output-resume",
  "checkpoint-source",
  "checkpoint-ack",
  "checkpoint-copy",
  "output-producer-exit",
  "output-memory",
] as const;

// Fixed synthetic vocabulary only. Synchronous writes survive an outer timeout;
// diagnostic failure must not change an operation, its result or its deadline.
export function recordResttyHostPhase(
  phase: (typeof phases)[number],
  status: "begin" | "complete",
  checkpoint?: number,
): void {
  try {
    if (!phases.includes(phase) || !["begin", "complete"].includes(status))
      return;
    if (phase.startsWith("checkpoint-")) {
      if (!Number.isInteger(checkpoint) || checkpoint! < 0 || checkpoint! >= 16)
        return;
    } else if (checkpoint !== undefined) return;
    writeSync(
      1,
      `__OMXTERM_RESTTY_HOST_PHASE__${JSON.stringify({ version: 1, phase, status, ...(checkpoint === undefined ? {} : { checkpoint }), at: Date.now(), monotonicMs: performance.now() })}\n`,
    );
  } catch {
    // The original operation and mechanical supervisor outcome remain authority.
  }
}
