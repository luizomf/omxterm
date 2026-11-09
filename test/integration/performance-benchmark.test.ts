import { readFile } from "node:fs/promises";
import path from "node:path";
import { expect, it } from "vitest";
import { runAndEvaluate } from "../fixtures/performance-benchmark-run";
import { blockingIssues } from "../fixtures/performance-benchmark-integrity";

// Opt-in only: the default suite stays fast and does not open windows.
const enabled = Boolean(process.env.OMXTERM_TEST_PERFORMANCE_BENCHMARK);
const SCRATCH = path.resolve(".scratch/performance-benchmark");
const BASELINE = path.resolve(
  "test/performance",
  `baseline.${process.platform}-${process.arch}.json`,
);

it.skipIf(!enabled || !["darwin", "linux", "win32"].includes(process.platform))(
  "reports the fixed workload without judging the numbers",
  { timeout: 2_700_000 },
  async (testContext) => {
    const outcome = await runAndEvaluate({
      scratch: path.join(SCRATCH, "report"),
      baselinePath: BASELINE,
      testContext,
    });
    const summary = await readFile(outcome.artifacts.summaryPath, "utf8");
    const evidence = [
      `Report: ${outcome.artifacts.reportPath}`,
      `Summary: ${outcome.artifacts.summaryPath}`,
      `Issues: ${outcome.issues.map((issue) => issue.code).join(", ") || "none"}`,
      `Baseline: ${outcome.baseline === null ? "none" : outcome.comparabilityReasons.join("; ") || "compared"}`,
    ].join("\n");
    console.info(evidence);
    // A valid observation: no blocking integrity issue. Numbers are reported,
    // never judged, so the run cannot fail on how large or small they are.
    expect(blockingIssues(outcome.issues), evidence).toEqual([]);
    expect(summary, evidence).toContain("This run measures");
    expect(summary, evidence).toContain("What this does not prove");
    expect(summary, evidence).not.toMatch(/\bPASS\b/u);
    expect(summary, evidence).not.toMatch(/\bFAIL\b/u);
    // Repetition rows, not a single aggregate: the first repetition is printed.
    expect(summary, evidence).toContain("| one | 1 |");
    const full = outcome.report.variants.find(
      (variant) => variant.scrollbackLines > 0,
    )!;
    expect(full.repetitions.length).toBeGreaterThan(1);
    const sixRenderer =
      full.repetitions[0]?.steps.find((step) => step.name === "six")?.roles
        .renderer?.steadyBytes ?? 0;
    expect(sixRenderer).toBeGreaterThan(0);
    expect(summary, evidence).toContain(
      `${(sixRenderer / 1024 / 1024).toFixed(1)} MiB`,
    );
    if (outcome.baseline !== null && outcome.comparabilityReasons.length === 0)
      expect(outcome.comparison.length, evidence).toBeGreaterThan(0);
  },
);

it.skipIf(!enabled || !["darwin", "linux", "win32"].includes(process.platform))(
  "rejects a short payload as an invalid observation",
  { timeout: 2_700_000 },
  async (testContext) => {
    const outcome = await runAndEvaluate({
      scratch: path.join(SCRATCH, "truncated"),
      baselinePath: BASELINE,
      truncateStream: true,
      // One repetition per variant exercises the same timeout path without
      // repeating the deliberately incomplete 30-second stream waits.
      repetitions: 1,
      testContext,
    });
    const summary = await readFile(outcome.artifacts.summaryPath, "utf8");
    const blocking = blockingIssues(outcome.issues);
    const evidence = [
      `Summary: ${outcome.artifacts.summaryPath}`,
      `Blocking: ${blocking.map((issue) => issue.code).join(", ")}`,
    ].join("\n");
    console.info(evidence);
    // The byte-count prerequisite prevents a truncated payload from reaching
    // marker detection; the observer times out and reports an incomplete stream.
    expect(
      blocking.map((issue) => issue.code),
      evidence,
    ).toContain("stream-incomplete");
    expect(summary).toContain("invalid run");
  },
);
