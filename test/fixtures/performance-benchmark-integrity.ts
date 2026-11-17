import type {
  AttributionSummary,
  BenchmarkReport,
  RepetitionSummary,
  VariantSummary,
} from "./performance-benchmark-report";
import { ROLES } from "./performance-benchmark-report";
import {
  PERFORMANCE_BENCHMARK,
  streamPayloadBytes,
} from "./performance-benchmark-workload";

// Integrity is about whether the run is a valid observation, never about
// whether the numbers are good. A short sample, a missing metric or a stream
// that did not complete makes the report misleading regardless of any
// threshold, so those are the only conditions that can exit non-zero.
export interface IntegrityIssue {
  readonly code: string;
  readonly detail: string;
  /** False for observations that qualify the report without invalidating it. */
  readonly blocking: boolean;
}

export interface IntegrityContext {
  readonly expectedRepetitions: number;
  readonly expectedStreams: number;
  readonly baselinePresent: boolean;
  readonly compared: boolean;
  /** A reviewed replacement replaces the old baseline rather than comparing. */
  readonly replacing: boolean;
  readonly skipReasons: readonly string[];
}

const fixed = (value: number | null | undefined, digits = 0): string =>
  value === null || value === undefined ? "missing" : value.toFixed(digits);

type Push = (code: string, detail: string) => void;

function stepIssues(
  repetition: RepetitionSummary,
  at: string,
  blocking: Push,
  addable: boolean,
): void {
  for (const step of ["one", "three", "six"] as const) {
    const matches = repetition.steps.filter((entry) => entry.name === step);
    const measured = matches[0];
    if (
      matches.length !== 1 ||
      measured === undefined ||
      measured.tabs !== ({ one: 1, three: 3, six: 6 } as const)[step]
    ) {
      blocking("step-missing", `${at}: no ${step}-tab step`);
      continue;
    }
    if (measured.sampleCount !== PERFORMANCE_BENCHMARK.settleSamples)
      blocking(
        "sample-count",
        `${at} / ${step}: ${measured.sampleCount} of ${PERFORMANCE_BENCHMARK.settleSamples} settled samples`,
      );
    if (!measured.sampleTimesValid)
      blocking(
        "sample-interval-invalid",
        `${at} / ${step}: settled sample times are unusable`,
      );
    for (const role of ROLES)
      if (
        measured.roles[role]?.steadyBytes === null ||
        measured.roles[role]?.steadyBytes === undefined ||
        measured.roles[role]?.peakBytes === null ||
        measured.roles[role]?.peakBytes === undefined
      )
        blocking(
          "missing-metric",
          `${at} / ${step} tabs: no ${role} memory reading`,
        );
    if (!measured.applicationMemoryComplete)
      blocking(
        "missing-metric",
        `${at} / ${step} tabs: an application process has no memory reading`,
      );
    if (addable && measured.totalBytes === null)
      blocking("missing-metric", `${at} / ${step} tabs: no application total`);
  }
  for (const window of ["oneToThree", "threeToSix"] as const)
    for (const role of ROLES)
      if (repetition.marginal[window].perTab[role] === null)
        blocking(
          "missing-metric",
          `${at} / ${window}: no ${role} per-tab marginal`,
        );
}

function attributionIncomplete(
  attribution: AttributionSummary,
  expectedStreams: number,
  requireCpu: boolean,
): boolean {
  return (
    attribution.expectedBytes !== streamPayloadBytes() ||
    attribution.afterSampleCount !== PERFORMANCE_BENCHMARK.settleSamples ||
    attribution.endpointCount !== expectedStreams ||
    !attribution.sampleTimesValid ||
    !attribution.applicationMemoryComplete ||
    (requireCpu &&
      (!Number.isFinite(attribution.totalCpuPercentOneCore) ||
        (attribution.totalCpuPercentOneCore ?? 0) < 0)) ||
    !Number.isFinite(attribution.groupWindowMs) ||
    attribution.groupWindowMs <= 0 ||
    ROLES.some(
      (role) =>
        !Number.isFinite(attribution.roles[role].beforeBytes) ||
        !Number.isFinite(attribution.roles[role].peakBytes) ||
        !Number.isFinite(attribution.roles[role].afterBytes) ||
        !Number.isFinite(attribution.roles[role].retainedBytes),
    )
  );
}

function streamIssues(
  repetition: RepetitionSummary,
  context: IntegrityContext,
  at: string,
  blocking: Push,
  requireCpu: boolean,
): void {
  const names = ["ascii", "variety", "deep-history"];
  if (repetition.attribution.length !== names.length)
    blocking(
      "attribution-count",
      `${at}: ${repetition.attribution.length} of ${names.length} stream groups reported`,
    );
  for (const name of names) {
    if (
      repetition.attribution.filter((entry) => entry.name === name).length !== 1
    )
      blocking(
        "attribution-missing",
        `${at}: expected one ${name} attribution`,
      );
  }
  for (const attribution of repetition.attribution) {
    if (attributionIncomplete(attribution, context.expectedStreams, requireCpu))
      blocking(
        "attribution-metric-invalid",
        `${at} / ${attribution.name}: incomplete group interval or memory observations`,
      );
    if (attribution.streams.length !== context.expectedStreams)
      blocking(
        "stream-count",
        `${at} / ${attribution.name}: ${attribution.streams.length} of ${context.expectedStreams} stream repetitions reported`,
      );
    for (const [index, stream] of attribution.streams.entries()) {
      if (!stream.found || stream.bytes === null) {
        blocking(
          "stream-incomplete",
          `${at} / ${attribution.name} / stream ${index + 1}: the payload never completed`,
        );
        continue;
      }
      if (
        !Number.isSafeInteger(stream.bytes) ||
        stream.bytes < 0 ||
        !Number.isSafeInteger(stream.expectedBytes) ||
        stream.expectedBytes <= 0 ||
        stream.elapsedMs === null ||
        !Number.isFinite(stream.elapsedMs) ||
        stream.elapsedMs <= 0
      ) {
        blocking(
          "stream-metric-invalid",
          `${at} / ${attribution.name} / stream ${index + 1}: unusable byte count or interval`,
        );
        continue;
      }
      const overhead = stream.bytes - stream.expectedBytes;
      if (overhead < 0 || overhead > 64)
        blocking(
          "stream-delivery",
          `${at} / ${attribution.name} / stream ${index + 1}: arrived ${fixed(stream.bytes)} bytes for a ${fixed(stream.expectedBytes)}-byte payload (${fixed(overhead)} bytes of overhead, allowed 0-64)`,
        );
    }
  }
}

function repetitionIssues(
  variant: VariantSummary,
  repetition: RepetitionSummary,
  context: IntegrityContext,
  blocking: Push,
  addable: boolean,
  requireCpu: boolean,
): void {
  const at = `${variant.scrollbackLines} lines / repetition ${repetition.index}`;
  if (
    repetition.idle.name !== "full-tab-set" ||
    repetition.quiet.name !== "sitting-still-after-history"
  )
    blocking("window-name", `${at}: unexpected idle or post-history scenario`);
  stepIssues(repetition, at, blocking, addable);
  streamIssues(repetition, context, at, blocking, requireCpu);
  const cpuWindowNames = [
    "blink-off-focused",
    "blink-off-unfocused",
    "blink-on-focused",
    "blink-on-unfocused",
  ];
  if (repetition.idleCpuWindows.length !== cpuWindowNames.length)
    blocking(
      "cpu-window-count",
      `${at}: ${repetition.idleCpuWindows.length} of ${cpuWindowNames.length} CPU windows reported`,
    );
  for (const name of cpuWindowNames) {
    if (
      repetition.idleCpuWindows.filter((window) => window.name === name)
        .length !== 1
    )
      blocking("cpu-window-missing", `${at}: expected one ${name} CPU window`);
  }
  for (const window of repetition.idleCpuWindows) {
    if (
      window.documentHasFocus !== !window.name.endsWith("-unfocused") ||
      window.visibilityState !== "visible"
    )
      blocking(
        "cpu-window-state",
        `${at} / ${window.name}: observed focus ${window.documentHasFocus}, visibility ${window.visibilityState}`,
      );
  }
  for (const window of [
    repetition.idle,
    ...repetition.idleCpuWindows,
    repetition.quiet,
  ]) {
    if (
      !Number.isFinite(window.windowMs) ||
      window.windowMs <= 0 ||
      !window.applicationMemoryComplete ||
      !window.sampleTimesValid ||
      (requireCpu &&
        (!Number.isFinite(window.totalCpuPercentOneCore) ||
          (window.totalCpuPercentOneCore ?? 0) < 0)) ||
      ROLES.some(
        (role) =>
          !Number.isFinite(window.growthBytes[role]) ||
          (requireCpu &&
            (!Number.isFinite(window.cpuPercentOneCore[role]) ||
              (window.cpuPercentOneCore[role] ?? 0) < 0)),
      )
    )
      blocking(
        "window-invalid",
        `${at} / ${window.name}: unusable sample interval, memory or application CPU`,
      );
  }
  const inputCount =
    repetition.inputLatency.samplesMs.length + repetition.inputLatency.failures;
  if (inputCount !== PERFORMANCE_BENCHMARK.keystrokes)
    blocking(
      "input-count",
      `${at}: ${inputCount} of ${PERFORMANCE_BENCHMARK.keystrokes} keystrokes reported`,
    );
  if (repetition.inputLatency.failures > 0)
    blocking(
      "latency-observation-failed",
      `${at}: ${repetition.inputLatency.failures} of ${repetition.inputLatency.samplesMs.length + repetition.inputLatency.failures} keystrokes produced no grid observation`,
    );
}

function runtimeIssues(report: BenchmarkReport, blocking: Push): void {
  const runtime = report.extensionRuntime;
  if (runtime === null) {
    blocking(
      "extension-runtime-missing",
      "the extension runtime did not report",
    );
    return;
  }
  if (
    !Number.isFinite(runtime.windowMs) ||
    runtime.windowMs <= 0 ||
    !Number.isSafeInteger(runtime.processCount) ||
    runtime.processCount < 1 ||
    !runtime.settled ||
    !Number.isFinite(runtime.steadyBytes) ||
    !Number.isFinite(runtime.growthBytes) ||
    (report.machine.platform === "linux" &&
      (!Number.isFinite(runtime.cpuPercentOneCore) ||
        (runtime.cpuPercentOneCore ?? 0) < 0))
  )
    blocking(
      "extension-runtime-incomplete",
      "the extension runtime did not report a complete usable window",
    );
}

export function integrityIssues(
  report: BenchmarkReport,
  context: IntegrityContext,
): IntegrityIssue[] {
  const issues: IntegrityIssue[] = [];
  const blocking: Push = (code, detail) =>
    issues.push({ code, detail, blocking: true });
  const notice: Push = (code, detail) =>
    issues.push({ code, detail, blocking: false });

  if (!report.variants.some((variant) => variant.scrollbackLines === 0))
    blocking("variant-missing", "the zero-history variant did not run");
  if (!report.variants.some((variant) => variant.scrollbackLines > 0))
    blocking("variant-missing", "the retained-history variant did not run");

  for (const variant of report.variants) {
    if (variant.repetitions.length !== context.expectedRepetitions)
      blocking(
        "repetition-missing",
        `${variant.scrollbackLines} lines: ${variant.repetitions.length} of ${context.expectedRepetitions} repetitions completed`,
      );
    for (const repetition of variant.repetitions)
      repetitionIssues(
        variant,
        repetition,
        context,
        blocking,
        report.metric.addable,
        report.machine.platform === "linux",
      );
  }

  if (!report.determinism.settingsApplied)
    blocking(
      "settings-not-applied",
      "the renderer did not apply the recorded font and scrollback settings",
    );
  if (!report.determinism.gridStable)
    blocking("grid-unstable", "the renderer grid changed between repetitions");
  if (!report.determinism.quiescenceVerified)
    blocking(
      "quiescence-not-verified",
      "a measured window was not content-quiescent; memory growth there is not attributable to retention",
    );
  runtimeIssues(report, blocking);
  if (context.baselinePresent && !context.compared && !context.replacing)
    blocking(
      "unexpected-skip",
      `a baseline exists for this profile but was not compared: ${context.skipReasons.join("; ")}`,
    );
  if (!report.measurementControl.rendererGcAvailable)
    notice(
      "gc-unavailable",
      "the renderer heap could not be collected before sampling; retained floors carry collected garbage and are noisier",
    );
  return issues;
}

export function blockingIssues(
  issues: readonly IntegrityIssue[],
): IntegrityIssue[] {
  return issues.filter((issue) => issue.blocking);
}
