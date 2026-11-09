import type {
  MachineIdentity,
  MemoryMetric,
} from "./performance-benchmark-memory";
import { machineIdentity, memoryMetric } from "./performance-benchmark-memory";
import { PERFORMANCE_BENCHMARK } from "./performance-benchmark-workload";

// The report measures and prints. It carries no threshold, no verdict and no
// derived status: every number is either an observation of this run or the
// matching observation from the recorded baseline for the same profile.
export const PERFORMANCE_BENCHMARK_SCHEMA = 5;
export const MEBIBYTE = 1024 * 1024;

export type ReportedRole = "main" | "renderer" | "gpu";
export const REPORTED_ROLES = [
  "main",
  "renderer",
  "gpu",
  "utility",
  "extension-runtime",
  "shell",
  "other",
] as const;
export const ROLES: readonly ReportedRole[] = ["main", "renderer", "gpu"];
const APPLICATION_ROLES = [
  "main",
  "renderer",
  "gpu",
  "utility",
  "extension-runtime",
] as const;

export interface BenchmarkProfile {
  readonly key: string;
  readonly platform: string;
  readonly arch: string;
  readonly metric: MemoryMetric;
  readonly baselineFile: string;
}

const PROFILE_TABLE: readonly BenchmarkProfile[] = [
  {
    key: "linux-arm64",
    platform: "linux",
    arch: "arm64",
    metric: memoryMetric("linux"),
    baselineFile: "baseline.linux-arm64.json",
  },
  {
    key: "linux-x64",
    platform: "linux",
    arch: "x64",
    metric: memoryMetric("linux"),
    baselineFile: "baseline.linux-x64.json",
  },
  {
    key: "darwin-arm64",
    platform: "darwin",
    arch: "arm64",
    metric: memoryMetric("darwin"),
    baselineFile: "baseline.darwin-arm64.json",
  },
  {
    key: "win32-arm64",
    platform: "win32",
    arch: "arm64",
    metric: memoryMetric("win32"),
    baselineFile: "baseline.win32-arm64.json",
  },
  {
    key: "win32-x64",
    platform: "win32",
    arch: "x64",
    metric: memoryMetric("win32"),
    baselineFile: "baseline.win32-x64.json",
  },
];

export const PERFORMANCE_BENCHMARK_PROFILES: Readonly<
  Record<string, BenchmarkProfile>
> = Object.freeze(
  Object.fromEntries(PROFILE_TABLE.map((profile) => [profile.key, profile])),
);

export function profileFor(platform: string, arch: string): BenchmarkProfile {
  const known = PROFILE_TABLE.find(
    (profile) => profile.platform === platform && profile.arch === arch,
  );
  return (
    known ?? {
      key: `${platform}-${arch}`,
      platform,
      arch,
      metric: memoryMetric(platform as NodeJS.Platform),
      baselineFile: `baseline.${platform}-${arch}.json`,
    }
  );
}

interface RawReading {
  readonly pid: number;
  readonly role: string;
  readonly bytes: number | null;
  readonly workingSetKiB: number | null;
  readonly cpuSeconds: number | null;
}

interface RawSample {
  readonly atMs: number;
  readonly readings: readonly RawReading[];
  readonly mainProcessMemory: Readonly<Record<string, number>>;
}

interface RawQuiescence {
  readonly windowMs: number;
  readonly scope: "sampled-window" | "before-sampling";
  readonly draws: number;
  readonly gridChanged: boolean;
  readonly outputBytes: number;
  readonly verified: boolean;
}

interface RawWindow {
  readonly name: string;
  readonly windowMs: number;
  readonly samples: readonly RawSample[];
  readonly quiescence: RawQuiescence;
  readonly documentHasFocus: boolean;
  readonly visibilityState: string;
  readonly drawsDelta: number;
  readonly observerCostMs: number;
}

interface RawFrame {
  readonly tabIndex: number;
  readonly visible: boolean;
  readonly columns: number;
  readonly rows: number;
  readonly cellWidth: number;
  readonly cellHeight: number;
}

interface RawStep {
  readonly name: string;
  readonly tabs: number;
  readonly durationMs: number;
  readonly memorySettleMs: number;
  readonly samples: readonly RawSample[];
  readonly frames: readonly RawFrame[];
  readonly outputBytes: readonly number[];
  readonly quiescence: RawQuiescence;
}

interface RawStream {
  readonly elapsedMs: number;
  readonly found: boolean;
  readonly bytes: number;
  readonly overheadBytes: number;
  readonly pollCostMs?: number;
  readonly drawsBefore?: number;
  readonly drawsAtFound?: number;
}

interface RawAttribution {
  readonly name: string;
  readonly token: string;
  readonly command: string;
  readonly paintedDuringStream: boolean;
  readonly expectedBytes: number;
  readonly streams?: readonly RawStream[];
  readonly pollCostMs: number;
  readonly before: readonly RawSample[];
  readonly samples: readonly RawSample[];
  readonly streamEnds?: readonly RawSample[];
  readonly after: readonly RawSample[];
  readonly settle: RawQuiescence;
}

interface RawInput {
  readonly keydownAtMs: number | null;
  readonly gridChangedAtMs: number | null;
  readonly gridToDrawMs: number | null;
  readonly pollCostMs: number;
  readonly error: string | null;
}

interface FixtureReceipt {
  readonly reason: string;
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly cleanupErrors: readonly string[];
  readonly cleanupAssistance: "none" | "attempted" | "unknown" | undefined;
}

export interface RawBenchmarkRun {
  readonly supervisor?: FixtureReceipt;
  readonly protocol: string;
  readonly variant: { readonly scrollbackLines: number };
  readonly metric: MemoryMetric;
  readonly environment: {
    readonly platform: string;
    readonly arch: string;
    readonly release: string;
    readonly versions: Readonly<Record<string, string>>;
    readonly cpuModel: string | null;
    readonly logicalCpus: number;
    readonly totalMemoryBytes: number;
    readonly webglRenderer: string | null;
  };
  readonly build: Readonly<Record<string, string>>;
  readonly measurementControl?: {
    readonly rendererGcAvailable: boolean;
  };
  readonly identity: {
    readonly contentSize: {
      readonly x: number;
      readonly y: number;
      readonly width: number;
      readonly height: number;
    };
    readonly requestedContentSize: {
      readonly width: number;
      readonly height: number;
    };
    readonly devicePixelRatio: number;
    readonly settings: { readonly lines: number; readonly sha256: string };
    readonly applied: {
      readonly fontSize: number;
      readonly fontLineHeight: number;
      readonly fontLigatures: boolean;
      readonly fontFamily: string | null;
      readonly scrollbackLines: number;
    } | null;
  };
  readonly grids: ReadonlyArray<{
    readonly tab: number;
    readonly columns: number;
    readonly rows: number;
    readonly cellWidth: number;
    readonly cellHeight: number;
  }>;
  readonly steps: readonly RawStep[];
  readonly idle: RawWindow;
  readonly idleCpu: readonly RawWindow[];
  readonly attribution: readonly RawAttribution[];
  readonly quiet: RawWindow;
  readonly input: readonly RawInput[];
}

export interface RawRuntimeRun {
  readonly supervisor?: FixtureReceipt;
  readonly metric: MemoryMetric;
  readonly build?: Readonly<Record<string, string>>;
  readonly windowMs: number;
  readonly processCount: number;
  readonly samples: ReadonlyArray<{
    readonly atMs: number;
    readonly processes: ReadonlyArray<{
      readonly pid: number;
      readonly bytes: number | null;
      readonly cpuSeconds: number | null;
    }>;
  }>;
  readonly settled: boolean;
}

/** One role's memory at one point of one repetition. */
export interface RoleMemorySummary {
  readonly steadyBytes: number | null;
  readonly peakBytes: number | null;
}

export interface StepSummary {
  readonly name: string;
  readonly tabs: number;
  readonly grid: {
    readonly columns: number;
    readonly rows: number;
    readonly cellWidth: number;
    readonly cellHeight: number;
  } | null;
  readonly roles: Readonly<Record<string, RoleMemorySummary>>;
  readonly totalBytes: number | null;
  readonly sampleCount: number;
  readonly sampleTimesValid: boolean;
  readonly applicationMemoryComplete: boolean;
  readonly rendererProcesses: number;
  readonly mainProcesses: number;
  readonly gpuProcesses: number;
  readonly rendererPidStable: boolean;
  readonly quiescenceVerified: boolean;
  readonly quiescenceScope: RawQuiescence["scope"];
  readonly memorySettleMs: number;
}

export interface MarginalSummary {
  readonly perTab: Readonly<Record<ReportedRole, number | null>>;
  readonly total: number | null;
}

export interface WindowSummary {
  readonly name: string;
  readonly windowMs: number;
  readonly sampleTimesValid: boolean;
  readonly applicationMemoryComplete: boolean;
  readonly growthBytes: Readonly<Record<string, number | null>>;
  readonly totalGrowthBytes: number | null;
  /** Median of the per-role CPU across this repetition's windows. */
  readonly cpuPercentOneCore: Readonly<Record<string, number | null>>;
  readonly totalCpuPercentOneCore: number | null;
  readonly draws: number;
  readonly quiescenceVerified: boolean;
  readonly quiescenceScope: RawQuiescence["scope"];
  readonly observerCostMs: number;
  readonly documentHasFocus: boolean;
  readonly visibilityState: string;
}

export interface StreamSummary {
  readonly elapsedMs: number | null;
  readonly found: boolean;
  readonly bytes: number | null;
  readonly expectedBytes: number;
  readonly overheadBytes: number | null;
  readonly bytesPerSecond: number | null;
  readonly pollCostMs: number | null;
  readonly drawsBefore: number | null;
  readonly drawsAtFound: number | null;
}

export interface AttributionSummary {
  readonly name: string;
  readonly command: string;
  readonly expectedBytes: number;
  readonly paintedDuringStream: boolean;
  /** Every repeated stream of this payload, in order. */
  readonly streams: readonly StreamSummary[];
  readonly pollCostMs: number;
  readonly afterSampleCount: number;
  readonly endpointCount: number;
  readonly sampleTimesValid: boolean;
  readonly groupWindowMs: number;
  readonly applicationMemoryComplete: boolean;
  readonly roles: Readonly<
    Record<
      ReportedRole,
      {
        readonly beforeBytes: number | null;
        readonly peakBytes: number | null;
        readonly afterBytes: number | null;
        readonly retainedBytes: number | null;
      }
    >
  >;
  readonly totalCpuPercentOneCore: number | null;
  readonly settleVerified: boolean;
}

export interface InputLatencySummary {
  readonly samplesMs: readonly number[];
  /** Observer-corrected samples: raw minus the export cost it accumulated. */
  readonly correctedSamplesMs: readonly number[];
  readonly failures: number;
  readonly medianMs: number | null;
  readonly minMs: number | null;
  readonly maxMs: number | null;
  readonly medianCorrectedMs: number | null;
  // Recorded evidence, not claimed as presentation latency.
  readonly medianGridToDrawMs: number | null;
  readonly pollCostMedianMs: number | null;
}

/** Every family this fixture measured in one repetition. */
export interface RepetitionSummary {
  readonly index: number;
  readonly steps: readonly StepSummary[];
  readonly marginal: {
    readonly oneToThree: MarginalSummary;
    readonly threeToSix: MarginalSummary;
  };
  readonly idle: WindowSummary;
  readonly idleCpuWindows: readonly WindowSummary[];
  readonly idleCpuMedianPercent: Readonly<Record<string, number | null>>;
  readonly idleCpuTotalMedianPercent: number | null;
  readonly attribution: readonly AttributionSummary[];
  readonly quiet: WindowSummary;
  readonly inputLatency: InputLatencySummary;
}

export interface VariantSummary {
  readonly scrollbackLines: number;
  readonly settingsSha256: string;
  readonly appliedScrollbackLines: number | null;
  readonly repetitions: readonly RepetitionSummary[];
}

export interface ExtensionRuntimeSummary {
  readonly build: Readonly<Record<string, string>>;
  readonly windowMs: number;
  readonly processCount: number;
  readonly steadyBytes: number | null;
  readonly growthBytes: number | null;
  readonly cpuPercentOneCore: number | null;
  readonly settled: boolean;
}

export interface BenchmarkReport {
  readonly schema: number;
  readonly protocol: string;
  readonly recordedAtUtc: string;
  readonly metric: MemoryMetric;
  readonly machine: MachineIdentity;
  readonly versions: {
    readonly electron: string | null;
    readonly chrome: string | null;
    readonly node: string | null;
  };
  readonly identity: {
    readonly contentSize: { readonly width: number; readonly height: number };
    readonly requestedContentSize: {
      readonly width: number;
      readonly height: number;
    };
    readonly devicePixelRatio: number;
    readonly grid: Readonly<
      Record<
        string,
        { columns: number; rows: number; cellWidth: number; cellHeight: number }
      >
    >;
    readonly settingsSha256: string;
    readonly settingsLines: number;
    readonly applied: RawBenchmarkRun["identity"]["applied"];
    readonly build: Readonly<Record<string, string>>;
  };
  readonly variants: readonly VariantSummary[];
  readonly scrollbackPair: {
    readonly emptyLines: number;
    readonly fullLines: number;
    readonly deltas: ReadonlyArray<
      Readonly<Record<ReportedRole, number | null>>
    >;
  } | null;
  readonly extensionRuntime: ExtensionRuntimeSummary | null;
  readonly repetitionsRequested?: number;
  readonly determinism: {
    readonly gridStable: boolean;
    readonly settingsApplied: boolean;
    readonly quiescenceVerified: boolean;
  };
  readonly measurementControl: {
    readonly rendererGcAvailable: boolean;
  };
}

export function median(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1]! + sorted[middle]!) / 2
    : sorted[middle]!;
}

function roleBytes(
  sample: RawSample,
  role: string,
  addable: boolean,
): number | null {
  const readings = sample.readings.filter((reading) => reading.role === role);
  if (
    readings.length === 0 ||
    (!addable && readings.length > 1) ||
    readings.some(
      (reading) => reading.bytes === null || !Number.isFinite(reading.bytes),
    )
  )
    return null;
  return readings.reduce((total, reading) => total + reading.bytes!, 0);
}

function roleCount(sample: RawSample, role: string): number {
  return sample.readings.filter(
    (reading) => reading.role === role && reading.bytes !== null,
  ).length;
}

function rolePids(sample: RawSample, role: string): number[] {
  return sample.readings
    .filter((reading) => reading.role === role && reading.bytes !== null)
    .map((reading) => reading.pid)
    .sort((a, b) => a - b);
}

function roleCpu(sample: RawSample, role: string): number | null {
  const readings = sample.readings.filter((reading) => reading.role === role);
  if (
    readings.length === 0 ||
    readings.some(
      (reading) =>
        reading.cpuSeconds === null || !Number.isFinite(reading.cpuSeconds),
    )
  )
    return null;
  return readings.reduce((total, reading) => total + reading.cpuSeconds!, 0);
}

// Only the application processes the issue asks about; fixture shells and short
// lived helpers stay in their own rows and never enter the total.
function applicationMemoryComplete(
  samples: readonly RawSample[],
  addable: boolean,
): boolean {
  return samples.every(
    (sample) =>
      (addable ||
        APPLICATION_ROLES.every(
          (role) =>
            sample.readings.filter((reading) => reading.role === role).length <=
            1,
        )) &&
      sample.readings.every(
        (reading) =>
          !APPLICATION_ROLES.some((role) => role === reading.role) ||
          (reading.bytes !== null && Number.isFinite(reading.bytes)),
      ),
  );
}

function applicationTotal(sample: RawSample, addable: boolean): number | null {
  if (!addable) return null;
  const presentRoles = APPLICATION_ROLES.filter((role) =>
    sample.readings.some((reading) => reading.role === role),
  );
  const values = presentRoles.map((role) => roleBytes(sample, role, addable));
  if (values.some((value) => value === null)) return null;
  const complete = values as number[];
  return complete.length === 0
    ? null
    : complete.reduce((total, value) => total + value, 0);
}

function totalCpu(sample: RawSample): number | null {
  const readings = sample.readings.filter((reading) =>
    APPLICATION_ROLES.some((role) => role === reading.role),
  );
  if (
    readings.length === 0 ||
    readings.some(
      (reading) =>
        reading.cpuSeconds === null || !Number.isFinite(reading.cpuSeconds),
    )
  )
    return null;
  return readings.reduce((total, reading) => total + reading.cpuSeconds!, 0);
}

// The retained floor of the settled samples: garbage collection inflates
// individual reads, and retained memory is the lowest state the process settles
// into.
function steady(
  samples: readonly RawSample[],
  role: string,
  addable: boolean,
): number | null {
  const values = samples.map((sample) => roleBytes(sample, role, addable));
  return values.length === 0 || values.some((value) => value === null)
    ? null
    : Math.min(...(values as number[]));
}

function peak(
  samples: readonly RawSample[],
  role: string,
  addable: boolean,
): number | null {
  const values = samples.map((sample) => roleBytes(sample, role, addable));
  return values.length === 0 || values.some((value) => value === null)
    ? null
    : Math.max(...(values as number[]));
}

function sampleTimesValid(
  samples: readonly RawSample[],
  minimumSpanMs = 0,
): boolean {
  return (
    samples.length >= 2 &&
    samples.at(-1)!.atMs - samples[0]!.atMs >= minimumSpanMs &&
    samples.every(
      (sample, index) =>
        Number.isFinite(sample.atMs) &&
        (index === 0 || sample.atMs > samples[index - 1]!.atMs),
    )
  );
}

function settledSamplesValid(samples: readonly RawSample[]): boolean {
  return (
    samples.length === PERFORMANCE_BENCHMARK.settleSamples &&
    sampleTimesValid(
      samples,
      (PERFORMANCE_BENCHMARK.settleSamples - 1) *
        PERFORMANCE_BENCHMARK.settleIntervalMs,
    ) &&
    samples.every(
      (sample, index) =>
        index === 0 ||
        sample.atMs - samples[index - 1]!.atMs >=
          PERFORMANCE_BENCHMARK.settleIntervalMs,
    )
  );
}

function stepSummary(step: RawStep, addable: boolean): StepSummary {
  const sampleComplete = settledSamplesValid(step.samples);
  const roles: Record<string, RoleMemorySummary> = {};
  for (const role of REPORTED_ROLES)
    roles[role] = {
      steadyBytes: sampleComplete ? steady(step.samples, role, addable) : null,
      peakBytes: sampleComplete ? peak(step.samples, role, addable) : null,
    };
  const visible = step.frames.find((frame) => frame.visible);
  const rendererPidSets = step.samples.map((sample) =>
    rolePids(sample, "renderer").join(","),
  );
  const totals = step.samples.map((entry) => applicationTotal(entry, addable));
  return {
    name: step.name,
    tabs: step.tabs,
    grid: visible
      ? {
          columns: visible.columns,
          rows: visible.rows,
          cellWidth: visible.cellWidth,
          cellHeight: visible.cellHeight,
        }
      : null,
    roles,
    // Same basis as the per-role values: the retained floor of the total.
    totalBytes:
      !sampleComplete || totals.some((value) => value === null)
        ? null
        : Math.min(...(totals as number[])),
    sampleCount: step.samples.length,
    sampleTimesValid: sampleComplete,
    applicationMemoryComplete: applicationMemoryComplete(step.samples, addable),
    rendererProcesses: step.samples[0]
      ? roleCount(step.samples[0], "renderer")
      : 0,
    mainProcesses: step.samples[0] ? roleCount(step.samples[0], "main") : 0,
    gpuProcesses: step.samples[0] ? roleCount(step.samples[0], "gpu") : 0,
    rendererPidStable: new Set(rendererPidSets).size === 1,
    quiescenceVerified: step.quiescence.verified,
    quiescenceScope: step.quiescence.scope,
    memorySettleMs: step.memorySettleMs,
  };
}

function marginalSummary(
  from: StepSummary | undefined,
  to: StepSummary | undefined,
  divisor: number,
): MarginalSummary {
  const perTab: Record<ReportedRole, number | null> = {
    main: null,
    renderer: null,
    gpu: null,
  };
  for (const role of ROLES) {
    const start = from?.roles[role]?.steadyBytes ?? null;
    const end = to?.roles[role]?.steadyBytes ?? null;
    perTab[role] =
      start === null || end === null ? null : (end - start) / divisor;
  }
  const startTotal = from?.totalBytes ?? null;
  const endTotal = to?.totalBytes ?? null;
  return {
    perTab,
    total:
      startTotal === null || endTotal === null
        ? null
        : (endTotal - startTotal) / divisor,
  };
}

// Growth is the exact endpoint delta across the window the samples span. The
// window length is printed with it: a 12-second window cannot resolve a slower
// leak, and the report says so.
function idleSummary(
  window: RawWindow,
  addable: boolean,
  minimumSpanMs: number = PERFORMANCE_BENCHMARK.idleCpuWindowMs,
): WindowSummary {
  const empty: RawSample = { atMs: 0, readings: [], mainProcessMemory: {} };
  const before = window.samples[0] ?? empty;
  const after = window.samples.at(-1) ?? empty;
  const elapsedMs = after.atMs - before.atMs;
  const timesValid = sampleTimesValid(window.samples, minimumSpanMs);
  const growthBytes: Record<string, number | null> = {};
  const cpuPercentOneCore: Record<string, number | null> = {};
  for (const role of REPORTED_ROLES) {
    const start = roleBytes(before, role, addable);
    const end = roleBytes(after, role, addable);
    growthBytes[role] =
      !timesValid || start === null || end === null ? null : end - start;
    const startCpu = roleCpu(before, role);
    const endCpu = roleCpu(after, role);
    cpuPercentOneCore[role] =
      !timesValid || startCpu === null || endCpu === null || elapsedMs <= 0
        ? null
        : (100 * (endCpu - startCpu)) / (elapsedMs / 1000);
  }
  const startCpu = totalCpu(before);
  const endCpu = totalCpu(after);
  const startApplication = applicationTotal(before, addable);
  const endApplication = applicationTotal(after, addable);
  return {
    name: window.name,
    windowMs: elapsedMs,
    sampleTimesValid: timesValid,
    applicationMemoryComplete: applicationMemoryComplete(
      window.samples,
      addable,
    ),
    growthBytes,
    totalGrowthBytes:
      !timesValid || startApplication === null || endApplication === null
        ? null
        : endApplication - startApplication,
    cpuPercentOneCore,
    totalCpuPercentOneCore:
      !timesValid || startCpu === null || endCpu === null || elapsedMs <= 0
        ? null
        : (100 * (endCpu - startCpu)) / (elapsedMs / 1000),
    draws: window.drawsDelta,
    quiescenceVerified: window.quiescence.verified,
    quiescenceScope: window.quiescence.scope,
    observerCostMs: window.observerCostMs,
    documentHasFocus: window.documentHasFocus,
    visibilityState: window.visibilityState,
  };
}

function streamSummary(
  stream: RawStream | undefined,
  expectedBytes: number,
): StreamSummary {
  if (stream === undefined)
    return {
      elapsedMs: null,
      found: false,
      bytes: null,
      expectedBytes,
      overheadBytes: null,
      bytesPerSecond: null,
      pollCostMs: null,
      drawsBefore: null,
      drawsAtFound: null,
    };
  return {
    elapsedMs: stream.elapsedMs,
    found: stream.found,
    bytes: stream.bytes,
    expectedBytes,
    overheadBytes: stream.overheadBytes,
    pollCostMs: stream.pollCostMs ?? null,
    drawsBefore: stream.drawsBefore ?? null,
    drawsAtFound: stream.drawsAtFound ?? null,
    bytesPerSecond:
      stream.found &&
      Number.isFinite(stream.bytes) &&
      Number.isFinite(stream.elapsedMs) &&
      stream.elapsedMs > 0 &&
      stream.bytes >= expectedBytes &&
      stream.bytes <= expectedBytes + 64
        ? (stream.bytes / stream.elapsedMs) * 1000
        : null,
  };
}

function attributionSummary(
  run: RawAttribution,
  addable: boolean,
): AttributionSummary {
  const before = run.before.at(-1) ?? {
    atMs: 0,
    readings: [],
    mainProcessMemory: {},
  };
  const endpoints = run.streamEnds ?? [];
  const final = endpoints.at(-1) ?? {
    atMs: 0,
    readings: [],
    mainProcessMemory: {},
  };
  const roles: Record<ReportedRole, AttributionSummary["roles"][ReportedRole]> =
    {
      main: {
        beforeBytes: null,
        peakBytes: null,
        afterBytes: null,
        retainedBytes: null,
      },
      renderer: {
        beforeBytes: null,
        peakBytes: null,
        afterBytes: null,
        retainedBytes: null,
      },
      gpu: {
        beforeBytes: null,
        peakBytes: null,
        afterBytes: null,
        retainedBytes: null,
      },
    };
  const timesValid =
    run.before.length > 0 &&
    run.before.every(
      (sample, index) =>
        Number.isFinite(sample.atMs) &&
        (index === 0 || sample.atMs > run.before[index - 1]!.atMs),
    ) &&
    sampleTimesValid(endpoints) &&
    endpoints[0]!.atMs > before.atMs &&
    run.samples.every(
      (sample, index) =>
        Number.isFinite(sample.atMs) &&
        sample.atMs >= before.atMs &&
        sample.atMs <= final.atMs &&
        (index === 0 || sample.atMs > run.samples[index - 1]!.atMs),
    ) &&
    settledSamplesValid(run.after) &&
    run.after[0]!.atMs > final.atMs;
  for (const role of ROLES) {
    const start = timesValid ? roleBytes(before, role, addable) : null;
    const after = timesValid ? steady(run.after, role, addable) : null;
    roles[role] = {
      beforeBytes: start,
      // Peak over the stream samples and the post-stream read.
      peakBytes: timesValid
        ? peak([...run.samples, ...endpoints], role, addable)
        : null,
      afterBytes: after,
      retainedBytes: start === null || after === null ? null : after - start,
    };
  }
  const startCpu = totalCpu(before);
  const endCpu = totalCpu(final);
  const elapsed = final.atMs - before.atMs;
  const streams = run.streams ?? [];
  return {
    name: run.name,
    command: run.command,
    expectedBytes: run.expectedBytes,
    paintedDuringStream: run.paintedDuringStream,
    streams: streams.map((stream) => streamSummary(stream, run.expectedBytes)),
    pollCostMs: run.pollCostMs,
    afterSampleCount: run.after.length,
    endpointCount: endpoints.length,
    sampleTimesValid: timesValid,
    groupWindowMs: elapsed,
    applicationMemoryComplete: applicationMemoryComplete(
      [...run.before, ...run.samples, ...endpoints, ...run.after],
      addable,
    ),
    roles,
    totalCpuPercentOneCore:
      !timesValid || startCpu === null || endCpu === null || elapsed <= 0
        ? null
        : (100 * (endCpu - startCpu)) / (elapsed / 1000),
    settleVerified: run.settle.verified,
  };
}

// Synthetic keydown to observed grid change. Presentation is not measured by
// this fixture and is not claimed.
function inputLatency(input: readonly RawInput[]): InputLatencySummary {
  const valid = input.filter(
    (s) =>
      s.error === null &&
      s.keydownAtMs !== null &&
      Number.isFinite(s.keydownAtMs) &&
      s.gridChangedAtMs !== null &&
      Number.isFinite(s.gridChangedAtMs) &&
      s.gridChangedAtMs >= s.keydownAtMs &&
      Number.isFinite(s.pollCostMs) &&
      s.pollCostMs >= 0,
  );
  const gridSamples = valid.map((s) => s.gridChangedAtMs! - s.keydownAtMs!);
  const pollCosts = valid.map((s) => s.pollCostMs);
  // The export call that detects the change happens before the timestamp is
  // taken, so its cost is part of the raw sample. Subtract what the observer
  // itself spent; the report prints both.
  const corrected = valid.map((s) =>
    Math.max(0, s.gridChangedAtMs! - s.keydownAtMs! - s.pollCostMs),
  );
  const gridToDraw = valid
    .filter(
      (s) =>
        s.gridToDrawMs !== null &&
        Number.isFinite(s.gridToDrawMs) &&
        s.gridToDrawMs >= s.gridChangedAtMs!,
    )
    .map((s) => s.gridToDrawMs! - s.gridChangedAtMs!);
  return {
    samplesMs: gridSamples,
    correctedSamplesMs: corrected,
    failures: input.length - gridSamples.length,
    medianMs: gridSamples.length === 0 ? null : median(gridSamples),
    minMs: gridSamples.length === 0 ? null : Math.min(...gridSamples),
    maxMs: gridSamples.length === 0 ? null : Math.max(...gridSamples),
    medianCorrectedMs: corrected.length === 0 ? null : median(corrected),
    medianGridToDrawMs: gridToDraw.length === 0 ? null : median(gridToDraw),
    pollCostMedianMs: pollCosts.length === 0 ? null : median(pollCosts),
  };
}

function medianIdleCpu(
  windows: readonly WindowSummary[],
): Record<string, number | null> {
  const result: Record<string, number | null> = {};
  for (const role of REPORTED_ROLES) {
    const values = windows
      .map((window) => window.cpuPercentOneCore[role])
      .filter((value): value is number => value !== null);
    result[role] =
      windows.length !== 4 || values.length !== windows.length
        ? null
        : median(values);
  }
  return result;
}

export function deriveRepetition(
  run: RawBenchmarkRun,
  index: number,
): RepetitionSummary {
  const steps = run.steps.map((step) => stepSummary(step, run.metric.addable));
  const one = steps.find((step) => step.name === "one");
  const three = steps.find((step) => step.name === "three");
  const six = steps.find((step) => step.name === "six");
  const idleCpuWindows = run.idleCpu.map((window) =>
    idleSummary(window, run.metric.addable),
  );
  return {
    index,
    steps,
    marginal: {
      oneToThree: marginalSummary(one, three, 2),
      threeToSix: marginalSummary(three, six, 3),
    },
    idle: idleSummary(
      run.idle,
      run.metric.addable,
      PERFORMANCE_BENCHMARK.idleWindowMs,
    ),
    idleCpuWindows,
    idleCpuMedianPercent: medianIdleCpu(idleCpuWindows),
    idleCpuTotalMedianPercent:
      idleCpuWindows.length > 0 &&
      idleCpuWindows.every((window) => window.totalCpuPercentOneCore !== null)
        ? median(idleCpuWindows.map((window) => window.totalCpuPercentOneCore!))
        : null,
    attribution: run.attribution.map((entry) =>
      attributionSummary(entry, run.metric.addable),
    ),
    quiet: idleSummary(run.quiet, run.metric.addable),
    inputLatency: inputLatency(run.input),
  };
}

export function deriveVariant(
  runs: readonly RawBenchmarkRun[],
): VariantSummary {
  const first = runs[0]!;
  return {
    scrollbackLines: first.variant.scrollbackLines,
    settingsSha256: first.identity.settings.sha256,
    appliedScrollbackLines: first.identity.applied?.scrollbackLines ?? null,
    repetitions: runs.map((run, index) => deriveRepetition(run, index + 1)),
  };
}

function gridStable(runs: readonly RawBenchmarkRun[]): boolean {
  const signatures = new Map<string, string>();
  for (const run of runs) {
    for (const step of run.steps) {
      const visible = step.frames.filter((frame) => frame.visible);
      const stepSignatures = new Set(
        visible.map(
          (frame) =>
            `${frame.columns}x${frame.rows}@${frame.cellWidth}x${frame.cellHeight}`,
        ),
      );
      if (stepSignatures.size !== 1) return false;
      const signature = [...stepSignatures][0]!;
      const recorded = signatures.get(step.name);
      if (recorded === undefined) signatures.set(step.name, signature);
      else if (recorded !== signature) return false;
    }
  }
  return signatures.size > 0;
}

function settingsApplied(runs: readonly RawBenchmarkRun[]): boolean {
  const expectedFont = { size: 16, lineHeight: 1, ligatures: false };
  return runs.every(
    (run) =>
      run.identity.settings.lines === run.variant.scrollbackLines &&
      run.identity.applied !== null &&
      run.identity.applied.scrollbackLines === run.variant.scrollbackLines &&
      run.identity.applied.fontSize === expectedFont.size &&
      run.identity.applied.fontLineHeight === expectedFont.lineHeight &&
      run.identity.applied.fontLigatures === expectedFont.ligatures,
  );
}

function windows(run: RawBenchmarkRun): RawWindow[] {
  return [
    run.idle,
    ...run.idleCpu,
    run.quiet,
    ...run.steps.map((step) => ({
      name: `step-${step.name}`,
      windowMs: step.quiescence.windowMs,
      samples: step.samples.slice(0, 1),
      quiescence: step.quiescence,
      documentHasFocus: true,
      visibilityState: "visible",
      drawsDelta: 0,
      observerCostMs: 0,
    })),
  ];
}

function quiescenceVerified(runs: readonly RawBenchmarkRun[]): boolean {
  return runs.every(
    (run) =>
      windows(run).every((window) => window.quiescence.verified) &&
      run.attribution.every((attribution) => attribution.settle.verified),
  );
}

function scrollbackPair(variants: readonly VariantSummary[]) {
  const empty = variants.find((variant) => variant.scrollbackLines === 0);
  const full = variants.find((variant) => variant.scrollbackLines > 0);
  if (!empty || !full) return null;
  const repetitions = Math.min(
    empty.repetitions.length,
    full.repetitions.length,
  );
  const deltas: Array<Record<ReportedRole, number | null>> = [];
  for (let index = 0; index < repetitions; index += 1) {
    // Per repetition: both sides come from the same repetition index, so the
    // pair never mixes states measured minutes apart.
    const delta: Record<ReportedRole, number | null> = {
      main: null,
      renderer: null,
      gpu: null,
    };
    for (const role of ROLES) {
      const emptySix = empty.repetitions[index]!.steps.find(
        (step) => step.name === "six",
      )?.roles[role]?.steadyBytes;
      const fullSix = full.repetitions[index]!.steps.find(
        (step) => step.name === "six",
      )?.roles[role]?.steadyBytes;
      delta[role] =
        emptySix === undefined ||
        emptySix === null ||
        fullSix === undefined ||
        fullSix === null
          ? null
          : fullSix - emptySix;
    }
    deltas.push(delta);
  }
  return {
    emptyLines: empty.scrollbackLines,
    fullLines: full.scrollbackLines,
    deltas,
  };
}

function aggregateRuntime(runtime: RawRuntimeRun | null) {
  if (runtime === null || runtime.samples.length === 0) return null;
  const before = runtime.samples[0]!;
  const after = runtime.samples.at(-1)!;
  const ids = before.processes
    .map((process) => process.pid)
    .sort((a, b) => a - b);
  const complete =
    runtime.samples.length >= 2 &&
    Number.isSafeInteger(runtime.processCount) &&
    runtime.processCount > 0 &&
    (runtime.metric.addable || runtime.processCount === 1) &&
    ids.length === runtime.processCount &&
    new Set(ids).size === ids.length &&
    runtime.samples.every(
      (sample, index) =>
        Number.isFinite(sample.atMs) &&
        (index === 0 || sample.atMs > runtime.samples[index - 1]!.atMs) &&
        sample.processes.length === ids.length &&
        sample.processes
          .map((process) => process.pid)
          .sort((a, b) => a - b)
          .every((pid, i) => pid === ids[i]),
    );
  const sum = (
    sample: (typeof runtime.samples)[number],
    field: "bytes" | "cpuSeconds",
  ): number | null => {
    const values = sample.processes.map((process) => process[field]);
    if (
      !complete ||
      values.length !== runtime.processCount ||
      values.some((value) => value === null || !Number.isFinite(value))
    )
      return null;
    return (values as number[]).reduce((total, value) => total + value, 0);
  };
  const elapsedMs = after.atMs - before.atMs;
  const sizes = runtime.samples.map((sample) => sum(sample, "bytes"));
  const start = sizes[0] ?? null;
  const end = sizes.at(-1) ?? null;
  const startCpu = sum(before, "cpuSeconds");
  const endCpu = sum(after, "cpuSeconds");
  return {
    build: runtime.build ?? {},
    windowMs: elapsedMs,
    processCount: runtime.processCount,
    steadyBytes: sizes.some((value) => value === null)
      ? null
      : Math.min(...(sizes as number[])),
    growthBytes: start === null || end === null ? null : end - start,
    cpuPercentOneCore:
      elapsedMs <= 0 || startCpu === null || endCpu === null
        ? null
        : (100 * (endCpu - startCpu)) / (elapsedMs / 1000),
    settled: runtime.settled,
  };
}

export function deriveBenchmarkReport(input: {
  readonly repetitions: readonly (readonly RawBenchmarkRun[])[];
  readonly runtime: RawRuntimeRun | null;
  readonly repetitionsRequested?: number;
}): BenchmarkReport {
  const run = input.repetitions[0]![0]!;
  const variants = input.repetitions.map(deriveVariant);
  const allRuns = input.repetitions.flat();
  return {
    schema: PERFORMANCE_BENCHMARK_SCHEMA,
    protocol: run.protocol,
    recordedAtUtc: new Date().toISOString(),
    metric: run.metric,
    machine: machineIdentity({
      platform: run.environment.platform,
      arch: run.environment.arch,
      cpuModel: run.environment.cpuModel,
      logicalCpus: run.environment.logicalCpus,
      totalMemoryBytes: run.environment.totalMemoryBytes,
      release: run.environment.release,
      gpuRenderer: run.environment.webglRenderer,
    }),
    versions: {
      electron: run.environment.versions.electron ?? null,
      chrome: run.environment.versions.chrome ?? null,
      node: run.environment.versions.node ?? null,
    },
    identity: {
      contentSize: {
        width: run.identity.contentSize.width,
        height: run.identity.contentSize.height,
      },
      requestedContentSize: run.identity.requestedContentSize,
      devicePixelRatio: run.identity.devicePixelRatio,
      grid: Object.fromEntries(
        run.grids.map((grid) => [
          `tab-${grid.tab}`,
          {
            columns: grid.columns,
            rows: grid.rows,
            cellWidth: grid.cellWidth,
            cellHeight: grid.cellHeight,
          },
        ]),
      ),
      settingsSha256: run.identity.settings.sha256,
      settingsLines: run.identity.settings.lines,
      applied: run.identity.applied,
      build: run.build,
    },
    variants,
    scrollbackPair: scrollbackPair(variants),
    extensionRuntime: aggregateRuntime(input.runtime),
    repetitionsRequested:
      input.repetitionsRequested ??
      Math.max(...input.repetitions.map((runs) => runs.length)),
    determinism: {
      gridStable: gridStable(allRuns),
      settingsApplied: settingsApplied(allRuns),
      quiescenceVerified: quiescenceVerified(allRuns),
    },
    measurementControl: {
      rendererGcAvailable: run.measurementControl?.rendererGcAvailable ?? false,
    },
  };
}
