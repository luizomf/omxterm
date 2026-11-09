import type { IntegrityIssue } from "./performance-benchmark-integrity";
import type {
  BenchmarkBaseline,
  ComparisonRow,
} from "./performance-benchmark-baseline";
import type {
  BenchmarkReport,
  RepetitionSummary,
  VariantSummary,
} from "./performance-benchmark-report";
import { median } from "./performance-benchmark-report";

// Every statement a reader needs in order to predict what this tool will not
// catch. The docs test asserts that each one appears here, and the rejected
// findings of the gate design are part of the list on purpose.
export const LIMITATIONS: readonly string[] = [
  "This report measures; it does not decide whether a number is acceptable. There is no threshold, no pass and no fail.",
  "Run-to-run variation and cold versus warm stream behavior limit interpretation; the printed repetitions are descriptive, not an uncertainty bound.",
  "A uniform per-tab leak is not identified as a leak by this report; no allocation-shape verdict is computed.",
  "The idle window is about 12 s; slower growth may not be observable in that interval.",
  "Input latency is synthetic keydown to observed renderer grid change. Presentation latency (what a person sees) is not measured; the grid-change-to-next-draw figure is a repaint counter and is not latency.",
  "Process memory is the platform metric named at the top: PSS on Linux, phys_footprint on macOS, private bytes on Windows. Those quantities are not interchangeable and only a baseline recorded with the same metric is printed beside the candidate.",
  "The extension-runtime window is a single observation, not a repeated measurement.",
  "Only linux-arm64 has a recorded baseline in this repository. Every other profile reports and has nothing to compare against.",
  "The workload is a fixed script: ten thousand retained lines per tab, three tab steps, three streams of 328,000 bytes, a 12 s idle window and seven keystrokes. Regressions outside those exercises are invisible.",
  "A comparison is printed only when the protocol, metric, machine class and identity, grid, content size, pixel ratio, settings and renderer GC availability all match the recorded baseline; otherwise the reasons are printed and no table is shown.",
];

function mib(value: number | null | undefined): string {
  return value === null || value === undefined
    ? "-"
    : `${(value / 1024 / 1024).toFixed(1)} MiB`;
}

function bytes(value: number | null | undefined): string {
  return value === null || value === undefined ? "-" : `${value} B`;
}

function percent(value: number | null | undefined): string {
  return value === null || value === undefined ? "-" : `${value.toFixed(2)} %`;
}

function millis(value: number | null | undefined): string {
  return value === null || value === undefined ? "-" : `${value.toFixed(1)} ms`;
}

function kibs(value: number | null | undefined): string {
  return value === null || value === undefined
    ? "-"
    : `${(value / 1024).toFixed(1)} KiB/s`;
}

function short(hash: string | undefined): string {
  return hash === undefined ? "-" : hash.slice(0, 12);
}

function stepRow(repetition: RepetitionSummary, step: string): string {
  const measured = repetition.steps.find((entry) => entry.name === step);
  if (measured === undefined)
    return `| ${step} | ${repetition.index} | - | - | - | - |`;
  return `| ${step} | ${repetition.index} | ${mib(measured.roles.main?.steadyBytes)} | ${mib(measured.roles.renderer?.steadyBytes)} | ${mib(measured.roles.gpu?.steadyBytes)} | ${mib(measured.totalBytes)} |`;
}

function peakRow(repetition: RepetitionSummary, step: string): string {
  const measured = repetition.steps.find((entry) => entry.name === step);
  if (measured === undefined)
    return `| ${step} | ${repetition.index} | - | - | - |`;
  return `| ${step} | ${repetition.index} | ${mib(measured.roles.main?.peakBytes)} | ${mib(measured.roles.renderer?.peakBytes)} | ${mib(measured.roles.gpu?.peakBytes)} |`;
}

function marginalRows(repetition: RepetitionSummary): string[] {
  return (["oneToThree", "threeToSix"] as const).map((window) => {
    const measured = repetition.marginal[window];
    return `| ${window === "oneToThree" ? "tabs 1-3" : "tabs 3-6"} | ${repetition.index} | ${mib(measured.perTab.main)} | ${mib(measured.perTab.renderer)} | ${mib(measured.perTab.gpu)} | ${mib(measured.total)} |`;
  });
}

function idleRows(repetition: RepetitionSummary): string[] {
  const idle = repetition.idle;
  const cpu = repetition.idleCpuMedianPercent;
  return [
    `| ${repetition.index} | ${idle.windowMs.toFixed(0)} ms | ${mib(idle.growthBytes.renderer)} | ${mib(idle.growthBytes.main)} | ${mib(idle.growthBytes.gpu)} | ${mib(idle.totalGrowthBytes)} | ${percent(cpu.renderer)} | ${percent(cpu.main)} | ${percent(cpu.gpu)} | ${idle.draws} |`,
  ];
}

function streamRows(repetition: RepetitionSummary): string[] {
  const rows: string[] = [];
  for (const attribution of repetition.attribution)
    for (const [index, stream] of attribution.streams.entries())
      rows.push(
        `| ${repetition.index} | ${attribution.name} | ${index + 1} | ${stream.found ? "yes" : "NO"} | ${bytes(stream.bytes)} | ${bytes(stream.expectedBytes)} | ${stream.overheadBytes === null ? "-" : `${stream.overheadBytes} B`} | ${kibs(stream.bytesPerSecond)} | ${millis(stream.pollCostMs)} | ${mib(attribution.roles.renderer.peakBytes)} | ${mib(attribution.roles.renderer.retainedBytes)} |`,
      );
  return rows;
}

function latencyRows(repetition: RepetitionSummary): string[] {
  const latency = repetition.inputLatency;
  return [
    `| ${repetition.index} | ${millis(latency.medianMs)} | ${millis(latency.medianCorrectedMs)} | ${millis(latency.minMs)} / ${millis(latency.maxMs)} | ${latency.failures} | ${millis(latency.medianGridToDrawMs)} |`,
  ];
}

function variantSection(variant: VariantSummary): string[] {
  const label = `${variant.scrollbackLines} lines retained`;
  const repetitions = variant.repetitions;
  return [
    `## ${label}`,
    "",
    `Settings hash ${short(variant.settingsSha256)}; applied scrollback ${variant.appliedScrollbackLines}; ${repetitions.length} repetitions.`,
    "",
    "Platform memory metric, retained floor of the settled samples:",
    "",
    "| step | repetition | main | renderer | GPU | application total |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
    ...repetitions.flatMap((repetition) =>
      (["one", "three", "six"] as const).map((step) =>
        stepRow(repetition, step),
      ),
    ),
    "",
    "Peak memory over the same samples:",
    "",
    "| step | repetition | main | renderer | GPU |",
    "| --- | ---: | ---: | ---: | ---: |",
    ...repetitions.flatMap((repetition) =>
      (["one", "three", "six"] as const).map((step) =>
        peakRow(repetition, step),
      ),
    ),
    "",
    "Per-tab marginal cost between tab steps:",
    "",
    "| window | repetition | main | renderer | GPU | total |",
    "| --- | ---: | ---: | ---: | ---: | ---: |",
    ...repetitions.flatMap(marginalRows),
    "",
    "Idle window on the six-tab set (endpoint delta; CPU is the median of the four idle windows of the repetition):",
    "",
    "| repetition | window | renderer growth | main growth | GPU growth | total growth | renderer CPU | main CPU | GPU CPU | draws |",
    "| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...repetitions.flatMap(idleRows),
    "",
    "Named idle CPU and post-history windows (application total excludes fixture workloads):",
    "",
    "| repetition | window | observed focus | visibility | duration | renderer CPU | main CPU | GPU CPU | application CPU | renderer growth | draws |",
    "| ---: | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...repetitions.flatMap((repetition) =>
      [...repetition.idleCpuWindows, repetition.quiet].map(
        (window) =>
          `| ${repetition.index} | ${window.name} | ${window.documentHasFocus ? "focused" : "unfocused"} | ${window.visibilityState} | ${millis(window.windowMs)} | ${percent(window.cpuPercentOneCore.renderer)} | ${percent(window.cpuPercentOneCore.main)} | ${percent(window.cpuPercentOneCore.gpu)} | ${percent(window.totalCpuPercentOneCore)} | ${mib(window.growthBytes.renderer)} | ${window.draws} |`,
      ),
    ),
    "",
    "Streams (arrival bytes include the command echo and end marker; the allowance is printed):",
    "",
    "| repetition | stream | repetition of 3 | completed | arrived | payload | overhead | rate | observer cost | group renderer peak | group renderer retained |",
    "| ---: | --- | ---: | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |",
    ...repetitions.flatMap(streamRows),
    "",
    "Synthetic keydown to observed renderer grid change (not presentation):",
    "",
    "| repetition | raw median | observer-corrected median | min / max | failures | grid change to next counted draw |",
    "| ---: | ---: | ---: | ---: | ---: | ---: |",
    ...repetitions.flatMap(latencyRows),
    "",
  ];
}

function pairSection(report: BenchmarkReport): string[] {
  const pair = report.scrollbackPair;
  if (pair === null) return [];
  return [
    "## Scrollback pair",
    "",
    `Six tabs with ${pair.emptyLines} lines against ${pair.fullLines} lines, per repetition, per role:`,
    "",
    "| repetition | main | renderer | GPU |",
    "| ---: | ---: | ---: | ---: |",
    ...pair.deltas.map(
      (delta, index) =>
        `| ${index + 1} | ${mib(delta.main)} | ${mib(delta.renderer)} | ${mib(delta.gpu)} |`,
    ),
    "",
  ];
}

function runtimeSection(report: BenchmarkReport): string[] {
  const runtime = report.extensionRuntime;
  if (runtime === null) return [];
  return [
    "## Extension runtime",
    "",
    "Single observation of the application-owned extension runtime:",
    "",
    "| window | processes | steady | growth | CPU | settled |",
    "| ---: | ---: | ---: | ---: | ---: | --- |",
    `| ${runtime.windowMs.toFixed(0)} ms | ${runtime.processCount} | ${mib(runtime.steadyBytes)} | ${mib(runtime.growthBytes)} | ${percent(runtime.cpuPercentOneCore)} | ${runtime.settled ? "yes" : "NO"} |`,
    "",
  ];
}

// Comparison values are already expressed in `row.unit` (the comparison layer
// converts bytes and byte rates before taking medians), so the cell formats the
// number in that unit instead of converting a second time.
function cell(value: number | null, unit: ComparisonRow["unit"]): string {
  if (value === null) return "-";
  if (unit === "MiB") return `${value.toFixed(1)} MiB`;
  if (unit === "KiB/s") return `${value.toFixed(1)} KiB/s`;
  if (unit === "ms") return `${value.toFixed(1)} ms`;
  return `${value.toFixed(2)} %`;
}

function comparisonRow(row: ComparisonRow): string {
  const delta =
    row.deltaPercent === null
      ? "-"
      : `${row.deltaPercent >= 0 ? "+" : ""}${row.deltaPercent.toFixed(1)} %`;
  const candidateCounts = row.streamCounts
    ? `; ${row.streamCounts.candidate.join(", ")} streams`
    : "";
  const baselineCounts = row.streamCounts
    ? `; ${row.streamCounts.baseline.join(", ")} streams`
    : "";
  return `| ${row.family} | ${row.scenario} | ${cell(row.candidateMedian, row.unit)} (${row.candidateRepetitions.length} reps${candidateCounts}) | ${cell(row.baselineMedian, row.unit)} (${row.baselineRepetitions.length} reps${baselineCounts}) | ${delta} |`;
}

function comparisonSection(
  baseline: BenchmarkBaseline,
  rows: readonly ComparisonRow[],
  reasons: readonly string[],
): string[] {
  const lines = ["## Comparison with the recorded baseline", ""];
  if (reasons.length > 0) {
    lines.push(
      "Not comparable, so no numbers are printed side by side:",
      "",
      ...reasons.map((reason) => `- ${reason}`),
      "",
    );
    return lines;
  }
  lines.push(
    `Baseline recorded ${baseline.recordedAtUtc} from ${short(baseline.sourceCommit)}. Medians are taken across each side's repetitions. Candidate observations are in report.json; reference observations are in the recorded baseline file, which must be retained separately to reproduce this comparison. The delta is descriptive: no limit is applied and no verdict follows.`,
    "",
    "| family | scenario | candidate median | baseline median | delta |",
    "| --- | --- | ---: | ---: | ---: |",
    ...rows.map(comparisonRow),
    "",
  );
  return lines;
}

export interface SummaryContext {
  readonly issues: readonly IntegrityIssue[];
  readonly baseline: BenchmarkBaseline | null;
  readonly comparison: readonly ComparisonRow[];
  readonly comparabilityReasons: readonly string[];
}

function reportHeader(report: BenchmarkReport): string[] {
  const profile = report.machine;
  return [
    "# Performance benchmark report",
    "",
    "> This run measures. It carries no threshold and no verdict: nothing here says a",
    "> number is acceptable, and a smaller number is not a pass.",
    "",
    `Protocol \`${report.protocol}\`; metric ${report.metric.name} (${report.metric.source}); machine class \`${profile.class}\`; identity \`${profile.identityHash}\`; ${report.metric.qualification}.`,
    "",
    `Electron ${report.versions.electron ?? "-"}, Chromium ${report.versions.chrome ?? "-"}, Node ${report.versions.node ?? "-"}. Build: main ${short(report.identity.build.main)}, preload ${short(report.identity.build.preload)}, renderer ${short(report.identity.build.rendererBundle)}.`,
    "",
    `Content ${report.identity.contentSize.width}x${report.identity.contentSize.height}; requested ${report.identity.requestedContentSize.width}x${report.identity.requestedContentSize.height}; pixel ratio ${report.identity.devicePixelRatio}. Grids: ${Object.entries(
      report.identity.grid,
    )
      .map(
        ([tab, grid]) =>
          `${tab} ${grid.columns}x${grid.rows}@${grid.cellWidth}x${grid.cellHeight}`,
      )
      .join(", ")}.`,
    "",
    `Repetitions requested ${report.repetitionsRequested ?? "-"}; renderer garbage collection before sampling: ${report.measurementControl.rendererGcAvailable ? "available" : "unavailable"}.`,
    "",
  ];
}

function integritySection(issues: readonly IntegrityIssue[]): string[] {
  if (issues.length === 0)
    return ["## Data integrity", "", "No integrity issue was found.", ""];
  return [
    "## Data integrity",
    "",
    ...issues.map(
      (issue) =>
        `- ${issue.blocking ? "invalid run" : "note"} \`${issue.code}\`: ${issue.detail}`,
    ),
    "",
  ];
}

export function renderSummary(
  report: BenchmarkReport,
  context: SummaryContext,
): string {
  const lines = [
    ...reportHeader(report),
    ...integritySection(context.issues),
    ...report.variants.flatMap(variantSection),
    ...pairSection(report),
    ...runtimeSection(report),
  ];
  if (context.baseline !== null)
    lines.push(
      ...comparisonSection(
        context.baseline,
        context.comparison,
        context.comparabilityReasons,
      ),
    );
  else
    lines.push(
      "## Comparison with the recorded baseline",
      "",
      "No baseline is recorded for this profile, so there is nothing to compare. The numbers above are this run's observation.",
      "",
    );
  lines.push(
    "## What this does not prove",
    "",
    ...LIMITATIONS.map((limitation) => `- ${limitation}`),
    "",
  );
  return lines.join("\n");
}
