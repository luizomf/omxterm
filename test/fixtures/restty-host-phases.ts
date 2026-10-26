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
  "refit-layout",
  "refit-calibration",
  "refit-restoration",
  "refit-baseline-ack",
  "refit-prefix-ack",
  "refit-native-grid",
  "refit-resize-call",
  "refit-continuation-write",
  "refit-cleanup",
] as const;

export interface OutputRefitProgress {
  readonly sourceBytes: number;
  readonly checkpoints: number;
  readonly cumulativeAck: number;
  readonly pendingBytes: number;
  readonly pauseCount: number;
  readonly resumeCount: number;
}

export interface OutputRefitBoundary {
  readonly countBefore: number;
  readonly requestCount: number;
  readonly expectedCols: number;
  readonly expectedRows: number;
  readonly latestRequestedCols: number;
  readonly latestRequestedRows: number;
}

const boundaryPhases = ["width-enter", "width-settled", "grid-first"] as const;
export function recordOutputRefitBoundary(
  phase: (typeof boundaryPhases)[number],
  boundary: OutputRefitBoundary,
  result?: "fulfilled" | "rejected" | boolean,
): void {
  try {
    if (!boundaryPhases.includes(phase)) return;
    if (
      (phase === "width-enter" && result !== undefined) ||
      (phase === "width-settled" &&
        result !== "fulfilled" &&
        result !== "rejected") ||
      (phase === "grid-first" && typeof result !== "boolean")
    )
      return;
    const values = {
      countBefore: boundary.countBefore,
      requestCount: boundary.requestCount,
      expectedCols: boundary.expectedCols,
      expectedRows: boundary.expectedRows,
      latestRequestedCols: boundary.latestRequestedCols,
      latestRequestedRows: boundary.latestRequestedRows,
    };
    if (
      !Object.values(values).every(
        (value) => Number.isSafeInteger(value) && value >= 0,
      )
    )
      return;
    writeSync(
      1,
      `__OMXTERM_OUTPUT_REFIT_PROGRESS__${JSON.stringify({ version: 1, phase, ...values, ...(phase === "width-settled" ? { outcome: result } : phase === "grid-first" ? { predicate: result } : {}), at: Date.now(), monotonicMs: performance.now() })}\n`,
    );
  } catch {
    // Observation cannot starve the width operation or grid predicate.
  }
}

const progressPhases = [
  "baseline",
  "prefix-enter",
  "prefix-ready",
  "prefix-failure",
  "continuation-returned",
  "continuation-output",
  "continuation-failure",
  "resize-failure",
] as const;

export function recordOutputRefitProgress(
  phase: (typeof progressPhases)[number],
  progress: OutputRefitProgress | undefined,
  prefix?: {
    readonly baselineBytes: number;
    readonly prefixUnits: number;
    readonly expectedSourceBytes: number;
  },
  resizeFailure?: "closed-pty" | "native-failure",
): void {
  try {
    if (!progressPhases.includes(phase)) return;
    // A failure can precede the exercise's flow reader. Report the event now,
    // without pretending that later metrics describe its original boundary.
    if (!progress && (phase !== "resize-failure" || !resizeFailure || prefix))
      return;
    const values = {
      ...(progress
        ? {
            sourceBytes: progress.sourceBytes,
            checkpoints: progress.checkpoints,
            cumulativeAck: progress.cumulativeAck,
            pendingBytes: progress.pendingBytes,
            pauseCount: progress.pauseCount,
            resumeCount: progress.resumeCount,
          }
        : {}),
      ...(prefix
        ? {
            baselineBytes: prefix.baselineBytes,
            prefixUnits: prefix.prefixUnits,
            expectedSourceBytes: prefix.expectedSourceBytes,
          }
        : {}),
    };
    if (
      !Object.values(values).every(
        (value) => Number.isSafeInteger(value) && value >= 0,
      )
    )
      return;
    if (
      resizeFailure !== undefined &&
      !["closed-pty", "native-failure"].includes(resizeFailure)
    )
      return;
    writeSync(
      1,
      `__OMXTERM_OUTPUT_REFIT_PROGRESS__${JSON.stringify({ version: 1, phase, ...values, ...(!progress ? { progress: "unavailable" } : {}), ...(resizeFailure ? { resizeFailure } : {}), at: Date.now(), monotonicMs: performance.now() })}\n`,
    );
  } catch {
    // Diagnostics cannot throw through output/resize/lifecycle listeners.
  }
}

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
