import {
  MEBIBYTE,
  deriveBenchmarkReport,
  type RawBenchmarkRun,
  type RawRuntimeRun,
} from "./performance-benchmark-report";

// Synthetic payloads only, shared by the unit suites: they prove each
// assertion can fail. Real measurements come from the supervised native fixture.

export const PROTOCOL =
  "application-tabs-scrollback-idle-input-attribution:deadbeef1234";
export const GRID = { columns: 118, rows: 35, cellWidth: 8, cellHeight: 16 };
export const BUILD = {
  main: "a".repeat(64),
  preload: "b".repeat(64),
  rendererHtml: "c".repeat(64),
  rendererCss: "a".repeat(64),
  rendererBundle: "d".repeat(64),
  extensionIndex: "b".repeat(64),
  extensionPackages: "c".repeat(64),
  extensionBootstrap: "e".repeat(64),
  extensionLeases: "f".repeat(64),
};
export const METRIC = {
  name: "pss" as const,
  source: "linux /proc/<pid>/smaps_rollup Pss",
  addable: true,
  qualification: "measured on Linux ARM64",
  sampleIntervalMs: 15,
};

export type Roles = Partial<Record<string, number>>;

export function sample(
  atMs: number,
  bytes: Roles,
  options: { cpu?: Roles; rendererPids?: number[] } = {},
) {
  const rendererPids = options.rendererPids ?? [201];
  const readings: Array<{
    pid: number;
    role: string;
    bytes: number | null;
    workingSetKiB: number | null;
    cpuSeconds: number;
  }> = [];
  if (bytes.renderer !== undefined)
    for (const pid of rendererPids)
      readings.push({
        pid,
        role: "renderer",
        bytes: bytes.renderer / rendererPids.length,
        workingSetKiB: 1,
        cpuSeconds: options.cpu?.renderer ?? 0.1,
      });
  for (const role of ["main", "gpu", "utility", "shell", "other"] as const) {
    const value = bytes[role];
    if (value === undefined) continue;
    readings.push({
      pid: 200 + role.length,
      role,
      bytes: value === undefined ? null : value,
      workingSetKiB: null,
      cpuSeconds: options.cpu?.[role] ?? 0.1,
    });
  }
  return { atMs, mainProcessMemory: { residentSet: 1 }, readings };
}

export function quiescence(verified = true) {
  return {
    windowMs: 800,
    scope: "sampled-window" as const,
    draws: 0,
    gridChanged: false,
    outputBytes: 0,
    verified,
  };
}

export function window(
  name: string,
  before: Roles,
  after: Roles,
  verified = true,
) {
  return {
    name,
    windowMs: 4000,
    memorySettleMs: 1200,
    samples: [
      sample(0, before, { cpu: { renderer: 1, gpu: 1, main: 1 } }),
      sample(4000, after, { cpu: { renderer: 1.2, gpu: 1.1, main: 1.05 } }),
    ],
    quiescence: quiescence(verified),
    documentHasFocus: true,
    visibilityState: "visible",
    drawsDelta: 0,
    observerCostMs: 1,
  };
}

export function attribution(
  name: string,
  bytes: number,
  ms: number,
  memory: Roles,
  options: {
    peakExtra?: number;
    verified?: boolean;
    streamCount?: number;
    found?: boolean;
  } = {},
) {
  const declared = 328_000;
  const peak = {
    ...memory,
    renderer: (memory.renderer ?? 0) + (options.peakExtra ?? 0),
  };
  const endpoint = sample(140, peak, {
    cpu: { renderer: 1.4, gpu: 1.3, main: 1.2 },
  });
  return {
    name,
    token: `${name}1`,
    command: name === "variety" ? "variety" : "flood",
    paintedDuringStream: true,
    expectedBytes: declared,
    streams: Array.from({ length: options.streamCount ?? 3 }, () => ({
      elapsedMs: ms,
      found: options.found ?? true,
      bytes,
      overheadBytes: 0,
    })),
    pollCostMs: 0.4,
    before: [sample(0, memory)],
    samples: [sample(60, { ...memory }), sample(120, peak)],
    streamEnds: [
      endpoint,
      { ...endpoint, atMs: 280 },
      { ...endpoint, atMs: 420 },
    ],
    after: [
      sample(1700, memory),
      sample(2700, memory),
      sample(3700, memory),
      sample(4700, memory),
      sample(5700, memory),
    ],
    settle: quiescence(options.verified ?? true),
  };
}

export interface RunOptions {
  readonly scrollbackLines?: number;
  readonly memory?: Roles;
  readonly marginal?: Roles;
  readonly marginalLate?: Roles;
  readonly idleGrowth?: Roles;
  readonly idleSamples?: number;
  readonly idleRendererCpu?: number;
  readonly throughputMs?: Partial<
    Record<"ascii" | "variety" | "deep-history", number>
  >;
  readonly latencyMs?: number;
  readonly latencyFailures?: number;
  readonly quiescence?: boolean;
  readonly grid?: {
    columns: number;
    rows: number;
    cellWidth: number;
    cellHeight: number;
  };
  readonly platform?: string;
  readonly arch?: string;
  readonly metric?: RawBenchmarkRun["metric"];
  readonly rendererProcesses?: number;
  readonly rendererPidChange?: boolean;
  readonly peakExtra?: number;
  readonly streamCount?: number;
  readonly streamFound?: boolean;
  readonly fonts?: { fontSize: number };
}

function metricFor(platform: string): RawBenchmarkRun["metric"] {
  if (platform === "linux") return METRIC;
  if (platform === "darwin")
    return {
      ...METRIC,
      name: "phys_footprint",
      source: "synthetic macOS phys_footprint",
      addable: false,
      qualification: `${platform} is not measured`,
    };
  return {
    ...METRIC,
    name: "private_bytes",
    source: "synthetic Windows private bytes",
    qualification: `${platform} is not measured`,
  };
}

// `marginal` applies to the first three tabs and `late` to tabs 4-6, so a test
// can express superlinear growth without mutating a derived value.
function stepBytes(
  base: Roles,
  marginal: Roles,
  tabs: number,
  late: Roles = marginal,
): Roles {
  const earlyTabs = Math.min(tabs - 1, 2);
  const lateTabs = Math.max(0, tabs - 3);
  const grow = (role: string) =>
    (base[role] ?? 0) +
    (marginal[role] ?? 0) * earlyTabs +
    (late[role] ?? 0) * lateTabs;
  return {
    main: grow("main"),
    renderer: grow("renderer"),
    gpu: grow("gpu"),
    shell: (base.shell ?? 0) * tabs,
  };
}

function rendererPids(options: RunOptions): number[] {
  const count = options.rendererProcesses ?? 1;
  return Array.from({ length: count }, (_, index) => 201 + index);
}

function makeSteps(
  base: Roles,
  marginal: Roles,
  grid: NonNullable<RunOptions["grid"]>,
  options: RunOptions,
) {
  const late = options.marginalLate ?? marginal;
  const pids = rendererPids(options);
  const frames = (visible: number) =>
    [0, 1, 2].map((tab) => ({
      tabIndex: tab,
      visible: tab === visible,
      ...grid,
    }));
  return [
    { name: "one", tabs: 1 },
    { name: "three", tabs: 3 },
    { name: "six", tabs: 6 },
  ].map((step) => {
    const bytes = stepBytes(base, marginal, step.tabs, late);
    const laterPids = options.rendererPidChange ? [901] : pids;
    return {
      name: step.name,
      tabs: step.tabs,
      durationMs: 4000,
      memorySettleMs: 1200,
      samples: [
        sample(0, bytes, { rendererPids: pids }),
        sample(1000, bytes, { rendererPids: laterPids }),
        sample(2000, bytes, { rendererPids: laterPids }),
        sample(3000, bytes, { rendererPids: laterPids }),
        sample(4000, bytes, { rendererPids: laterPids }),
      ],
      frames: frames(0),
      outputBytes: [1000],
      quiescence: quiescence(options.quiescence ?? true),
    };
  });
}

// Monotonic samples across the window, so the endpoint-delta estimator can be
// exercised on more than two reads.
function makeIdleSamples(six: Roles, growth: Roles, count: number) {
  const steps = Math.max(count, 2) - 1;
  return Array.from({ length: Math.max(count, 2) }, (_, index) => {
    const fraction = index / steps;
    return sample(Math.round(12000 * fraction), {
      ...six,
      renderer: (six.renderer ?? 0) + (growth.renderer ?? 0) * fraction,
      main: (six.main ?? 0) + (growth.main ?? 0) * fraction,
      gpu: (six.gpu ?? 0) + (growth.gpu ?? 0) * fraction,
    });
  });
}

function makeIdleCpuWindow(
  name: string,
  six: Roles,
  options: RunOptions,
  percent: number,
) {
  return {
    name,
    windowMs: 4000,
    memorySettleMs: 1200,
    samples: [
      sample(0, six, { cpu: { renderer: 1, gpu: 1, main: 1 } }),
      sample(4000, six, {
        cpu: { renderer: 1 + percent / 25, gpu: 1, main: 1 },
      }),
    ],
    quiescence: quiescence(options.quiescence ?? true),
    documentHasFocus: !name.endsWith("-unfocused"),
    visibilityState: "visible",
    drawsDelta: 80,
    observerCostMs: 1,
  };
}

function makeInputSamples(options: RunOptions) {
  const latency = options.latencyMs ?? 12;
  const failures = options.latencyFailures ?? 0;
  return Array.from({ length: 7 }, (_, index) => {
    const failed = index < failures;
    return {
      keydownAtMs: index * 100,
      gridChangedAtMs: failed ? null : index * 100 + latency,
      gridToDrawMs: failed ? null : index * 100 + latency + 5,
      pollCostMs: 0.3,
      error: failed ? "no-grid-change" : null,
    };
  });
}

function defaultsFor(options: RunOptions) {
  return {
    platform: options.platform ?? "linux",
    arch: options.arch ?? "arm64",
    scrollbackLines: options.scrollbackLines ?? 10_000,
    base: options.memory ?? {
      main: 140 * MEBIBYTE,
      renderer: 258 * MEBIBYTE,
      gpu: 55 * MEBIBYTE,
      shell: 4 * MEBIBYTE,
    },
    marginal: options.marginal ?? {
      main: 1 * MEBIBYTE,
      renderer: 10 * MEBIBYTE,
      gpu: 0.5 * MEBIBYTE,
    },
    grid: options.grid ?? GRID,
    growth: options.idleGrowth ?? {},
    idleCpuPercent: options.idleRendererCpu ?? 2,
    throughput: {
      ascii: options.throughputMs?.ascii ?? 100,
      variety: options.throughputMs?.variety ?? 300,
      deep: options.throughputMs?.["deep-history"] ?? 100,
    },
    fontSize: options.fonts?.fontSize ?? 16,
    verified: options.quiescence ?? true,
  };
}

export function makeRun(options: RunOptions = {}): RawBenchmarkRun {
  const defaults = defaultsFor(options);
  const {
    platform,
    arch,
    scrollbackLines,
    base,
    marginal,
    grid,
    growth,
    idleCpuPercent,
    throughput,
    fontSize,
    verified,
  } = defaults;
  const metric = options.metric ?? metricFor(platform);
  const six = stepBytes(base, marginal, 6, options.marginalLate ?? marginal);
  return {
    protocol: PROTOCOL,
    variant: { scrollbackLines },
    metric: metric as RawBenchmarkRun["metric"],
    environment: {
      platform,
      arch,
      release: "test-release",
      versions: { electron: "43.8.1", chrome: "142", node: "22" },
      cpuModel: "Synthetic CPU",
      logicalCpus: 4,
      totalMemoryBytes: 8 * 1024 * MEBIBYTE,
      webglRenderer: "ANGLE (Mesa, virgl (Synthetic Device), OpenGL 4.0)",
    },
    build: BUILD,
    measurementControl: { rendererGcAvailable: true },
    identity: {
      contentSize: { x: 0, y: 0, width: 960, height: 640 },
      requestedContentSize: { width: 960, height: 640 },
      devicePixelRatio: 1,
      settings: { lines: scrollbackLines, sha256: `sha-${scrollbackLines}` },
      applied: {
        fontSize,
        fontLineHeight: 1,
        fontLigatures: false,
        fontFamily: null,
        scrollbackLines,
      },
    },
    grids: [0, 1, 2].map((tab) => ({ tab, ...grid })),
    steps: makeSteps(base, marginal, grid, options),
    idle: {
      ...window("full-tab-set", six, six, verified),
      windowMs: 12000,
      samples: makeIdleSamples(six, growth, options.idleSamples ?? 2),
    },
    idleCpu: [
      makeIdleCpuWindow("blink-off-focused", six, options, idleCpuPercent),
      makeIdleCpuWindow("blink-off-unfocused", six, options, idleCpuPercent),
      makeIdleCpuWindow("blink-on-focused", six, options, idleCpuPercent),
      makeIdleCpuWindow("blink-on-unfocused", six, options, idleCpuPercent),
    ],
    attribution: [
      attribution("ascii", 328_000, throughput.ascii, six, {
        ...(options.peakExtra === undefined
          ? {}
          : { peakExtra: options.peakExtra }),
        ...(options.streamCount === undefined
          ? {}
          : { streamCount: options.streamCount }),
        ...(options.streamFound === undefined
          ? {}
          : { found: options.streamFound }),
      }),
      attribution("variety", 328_000, throughput.variety, six),
      attribution("deep-history", 328_000, throughput.deep, six),
    ],
    quiet: window("sitting-still-after-history", six, six, verified),
    input: makeInputSamples(options),
  };
}

const RUNTIME: RawRuntimeRun = {
  metric: METRIC,
  build: {
    runtimeIndex: "a".repeat(64),
    runtimePackages: "b".repeat(64),
    runtimeBootstrap: "c".repeat(64),
    runtimeLeases: "d".repeat(64),
  },
  windowMs: 6000,
  processCount: 1,
  samples: [
    { atMs: 0, processes: [{ pid: 900, bytes: 46 * MEBIBYTE, cpuSeconds: 1 }] },
    {
      atMs: 6000,
      processes: [{ pid: 900, bytes: 46 * MEBIBYTE, cpuSeconds: 1.2 }],
    },
  ],
  settled: true,
};

export function report(
  runs: readonly RawBenchmarkRun[],
  repetitions?: readonly (readonly RawBenchmarkRun[])[],
) {
  return deriveBenchmarkReport({
    repetitions: repetitions ?? runs.map((run) => [run]),
    runtime: RUNTIME,
  });
}

export function acceptedReport() {
  return report([
    makeRun({ scrollbackLines: 10_000 }),
    makeRun({ scrollbackLines: 0 }),
  ]);
}
