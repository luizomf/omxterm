import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import type { NativeFixtureTestContext } from "./run-native-fixture";
import type {
  BenchmarkBaseline,
  ComparisonRow,
} from "./performance-benchmark-baseline";
import {
  baselineFrom,
  baselinePreflight,
  comparability,
  comparisonRows,
  isBaseline,
  recordingRefusal,
} from "./performance-benchmark-baseline";
import {
  blockingIssues,
  integrityIssues,
  type IntegrityIssue,
} from "./performance-benchmark-integrity";
import {
  deriveBenchmarkReport,
  profileFor,
  type BenchmarkProfile,
  type BenchmarkReport,
  type RawBenchmarkRun,
  type RawRuntimeRun,
} from "./performance-benchmark-report";
import { renderSummary } from "./performance-benchmark-summary";
import { PERFORMANCE_BENCHMARK } from "./performance-benchmark-workload";
import {
  runExtensionRuntime,
  runVariant,
  writeBenchmarkArtifacts,
  writeBenchmarkFailure,
  type BenchmarkRunOptions,
  type WrittenArtifacts,
} from "./performance-benchmark-session";

// One runner drives every entry path: the integration test, the documented
// command and the baseline recorder differ only in what they do with the
// outcome, never in how the measurement is launched.
export interface BenchmarkRequest {
  readonly scratch: string;
  readonly baselinePath: string;
  readonly artifactsDirectory?: string;
  readonly variants?: readonly number[];
  readonly repetitions?: number;
  readonly testContext?: NativeFixtureTestContext;
  /** Fault injection for the integrity path: one stream never completes. */
  readonly truncateStream?: boolean;
  readonly recordBaseline?: {
    readonly sourceCommit: string;
    readonly replace: boolean;
    readonly cleanTree: boolean;
  };
}

export interface BenchmarkOutcome {
  readonly report: BenchmarkReport;
  readonly profile: BenchmarkProfile;
  readonly issues: readonly IntegrityIssue[];
  readonly baseline: BenchmarkBaseline | null;
  readonly comparison: readonly ComparisonRow[];
  readonly comparabilityReasons: readonly string[];
  readonly recorded: boolean;
  readonly artifacts: WrittenArtifacts;
}

class InvalidBaselineError extends Error {}

async function readBaseline(
  pathname: string,
): Promise<BenchmarkBaseline | undefined> {
  let text: string;
  try {
    text = await readFile(pathname, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return undefined;
    throw error;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new InvalidBaselineError(
      `Unreadable performance baseline: ${pathname}`,
    );
  }
  if (!isBaseline(parsed))
    throw new InvalidBaselineError(
      `Unreadable performance baseline (missing or invalid schema or profile): ${pathname}`,
    );
  return parsed;
}

async function writeBaseline(
  pathname: string,
  baseline: BenchmarkBaseline,
): Promise<void> {
  await mkdir(path.dirname(pathname), { recursive: true });
  await writeFile(pathname, `${JSON.stringify(baseline, null, 2)}\n`);
}

async function measure(
  request: BenchmarkRequest,
  variants: readonly number[],
  repetitions: number,
): Promise<{
  report: BenchmarkReport;
  raw: {
    repetitions: readonly (readonly RawBenchmarkRun[])[];
    runtime: RawRuntimeRun;
  };
}> {
  const base: Omit<BenchmarkRunOptions, "scrollbackLines"> = {
    scratch: request.scratch,
    ...(request.truncateStream ? { truncateStream: true } : {}),
    ...(request.testContext ? { testContext: request.testContext } : {}),
  };
  // Several fresh repetitions per variant: a single run of this virtualized
  // renderer swings by tens of percent, so the committed value is a median.
  const runs = [];
  for (const scrollbackLines of variants) {
    const repetition = [];
    for (let index = 0; index < repetitions; index += 1)
      repetition.push(await runVariant({ ...base, scrollbackLines }));
    runs.push(repetition);
  }
  const runtime = await runExtensionRuntime(base);
  return {
    report: deriveBenchmarkReport({
      repetitions: runs,
      runtime,
      repetitionsRequested: repetitions,
    }),
    raw: { repetitions: runs, runtime },
  };
}

export { profileFor };

async function prepareBaseline(
  request: BenchmarkRequest,
  variants: readonly number[],
): Promise<{
  baseline: BenchmarkBaseline | undefined;
  discardedBaseline: string | null;
}> {
  let baseline: BenchmarkBaseline | undefined;
  let discardedBaseline: string | null = null;
  try {
    baseline = await readBaseline(request.baselinePath);
    const problem = baseline && baselinePreflight(baseline, variants);
    if (problem)
      throw new InvalidBaselineError(
        `Unreadable performance baseline: ${problem}`,
      );
  } catch (error) {
    if (
      !(error instanceof InvalidBaselineError) ||
      !request.recordBaseline?.replace
    )
      throw error;
    discardedBaseline = error.message;
    baseline = undefined;
  }
  if (request.recordBaseline) {
    const refusal = recordingRefusal({
      cleanTree: request.recordBaseline.cleanTree,
      blockingIssueCodes: [],
      baselineExists: baseline !== undefined || discardedBaseline !== null,
      replace: request.recordBaseline.replace,
    });
    if (refusal) throw new Error(refusal);
  }
  return { baseline, discardedBaseline };
}

export async function runAndEvaluate(
  request: BenchmarkRequest,
): Promise<BenchmarkOutcome> {
  const variants = request.variants ?? [10_000, 0];
  const repetitions = request.repetitions ?? 3;
  if (!Number.isSafeInteger(repetitions) || repetitions < 1)
    throw new Error("The benchmark needs at least one repetition");
  if (!variants.includes(0) || !variants.some((lines) => lines > 0))
    throw new Error(
      "The scrollback pair needs a zero-history variant and a retained-history variant",
    );
  if (request.recordBaseline) {
    const refusal = recordingRefusal({
      cleanTree: request.recordBaseline.cleanTree,
      blockingIssueCodes: [],
      baselineExists: false,
      replace: request.recordBaseline.replace,
    });
    if (refusal) throw new Error(refusal);
  }
  await mkdir(request.scratch, { recursive: true });
  const directory =
    request.artifactsDirectory ?? path.join(request.scratch, "artifacts");
  let baseline: BenchmarkBaseline | undefined;
  let discardedBaseline: string | null = null;
  let report: BenchmarkReport;
  let raw: Awaited<ReturnType<typeof measure>>["raw"];
  try {
    ({ baseline, discardedBaseline } = await prepareBaseline(
      request,
      variants,
    ));
    ({ report, raw } = await measure(request, variants, repetitions));
  } catch (error) {
    await writeBenchmarkFailure(directory, "measurement", error);
    throw error;
  }
  const profile = profileFor(process.platform, process.arch);
  const verdict =
    baseline === undefined
      ? { comparable: false, reasons: ["no baseline is recorded"] as string[] }
      : comparability(report, baseline, profile.key);
  const skipReasons =
    baseline === undefined
      ? ["no baseline is recorded for this profile"]
      : verdict.reasons;
  const issues = integrityIssues(report, {
    expectedRepetitions: repetitions,
    expectedStreams: PERFORMANCE_BENCHMARK.streamRepeats,
    baselinePresent: baseline !== undefined,
    compared: verdict.comparable,
    replacing: request.recordBaseline?.replace ?? false,
    skipReasons,
  });
  if (discardedBaseline)
    issues.push({
      code: "baseline-replaced",
      detail:
        "The existing baseline was unreadable and is being replaced explicitly.",
      blocking: false,
    });
  const comparison =
    baseline === undefined || !verdict.comparable
      ? []
      : comparisonRows(report, baseline);
  const artifacts = await writeBenchmarkArtifacts(
    directory,
    report,
    renderSummary(report, {
      issues,
      baseline: baseline ?? null,
      comparison,
      comparabilityReasons: verdict.reasons,
    }),
    raw,
  );
  const outcome: BenchmarkOutcome = {
    report,
    profile,
    issues,
    baseline: baseline ?? null,
    comparison,
    comparabilityReasons: verdict.reasons,
    recorded: false,
    artifacts,
  };
  if (!request.recordBaseline) return outcome;
  const refusal = recordingRefusal({
    cleanTree: request.recordBaseline.cleanTree,
    blockingIssueCodes: blockingIssues(issues).map(
      (issue) => `${issue.code} (${issue.detail})`,
    ),
    baselineExists: baseline !== undefined || discardedBaseline !== null,
    replace: request.recordBaseline.replace,
  });
  if (refusal) throw new Error(refusal);
  const recorded = baselineFrom(
    report,
    request.recordBaseline.sourceCommit,
    profile.key,
  );
  await writeBaseline(request.baselinePath, recorded);
  return { ...outcome, recorded: true };
}
