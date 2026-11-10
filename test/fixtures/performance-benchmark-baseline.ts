import type {
  BenchmarkReport,
  RepetitionSummary,
  ReportedRole,
  WindowSummary,
} from "./performance-benchmark-report";
import { ROLES, median } from "./performance-benchmark-report";
import {
  PERFORMANCE_BENCHMARK,
  streamPayloadBytes,
} from "./performance-benchmark-workload";

// The baseline stores what was measured, per repetition, for every family. It
// carries no tolerance and no verdict: a comparison is a side-by-side print of
// two runs of the same protocol on the same machine class.
export const PERFORMANCE_BASELINE_SCHEMA = 5;

export interface BaselineRepetition {
  readonly index: number;
  readonly steps: Readonly<
    Record<
      string,
      {
        readonly tabs: number;
        readonly roles: Readonly<
          Record<
            string,
            { steadyBytes: number | null; peakBytes: number | null }
          >
        >;
        readonly totalBytes: number | null;
      }
    >
  >;
  readonly marginal: {
    readonly oneToThree: {
      readonly perTab: Readonly<Record<ReportedRole, number | null>>;
      readonly total: number | null;
    };
    readonly threeToSix: {
      readonly perTab: Readonly<Record<ReportedRole, number | null>>;
      readonly total: number | null;
    };
  };
  readonly idle: {
    readonly windowMs: number;
    readonly growthBytes: Readonly<Record<string, number | null>>;
    readonly totalGrowthBytes: number | null;
    readonly cpuPercentOneCore: Readonly<Record<string, number | null>>;
  };
  readonly idleCpuWindows: readonly WindowSummary[];
  readonly quiet: WindowSummary;
  readonly idleCpuMedianPercent: Readonly<Record<string, number | null>>;
  readonly idleCpuTotalMedianPercent: number | null;
  readonly streams: ReadonlyArray<{
    readonly name: string;
    readonly expectedBytes: number;
    readonly rates: ReadonlyArray<number | null>;
    readonly bytes: ReadonlyArray<number | null>;
    readonly peaks: Readonly<Record<ReportedRole, number | null>>;
    readonly retained: Readonly<Record<ReportedRole, number | null>>;
    readonly cpuPercentOneCore: number | null;
  }>;
  readonly latency: {
    readonly medianMs: number | null;
    readonly medianCorrectedMs: number | null;
    readonly failures: number;
    readonly medianGridToDrawMs: number | null;
  };
}

export interface BenchmarkBaseline {
  readonly schema: number;
  readonly profileKey: string;
  readonly protocol: string;
  readonly recordedAtUtc: string;
  readonly sourceCommit: string;
  readonly metric: BenchmarkReport["metric"];
  readonly machine: BenchmarkReport["machine"];
  readonly versions: BenchmarkReport["versions"];
  readonly identity: BenchmarkReport["identity"];
  readonly measurementControl: BenchmarkReport["measurementControl"];
  readonly repetitionsRequested: number;
  readonly variants: Readonly<
    Record<
      string,
      {
        readonly scrollbackLines: number;
        readonly repetitions: readonly BaselineRepetition[];
      }
    >
  >;
  readonly scrollbackPair: BenchmarkReport["scrollbackPair"];
  readonly extensionRuntime: BenchmarkReport["extensionRuntime"];
}

function baselineRepetition(summary: RepetitionSummary): BaselineRepetition {
  return {
    index: summary.index,
    steps: Object.fromEntries(
      summary.steps.map((step) => [
        step.name,
        {
          tabs: step.tabs,
          roles: Object.fromEntries(
            Object.entries(step.roles).map(([role, value]) => [
              role,
              { steadyBytes: value.steadyBytes, peakBytes: value.peakBytes },
            ]),
          ),
          totalBytes: step.totalBytes,
        },
      ]),
    ),
    marginal: {
      oneToThree: {
        perTab: summary.marginal.oneToThree.perTab,
        total: summary.marginal.oneToThree.total,
      },
      threeToSix: {
        perTab: summary.marginal.threeToSix.perTab,
        total: summary.marginal.threeToSix.total,
      },
    },
    idle: {
      windowMs: summary.idle.windowMs,
      growthBytes: summary.idle.growthBytes,
      totalGrowthBytes: summary.idle.totalGrowthBytes,
      cpuPercentOneCore: summary.idle.cpuPercentOneCore,
    },
    idleCpuWindows: summary.idleCpuWindows,
    quiet: summary.quiet,
    idleCpuMedianPercent: summary.idleCpuMedianPercent,
    idleCpuTotalMedianPercent: summary.idleCpuTotalMedianPercent,
    streams: summary.attribution.map((attribution) => ({
      name: attribution.name,
      expectedBytes: attribution.expectedBytes,
      rates: attribution.streams.map((stream) => stream.bytesPerSecond),
      bytes: attribution.streams.map((stream) => stream.bytes),
      peaks: Object.fromEntries(
        ROLES.map((role) => [role, attribution.roles[role].peakBytes]),
      ) as Record<ReportedRole, number | null>,
      retained: Object.fromEntries(
        ROLES.map((role) => [role, attribution.roles[role].retainedBytes]),
      ) as Record<ReportedRole, number | null>,
      cpuPercentOneCore: attribution.totalCpuPercentOneCore,
    })),
    latency: {
      medianMs: summary.inputLatency.medianMs,
      medianCorrectedMs: summary.inputLatency.medianCorrectedMs,
      failures: summary.inputLatency.failures,
      medianGridToDrawMs: summary.inputLatency.medianGridToDrawMs,
    },
  };
}

export function baselineFrom(
  report: BenchmarkReport,
  sourceCommit: string,
  profileKey: string,
): BenchmarkBaseline {
  return {
    schema: PERFORMANCE_BASELINE_SCHEMA,
    profileKey,
    protocol: report.protocol,
    recordedAtUtc: report.recordedAtUtc,
    sourceCommit,
    metric: report.metric,
    machine: report.machine,
    versions: report.versions,
    identity: report.identity,
    measurementControl: report.measurementControl,
    repetitionsRequested:
      report.repetitionsRequested ??
      report.variants[0]?.repetitions.length ??
      0,
    variants: Object.fromEntries(
      report.variants.map((variant) => [
        String(variant.scrollbackLines),
        {
          scrollbackLines: variant.scrollbackLines,
          repetitions: variant.repetitions.map(baselineRepetition),
        },
      ]),
    ),
    scrollbackPair: report.scrollbackPair,
    extensionRuntime: report.extensionRuntime,
  };
}

export function isBaseline(value: unknown): value is BenchmarkBaseline {
  return (
    typeof value === "object" &&
    value !== null &&
    "schema" in value &&
    typeof value.schema === "number" &&
    Number.isSafeInteger(value.schema) &&
    "profileKey" in value &&
    typeof value.profileKey === "string"
  );
}

function optionalObservation(value: unknown): boolean {
  return (
    value === null || (typeof value === "number" && Number.isFinite(value))
  );
}

function nonnegativeObservation(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function nonnegativeSafeByteCount(value: unknown): boolean {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

function cpuObservation(value: unknown, required: boolean): boolean {
  return value === null ? !required : nonnegativeObservation(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const PRIMARY_ROLES = new Set<string>(ROLES);

function stepRoleProblem(value: unknown, required: boolean): boolean {
  if (!isRecord(value)) return true;
  const validObservation = (observation: unknown) =>
    observation === null ? !required : nonnegativeSafeByteCount(observation);
  return (
    !validObservation(value.steadyBytes) || !validObservation(value.peakBytes)
  );
}

function stepRolesProblem(value: unknown): boolean {
  if (!isRecord(value)) return true;
  if (ROLES.some((role) => stepRoleProblem(value[role], true))) return true;
  return Object.entries(value).some(
    ([role, observation]) =>
      !PRIMARY_ROLES.has(role) && stepRoleProblem(observation, false),
  );
}

function cpuRolesProblem(value: unknown, requirePrimary: boolean): boolean {
  if (!isRecord(value)) return true;
  if (ROLES.some((role) => !cpuObservation(value[role], requirePrimary)))
    return true;
  return Object.entries(value).some(
    ([role, observation]) =>
      !PRIMARY_ROLES.has(role) && !cpuObservation(observation, false),
  );
}

function stepProblem(
  repetition: BaselineRepetition,
  addable: boolean,
): string | null {
  for (const [name, tabs] of [
    ["one", 1],
    ["three", 3],
    ["six", 6],
  ] as const) {
    const step = repetition.steps[name];
    if (
      !step ||
      step.tabs !== tabs ||
      stepRolesProblem(step.roles) ||
      (addable
        ? !nonnegativeSafeByteCount(step.totalBytes)
        : step.totalBytes !== null)
    )
      return `incomplete ${name} step`;
  }
  for (const name of ["oneToThree", "threeToSix"] as const) {
    const marginal = repetition.marginal[name];
    if (
      !marginal ||
      !marginal.perTab ||
      ROLES.some((role) => !Number.isFinite(marginal.perTab[role])) ||
      (addable ? !Number.isFinite(marginal.total) : marginal.total !== null)
    )
      return `incomplete ${name} marginal`;
  }
  return null;
}

function streamProblem(
  repetition: BaselineRepetition,
  requireCpu: boolean,
): string | null {
  const names = ["ascii", "variety", "deep-history"];
  if (repetition.streams.length !== names.length)
    return "incorrect stream group count";
  for (const name of names) {
    const stream = repetition.streams.find((entry) => entry?.name === name);
    if (
      !stream ||
      stream.expectedBytes !== streamPayloadBytes() ||
      !Array.isArray(stream.rates) ||
      stream.rates.length !== PERFORMANCE_BENCHMARK.streamRepeats ||
      stream.rates.some(
        (rate: number | null) =>
          rate === null || !Number.isFinite(rate) || rate <= 0,
      ) ||
      !Array.isArray(stream.bytes) ||
      stream.bytes.length !== PERFORMANCE_BENCHMARK.streamRepeats ||
      stream.bytes.some(
        (bytes: number | null) =>
          bytes === null ||
          !Number.isFinite(bytes) ||
          !Number.isSafeInteger(bytes) ||
          bytes < stream.expectedBytes ||
          bytes > stream.expectedBytes + 64,
      ) ||
      !stream.peaks ||
      !stream.retained ||
      !cpuObservation(stream.cpuPercentOneCore, requireCpu) ||
      ROLES.some(
        (role) =>
          !nonnegativeSafeByteCount(stream.peaks[role]) ||
          !Number.isFinite(stream.retained[role]),
      )
    )
      return `incomplete ${name} stream`;
  }
  return null;
}

function idleProblem(
  repetition: BaselineRepetition,
  addable: boolean,
  requireCpu: boolean,
): string | null {
  if (
    repetition.quiet.name !== "sitting-still-after-history" ||
    !repetition.idle.growthBytes ||
    ROLES.some((role) => !Number.isFinite(repetition.idle.growthBytes[role])) ||
    cpuRolesProblem(repetition.idle.cpuPercentOneCore, requireCpu) ||
    cpuRolesProblem(repetition.idleCpuMedianPercent, requireCpu) ||
    (addable && !Number.isFinite(repetition.idle.totalGrowthBytes)) ||
    !cpuObservation(repetition.idleCpuTotalMedianPercent, requireCpu)
  )
    return "incomplete idle observation";
  return null;
}

function windowProblem(
  repetition: BaselineRepetition,
  addable: boolean,
  requireCpu: boolean,
): string | null {
  const expected = [
    "blink-off-focused",
    "blink-off-unfocused",
    "blink-on-focused",
    "blink-on-unfocused",
  ];
  const windows = repetition.idleCpuWindows as readonly WindowSummary[];
  for (const name of expected) {
    const matching = windows.filter((window) => window?.name === name);
    if (matching.length !== 1) return `missing ${name} window`;
  }
  for (const window of [...windows, repetition.quiet]) {
    if (
      !window ||
      typeof window.name !== "string" ||
      !window.growthBytes ||
      !window.applicationMemoryComplete ||
      !window.sampleTimesValid ||
      !Number.isFinite(window.windowMs) ||
      window.windowMs < PERFORMANCE_BENCHMARK.idleCpuWindowMs ||
      !window.quiescenceVerified ||
      (window.name.startsWith("blink-") &&
        (window.documentHasFocus !== !window.name.endsWith("-unfocused") ||
          window.visibilityState !== "visible")) ||
      ROLES.some((role) => !Number.isFinite(window.growthBytes[role])) ||
      cpuRolesProblem(window.cpuPercentOneCore, requireCpu) ||
      (addable && !Number.isFinite(window.totalGrowthBytes)) ||
      !cpuObservation(window.totalCpuPercentOneCore, requireCpu)
    )
      return "incomplete measured window";
  }
  return idleProblem(repetition, addable, requireCpu);
}

function repetitionProblem(
  repetition: BaselineRepetition,
  index: number,
  addable: boolean,
  requireCpu: boolean,
): string | null {
  if (
    !repetition ||
    repetition.index !== index + 1 ||
    !repetition.steps ||
    !repetition.marginal ||
    !repetition.idle ||
    !repetition.latency ||
    !Array.isArray(repetition.streams) ||
    !Array.isArray(repetition.idleCpuWindows) ||
    !repetition.quiet
  )
    return `incomplete repetition ${index + 1}`;
  const problem =
    stepProblem(repetition, addable) ??
    streamProblem(repetition, requireCpu) ??
    windowProblem(repetition, addable, requireCpu);
  if (problem) return problem;
  if (
    !Number.isFinite(repetition.idle.windowMs) ||
    repetition.idle.windowMs < PERFORMANCE_BENCHMARK.idleWindowMs ||
    !repetition.idle.growthBytes ||
    !repetition.idleCpuMedianPercent ||
    !Number.isFinite(repetition.latency.medianMs) ||
    !Number.isFinite(repetition.latency.medianCorrectedMs) ||
    !optionalObservation(repetition.latency.medianGridToDrawMs) ||
    repetition.latency.failures !== 0 ||
    repetition.idleCpuWindows.length !== 4
  )
    return "incomplete windows or input";
  return null;
}

function artifactHashesPresent(
  value: unknown,
  names: readonly string[],
): boolean {
  if (typeof value !== "object" || value === null) return false;
  const hashes = value as Record<string, unknown>;
  return names.every(
    (name) =>
      typeof hashes[name] === "string" &&
      /^[a-f0-9]{64}$/u.test(hashes[name] as string),
  );
}

function versionMetadataPresent(
  versions: BenchmarkBaseline["versions"],
): boolean {
  return (
    !!versions &&
    [versions.electron, versions.chrome, versions.node].every(
      (value) => value === null || typeof value === "string",
    )
  );
}

function metricMetadataPresent(metric: BenchmarkBaseline["metric"]): boolean {
  return (
    !!metric &&
    typeof metric.name === "string" &&
    typeof metric.source === "string" &&
    typeof metric.qualification === "string" &&
    typeof metric.addable === "boolean" &&
    Number.isFinite(metric.sampleIntervalMs) &&
    metric.sampleIntervalMs > 0
  );
}

function measurementMetadataProblem(
  baseline: BenchmarkBaseline,
): string | null {
  if (
    !metricMetadataPresent(baseline.metric) ||
    typeof baseline.protocol !== "string" ||
    typeof baseline.sourceCommit !== "string" ||
    typeof baseline.recordedAtUtc !== "string" ||
    !versionMetadataPresent(baseline.versions) ||
    !baseline.machine ||
    typeof baseline.machine.platform !== "string" ||
    typeof baseline.machine.arch !== "string" ||
    typeof baseline.machine.gpuClass !== "string" ||
    typeof baseline.machine.gpuApi !== "string" ||
    !Number.isSafeInteger(baseline.machine.logicalCpus) ||
    baseline.machine.logicalCpus < 1 ||
    typeof baseline.machine.class !== "string" ||
    typeof baseline.machine.identityHash !== "string" ||
    !baseline.measurementControl ||
    typeof baseline.measurementControl.rendererGcAvailable !== "boolean"
  )
    return "missing metric, machine identity or measurement control";
  return null;
}

function appliedSettingsPresent(
  identity: BenchmarkReport["identity"],
): boolean {
  const applied = identity.applied;
  return (
    !!applied &&
    Number.isFinite(applied.fontSize) &&
    Number.isFinite(applied.fontLineHeight) &&
    typeof applied.fontLigatures === "boolean" &&
    Number.isSafeInteger(applied.scrollbackLines) &&
    (applied.fontFamily === null || typeof applied.fontFamily === "string")
  );
}

function gridMetadataPresent(
  grid: BenchmarkReport["identity"]["grid"],
): boolean {
  return (
    !!grid &&
    typeof grid === "object" &&
    Object.values(grid).length > 0 &&
    Object.values(grid).every(
      (entry) =>
        !!entry &&
        [entry.columns, entry.rows, entry.cellWidth, entry.cellHeight].every(
          (value) => Number.isFinite(value) && value > 0,
        ),
    )
  );
}

function identityProblem(baseline: BenchmarkBaseline): string | null {
  const identity = baseline.identity;
  if (
    !identity ||
    !identity.contentSize ||
    !identity.requestedContentSize ||
    !Number.isFinite(identity.requestedContentSize.width) ||
    !Number.isFinite(identity.requestedContentSize.height) ||
    !gridMetadataPresent(identity.grid) ||
    !Number.isFinite(identity.contentSize.width) ||
    !Number.isFinite(identity.contentSize.height) ||
    typeof identity.settingsSha256 !== "string" ||
    !Number.isFinite(identity.devicePixelRatio)
  )
    return "missing identity or geometry";
  if (
    !appliedSettingsPresent(identity) ||
    !Number.isSafeInteger(identity.settingsLines)
  )
    return "missing applied settings";
  const metadataIssue = measurementMetadataProblem(baseline);
  if (metadataIssue) return metadataIssue;
  if (
    !artifactHashesPresent(identity.build, [
      "main",
      "preload",
      "rendererHtml",
      "rendererCss",
      "rendererBundle",
      "extensionIndex",
      "extensionPackages",
      "extensionBootstrap",
      "extensionLeases",
    ])
  )
    return "missing measured application artifact hashes";
  return null;
}

function runtimeProblem(baseline: BenchmarkBaseline): string | null {
  const runtime = baseline.extensionRuntime;
  if (
    !runtime ||
    !Number.isFinite(runtime.windowMs) ||
    runtime.windowMs <= 0 ||
    !Number.isSafeInteger(runtime.processCount) ||
    runtime.processCount < 1 ||
    !runtime.settled ||
    !nonnegativeSafeByteCount(runtime.steadyBytes) ||
    !Number.isFinite(runtime.growthBytes) ||
    !cpuObservation(
      runtime.cpuPercentOneCore,
      baseline.machine.platform === "linux",
    )
  )
    return "incomplete reference runtime";
  if (
    !artifactHashesPresent(runtime.build, [
      "runtimeIndex",
      "runtimePackages",
      "runtimeBootstrap",
      "runtimeLeases",
    ])
  )
    return "missing reference runtime artifact hashes";
  return null;
}

export function baselinePreflight(
  baseline: BenchmarkBaseline,
  variants: readonly number[],
): string | null {
  if (baseline.schema !== PERFORMANCE_BASELINE_SCHEMA) return null;
  const identityIssue = identityProblem(baseline);
  if (identityIssue) return identityIssue;
  if (
    !Number.isSafeInteger(baseline.repetitionsRequested) ||
    baseline.repetitionsRequested < 1 ||
    !baseline.variants ||
    typeof baseline.variants !== "object"
  )
    return "missing variants or repetition count";
  for (const lines of variants) {
    const variant = baseline.variants[String(lines)];
    if (
      !variant ||
      variant.scrollbackLines !== lines ||
      !Array.isArray(variant.repetitions) ||
      variant.repetitions.length !== baseline.repetitionsRequested
    )
      return `missing variant or repetitions for ${lines} lines`;
    for (const [index, repetition] of (
      variant.repetitions as readonly BaselineRepetition[]
    ).entries()) {
      const problem = repetitionProblem(
        repetition,
        index,
        baseline.metric.addable,
        baseline.machine.platform === "linux",
      );
      if (problem) return `${problem} for ${lines} lines`;
    }
  }
  if (
    !baseline.scrollbackPair ||
    !Array.isArray(baseline.scrollbackPair.deltas) ||
    baseline.scrollbackPair.deltas.length !== baseline.repetitionsRequested ||
    baseline.scrollbackPair.deltas.some(
      (delta: Readonly<Record<ReportedRole, number | null>>) =>
        !delta || ROLES.some((role) => !Number.isFinite(delta[role])),
    )
  )
    return "incomplete scrollback pair";
  return runtimeProblem(baseline);
}

export interface ComparabilityVerdict {
  readonly comparable: boolean;
  readonly reasons: readonly string[];
}

// A comparison is only printed when the two runs measured the same protocol,
// metric, machine class and rendering geometry. This is about whether a
// side-by-side print is meaningful, not about whether either run passes.
export function comparability(
  report: BenchmarkReport,
  baseline: BenchmarkBaseline,
  profileKey: string,
): ComparabilityVerdict {
  const reasons: string[] = [];
  const grid = (identity: BenchmarkReport["identity"]) =>
    JSON.stringify(identity.grid);
  if (baseline.schema !== PERFORMANCE_BASELINE_SCHEMA)
    // An older schema did not record the fields below; stop before reading
    // them and say what the difference is.
    return {
      comparable: false,
      reasons: [
        `baseline schema ${baseline.schema} is not ${PERFORMANCE_BASELINE_SCHEMA}; re-record with --replace`,
      ],
    };
  const problem = baselinePreflight(
    baseline,
    report.variants.map((variant) => variant.scrollbackLines),
  );
  if (problem)
    return { comparable: false, reasons: [`invalid baseline: ${problem}`] };
  if (baseline.profileKey !== profileKey)
    reasons.push(
      `baseline profile ${baseline.profileKey} is not ${profileKey}`,
    );
  if (baseline.protocol !== report.protocol)
    reasons.push(`protocol ${report.protocol} recorded ${baseline.protocol}`);
  if (baseline.metric.name !== report.metric.name)
    reasons.push(
      `metric ${report.metric.name} recorded ${baseline.metric.name}`,
    );
  if (baseline.machine.class !== report.machine.class)
    reasons.push(
      `machine class ${report.machine.class} recorded ${baseline.machine.class}`,
    );
  if (baseline.machine.identityHash !== report.machine.identityHash)
    reasons.push("machine identity differs from the recorded baseline");
  if (baseline.identity.devicePixelRatio !== report.identity.devicePixelRatio)
    reasons.push(
      `pixel ratio ${report.identity.devicePixelRatio} recorded ${baseline.identity.devicePixelRatio}`,
    );
  if (
    baseline.identity.contentSize.width !== report.identity.contentSize.width ||
    baseline.identity.contentSize.height !== report.identity.contentSize.height
  )
    reasons.push(
      `content size ${report.identity.contentSize.width}x${report.identity.contentSize.height} recorded ${baseline.identity.contentSize.width}x${baseline.identity.contentSize.height}`,
    );
  if (grid(baseline.identity) !== grid(report.identity))
    reasons.push("renderer grid differs from the recorded baseline");
  if (baseline.identity.settingsSha256 !== report.identity.settingsSha256)
    reasons.push("settings file differs from the recorded baseline");
  if (
    baseline.measurementControl.rendererGcAvailable !==
    report.measurementControl.rendererGcAvailable
  )
    reasons.push(
      `renderer garbage collection ${report.measurementControl.rendererGcAvailable ? "available" : "unavailable"} recorded ${baseline.measurementControl.rendererGcAvailable ? "available" : "unavailable"}`,
    );
  return { comparable: reasons.length === 0, reasons };
}

// Recording is how a reference is created, so it refuses anything that would
// make the reference a lie: an uncommitted tree (the source is part of the
// record) and a run with blocking integrity issues.
export function recordingRefusal(input: {
  readonly cleanTree: boolean;
  readonly blockingIssueCodes: readonly string[];
  readonly baselineExists: boolean;
  readonly replace: boolean;
}): string | null {
  if (!input.cleanTree)
    return "commit tracked changes first: the baseline records the measured source";
  if (input.blockingIssueCodes.length > 0)
    return `the run is not a valid observation: ${input.blockingIssueCodes.join(", ")}`;
  if (input.baselineExists && !input.replace)
    return "an existing baseline requires --replace";
  return null;
}

export type ComparisonUnit = "MiB" | "KiB/s" | "ms" | "%";

export interface ComparisonRow {
  readonly family: string;
  readonly scenario: string;
  readonly unit: ComparisonUnit;
  readonly candidateRepetitions: readonly (number | null)[];
  readonly candidateMedian: number | null;
  readonly baselineRepetitions: readonly (number | null)[];
  readonly baselineMedian: number | null;
  readonly deltaPercent: number | null;
  readonly streamCounts?: {
    readonly candidate: readonly string[];
    readonly baseline: readonly string[];
  };
}

const toMiB = (bytes: number | null | undefined): number | null =>
  bytes === null || bytes === undefined ? null : bytes / 1024 / 1024;

const toKiBps = (bytesPerSecond: number | null | undefined): number | null =>
  bytesPerSecond === null || bytesPerSecond === undefined
    ? null
    : bytesPerSecond / 1024;

function present(values: readonly (number | null)[]): number[] {
  return values.filter((value): value is number => value !== null);
}

function row(
  family: string,
  scenario: string,
  unit: ComparisonUnit,
  candidateRepetitions: readonly (number | null)[],
  baselineRepetitions: readonly (number | null)[],
  streamCounts?: ComparisonRow["streamCounts"],
): ComparisonRow {
  const candidate = present(candidateRepetitions);
  const recorded = present(baselineRepetitions);
  const candidateMedian =
    candidate.length === 0 || candidate.length !== candidateRepetitions.length
      ? null
      : median(candidate);
  const baselineMedian =
    recorded.length === 0 || recorded.length !== baselineRepetitions.length
      ? null
      : median(recorded);
  return {
    family,
    scenario,
    unit,
    candidateRepetitions,
    candidateMedian,
    baselineRepetitions,
    baselineMedian,
    ...(streamCounts ? { streamCounts } : {}),
    deltaPercent:
      candidateMedian === null ||
      baselineMedian === null ||
      baselineMedian === 0
        ? null
        : ((candidateMedian - baselineMedian) / baselineMedian) * 100,
  };
}

function variantOf(
  baseline: BenchmarkBaseline,
  scrollbackLines: number,
): readonly BaselineRepetition[] | undefined {
  return baseline.variants[String(scrollbackLines)]?.repetitions;
}

function stepBytes(
  repetitions: readonly BaselineRepetition[],
  step: string,
  field: "steadyBytes" | "peakBytes",
  role: string,
): (number | null)[] {
  return repetitions.map(
    (repetition) => repetition.steps[step]?.roles[role]?.[field] ?? null,
  );
}

function variantComparisonRows(
  variant: BenchmarkReport["variants"][number],
  recorded: readonly BaselineRepetition[],
): ComparisonRow[] {
  const rows: ComparisonRow[] = [];
  {
    const label = `${variant.scrollbackLines} lines`;
    const candidate = variant.repetitions;
    for (const step of ["one", "three", "six"]) {
      for (const role of ROLES) {
        rows.push(
          row(
            "step steady",
            `${label} / ${step} / ${role}`,
            "MiB",
            candidate.map((repetition) =>
              toMiB(
                repetition.steps.find((entry) => entry.name === step)?.roles[
                  role
                ]?.steadyBytes,
              ),
            ),
            stepBytes(recorded, step, "steadyBytes", role).map(toMiB),
          ),
        );
        rows.push(
          row(
            "step peak",
            `${label} / ${step} / ${role}`,
            "MiB",
            candidate.map((repetition) =>
              toMiB(
                repetition.steps.find((entry) => entry.name === step)?.roles[
                  role
                ]?.peakBytes,
              ),
            ),
            stepBytes(recorded, step, "peakBytes", role).map(toMiB),
          ),
        );
      }
      rows.push(
        row(
          "step total",
          `${label} / ${step}`,
          "MiB",
          candidate.map((repetition) =>
            toMiB(
              repetition.steps.find((entry) => entry.name === step)?.totalBytes,
            ),
          ),
          recorded.map((repetition) =>
            toMiB(repetition.steps[step]?.totalBytes),
          ),
        ),
      );
    }
    for (const window of ["oneToThree", "threeToSix"] as const) {
      for (const role of ROLES)
        rows.push(
          row(
            "per-tab marginal",
            `${label} / ${window} / ${role}`,
            "MiB",
            candidate.map((repetition) =>
              toMiB(repetition.marginal[window].perTab[role]),
            ),
            recorded.map((repetition) =>
              toMiB(repetition.marginal[window].perTab[role]),
            ),
          ),
        );
      rows.push(
        row(
          "per-tab marginal total",
          `${label} / ${window}`,
          "MiB",
          candidate.map((repetition) =>
            toMiB(repetition.marginal[window].total),
          ),
          recorded.map((repetition) =>
            toMiB(repetition.marginal[window].total),
          ),
        ),
      );
    }
    for (const role of ROLES)
      rows.push(
        row(
          "idle growth",
          `${label} / ${role}`,
          "MiB",
          candidate.map((repetition) =>
            toMiB(repetition.idle.growthBytes[role]),
          ),
          recorded.map((repetition) =>
            toMiB(repetition.idle.growthBytes[role]),
          ),
        ),
      );
    rows.push(
      row(
        "idle growth total",
        label,
        "MiB",
        candidate.map((repetition) => toMiB(repetition.idle.totalGrowthBytes)),
        recorded.map((repetition) => toMiB(repetition.idle.totalGrowthBytes)),
      ),
    );
    for (const role of ROLES)
      rows.push(
        row(
          "idle CPU",
          `${label} / ${role}`,
          "%",
          candidate.map(
            (repetition) => repetition.idleCpuMedianPercent[role] ?? null,
          ),
          recorded.map(
            (repetition) => repetition.idleCpuMedianPercent[role] ?? null,
          ),
        ),
      );
    rows.push(
      row(
        "idle CPU total",
        label,
        "%",
        candidate.map((repetition) => repetition.idleCpuTotalMedianPercent),
        recorded.map((repetition) => repetition.idleCpuTotalMedianPercent),
      ),
    );
    for (const stream of ["ascii", "variety", "deep-history"]) {
      const candidateRates = candidate.map((repetition) =>
        (
          repetition.attribution.find((entry) => entry.name === stream)
            ?.streams ?? []
        ).map((entry) => entry.bytesPerSecond),
      );
      const recordedRates = recorded.map(
        (repetition) =>
          repetition.streams.find((entry) => entry.name === stream)?.rates ??
          [],
      );
      const rate = (values: readonly (number | null)[]) => {
        const valid = present(values).filter(Number.isFinite);
        return values.length === PERFORMANCE_BENCHMARK.streamRepeats &&
          valid.length === values.length
          ? toKiBps(median(valid))
          : null;
      };
      const counts = (values: readonly (number | null)[]) =>
        `${present(values).filter(Number.isFinite).length}/${PERFORMANCE_BENCHMARK.streamRepeats}`;
      rows.push(
        row(
          "stream rate",
          `${label} / ${stream}`,
          "KiB/s",
          candidateRates.map(rate),
          recordedRates.map(rate),
          {
            candidate: candidateRates.map(counts),
            baseline: recordedRates.map(counts),
          },
        ),
      );
      for (const role of ROLES) {
        rows.push(
          row(
            "stream peak",
            `${label} / ${stream} / ${role}`,
            "MiB",
            candidate.map((repetition) =>
              toMiB(
                repetition.attribution.find((entry) => entry.name === stream)
                  ?.roles[role].peakBytes,
              ),
            ),
            recorded.map((repetition) =>
              toMiB(
                repetition.streams.find((entry) => entry.name === stream)
                  ?.peaks[role],
              ),
            ),
          ),
        );
        rows.push(
          row(
            "stream retained",
            `${label} / ${stream} / ${role}`,
            "MiB",
            candidate.map((repetition) =>
              toMiB(
                repetition.attribution.find((entry) => entry.name === stream)
                  ?.roles[role].retainedBytes,
              ),
            ),
            recorded.map((repetition) =>
              toMiB(
                repetition.streams.find((entry) => entry.name === stream)
                  ?.retained[role],
              ),
            ),
          ),
        );
      }
    }
    rows.push(
      row(
        "input latency raw",
        label,
        "ms",
        candidate.map((repetition) => repetition.inputLatency.medianMs),
        recorded.map((repetition) => repetition.latency.medianMs),
      ),
      row(
        "input latency corrected",
        label,
        "ms",
        candidate.map(
          (repetition) => repetition.inputLatency.medianCorrectedMs,
        ),
        recorded.map((repetition) => repetition.latency.medianCorrectedMs),
      ),
      row(
        "grid change to next counted draw",
        label,
        "ms",
        candidate.map(
          (repetition) => repetition.inputLatency.medianGridToDrawMs,
        ),
        recorded.map((repetition) => repetition.latency.medianGridToDrawMs),
      ),
    );
  }
  return rows;
}

// Retained aggregate families, printed next to the matching baseline values.
// Individual idle CPU and post-history windows remain in the baseline and run
// summary, but do not have individual comparison rows. No limit is applied.
export function comparisonRows(
  report: BenchmarkReport,
  baseline: BenchmarkBaseline,
): ComparisonRow[] {
  const rows: ComparisonRow[] = [];
  for (const variant of report.variants) {
    const recorded = variantOf(baseline, variant.scrollbackLines);
    if (recorded === undefined) continue;
    rows.push(...variantComparisonRows(variant, recorded));
  }
  if (report.scrollbackPair && baseline.scrollbackPair) {
    for (const role of ROLES)
      rows.push(
        row(
          "scrollback pair delta",
          `${report.scrollbackPair.emptyLines} vs ${report.scrollbackPair.fullLines} lines / ${role}`,
          "MiB",
          report.scrollbackPair.deltas.map((delta) => toMiB(delta[role])),
          baseline.scrollbackPair.deltas.map((delta) => toMiB(delta[role])),
        ),
      );
  }
  if (report.extensionRuntime && baseline.extensionRuntime) {
    rows.push(
      row(
        "extension runtime steady",
        "bootstrap",
        "MiB",
        [toMiB(report.extensionRuntime.steadyBytes)],
        [toMiB(baseline.extensionRuntime.steadyBytes)],
      ),
      row(
        "extension runtime growth",
        "bootstrap",
        "MiB",
        [toMiB(report.extensionRuntime.growthBytes)],
        [toMiB(baseline.extensionRuntime.growthBytes)],
      ),
      row(
        "extension runtime CPU",
        "bootstrap",
        "%",
        [report.extensionRuntime.cpuPercentOneCore],
        [baseline.extensionRuntime.cpuPercentOneCore],
      ),
    );
  }
  return rows;
}
