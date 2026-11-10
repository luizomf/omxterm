import { describe, expect, it } from "vitest";
import { makeRun, report } from "../fixtures/performance-benchmark-synthetic";
import {
  blockingIssues,
  integrityIssues,
  type IntegrityContext,
} from "../fixtures/performance-benchmark-integrity";
import {
  deriveBenchmarkReport,
  type BenchmarkReport,
} from "../fixtures/performance-benchmark-report";

const context = (
  overrides: Partial<IntegrityContext> = {},
): IntegrityContext => ({
  expectedRepetitions: 1,
  expectedStreams: 3,
  baselinePresent: false,
  compared: false,
  replacing: false,
  skipReasons: [],
  ...overrides,
});

function codes(measured: BenchmarkReport, overrides = {}): string[] {
  return integrityIssues(measured, context(overrides)).map(
    (issue) => issue.code,
  );
}

describe("performance benchmark integrity", () => {
  it("accepts a complete run with no baseline", () => {
    const measured = report([
      makeRun({ scrollbackLines: 10_000 }),
      makeRun({ scrollbackLines: 0 }),
    ]);
    expect(integrityIssues(measured, context())).toEqual([]);
  });

  it("accepts non-additive Darwin role observations without inventing totals", () => {
    const run = makeRun({ scrollbackLines: 10_000, platform: "darwin" });
    expect(run.metric.addable).toBe(false);
    const measured = report([
      run,
      makeRun({ scrollbackLines: 0, platform: "darwin" }),
    ]);
    const repetition = measured.variants[0]!.repetitions[0]!;
    expect(repetition.steps[0]!.roles.renderer!.steadyBytes).not.toBeNull();
    expect(repetition.steps[0]!.totalBytes).toBeNull();
    expect(repetition.idle.totalGrowthBytes).toBeNull();
    expect(blockingIssues(integrityIssues(measured, context()))).toEqual([]);
  });
});

describe("performance benchmark sampling admission", () => {
  it("rejects non-additive multi-process role sums instead of counting shared memory twice", () => {
    const measured = report([
      makeRun({ platform: "darwin", rendererProcesses: 2 }),
      makeRun({ platform: "darwin", scrollbackLines: 0 }),
    ]);
    expect(
      measured.variants[0]!.repetitions[0]!.steps[0]!.roles.renderer!
        .steadyBytes,
    ).toBeNull();
    expect(codes(measured)).toContain("missing-metric");
  });

  it("rejects collapsed and out-of-order attribution observations", () => {
    const run = makeRun();
    const first = run.attribution[0]!;
    for (const broken of [
      { ...first, after: first.after.map(() => first.after[0]!) },
      {
        ...first,
        streamEnds: first.streamEnds!.map(() => first.streamEnds![0]!),
      },
      {
        ...first,
        after: first.after.map((sample, index) => ({
          ...sample,
          atMs: index + 1,
        })),
      },
    ]) {
      const measured = report([
        { ...run, attribution: [broken, ...run.attribution.slice(1)] },
        makeRun({ scrollbackLines: 0 }),
      ]);
      const attribution = measured.variants[0]!.repetitions[0]!.attribution[0]!;
      expect(attribution.roles.renderer.retainedBytes).toBeNull();
      expect(codes(measured)).toContain("attribution-metric-invalid");
    }
  });

  it("rejects short settled and idle sampling spans", () => {
    const run = makeRun();
    const short = (samples: typeof run.idle.samples) =>
      samples.map((sample, index) => ({ ...sample, atMs: index }));
    const measured = report([
      {
        ...run,
        steps: run.steps.map((step) => ({
          ...step,
          samples: short(step.samples),
        })),
        idle: { ...run.idle, samples: short(run.idle.samples) },
      },
      makeRun({ scrollbackLines: 0 }),
    ]);
    expect(codes(measured)).toEqual(
      expect.arrayContaining(["sample-interval-invalid", "window-invalid"]),
    );
    expect(
      measured.variants[0]!.repetitions[0]!.idle.growthBytes.renderer,
    ).toBeNull();
  });
});

describe("performance benchmark incomplete observations", () => {
  it("rejects missing raw attribution, input, and CPU-window families", () => {
    const run = makeRun({ scrollbackLines: 10_000 });
    const measured = report([
      { ...run, attribution: [], input: [], idleCpu: [] },
      makeRun({ scrollbackLines: 0 }),
    ]);
    expect(codes(measured)).toEqual(
      expect.arrayContaining([
        "attribution-missing",
        "input-count",
        "cpu-window-missing",
      ]),
    );
  });

  it("rejects extra raw stream groups and idle CPU windows outside the fixed sequence", () => {
    const run = makeRun({ scrollbackLines: 10_000 });
    const measured = report([
      {
        ...run,
        attribution: [
          ...run.attribution,
          { ...run.attribution[0]!, name: "unexpected" },
        ],
        idleCpu: [...run.idleCpu, { ...run.idleCpu[0]!, name: "unexpected" }],
      },
      makeRun({ scrollbackLines: 0 }),
    ]);
    expect(codes(measured)).toEqual(
      expect.arrayContaining(["attribution-count", "cpu-window-count"]),
    );
  });

  it("rejects unusable raw intervals and non-finite stream observations", () => {
    const run = makeRun({ scrollbackLines: 10_000 });
    const first = run.attribution[0]!;
    const attribution = [
      {
        ...first,
        streams: first.streams!.map((stream) => ({
          ...stream,
          elapsedMs: 0,
          bytes: NaN,
        })),
      },
      ...run.attribution.slice(1),
    ];
    const idleCpu = run.idleCpu.map((window) => ({
      ...window,
      samples: window.samples.map((sample) => ({ ...sample, atMs: 0 })),
    }));
    const measured = report([
      { ...run, attribution, idleCpu },
      makeRun({ scrollbackLines: 0 }),
    ]);
    expect(codes(measured)).toEqual(
      expect.arrayContaining(["stream-metric-invalid", "window-invalid"]),
    );
  });

  it("reports an empty raw idle window as invalid rather than crashing", () => {
    const run = makeRun({ scrollbackLines: 10_000 });
    const measured = report([
      { ...run, idle: { ...run.idle, samples: [] } },
      makeRun({ scrollbackLines: 0 }),
    ]);
    expect(codes(measured)).toContain("window-invalid");
    expect(
      measured.variants[0]!.repetitions[0]!.idle.growthBytes.renderer,
    ).toBeNull();
  });

  it("rejects an unread process in a required CPU window", () => {
    const run = makeRun({ scrollbackLines: 10_000, rendererProcesses: 2 });
    const idleCpu = run.idleCpu.map((window) => ({
      ...window,
      samples: window.samples.map((sample) => ({
        ...sample,
        readings: sample.readings.map((reading) =>
          reading.role === "renderer"
            ? { ...reading, cpuSeconds: null }
            : reading,
        ),
      })),
    }));
    const measured = report([
      { ...run, idleCpu },
      makeRun({ scrollbackLines: 0 }),
    ]);
    expect(codes(measured)).toContain("window-invalid");
  });

  it("rejects a Linux application CPU total with an unread utility process", () => {
    const run = makeRun({ scrollbackLines: 10_000 });
    const idleCpu = run.idleCpu.map((window) => ({
      ...window,
      samples: window.samples.map((sample) => ({
        ...sample,
        readings: [
          ...sample.readings,
          {
            pid: 500,
            role: "utility",
            bytes: 100,
            workingSetKiB: null,
            cpuSeconds: null,
          },
        ],
      })),
    }));
    const measured = report([
      { ...run, idleCpu },
      makeRun({ scrollbackLines: 0 }),
    ]);
    expect(
      measured.variants[0]!.repetitions[0]!.idleCpuWindows[0]!
        .totalCpuPercentOneCore,
    ).toBeNull();
    expect(codes(measured)).toContain("window-invalid");
  });

  it("rejects settled samples without a usable chronological interval", () => {
    const run = makeRun({ scrollbackLines: 10_000 });
    const steps = run.steps.map((step) => ({
      ...step,
      samples: step.samples.map((sample) => ({ ...sample, atMs: 0 })),
    }));
    const measured = report([
      { ...run, steps },
      makeRun({ scrollbackLines: 0 }),
    ]);
    expect(codes(measured)).toContain("sample-interval-invalid");
  });

  it("rejects a shortened raw settled sample set instead of treating its minimum as a floor", () => {
    const run = makeRun({ scrollbackLines: 10_000 });
    const steps = run.steps.map((step) => ({
      ...step,
      samples: step.samples.slice(0, 1),
    }));
    const measured = report([
      { ...run, steps },
      makeRun({ scrollbackLines: 0 }),
    ]);
    expect(codes(measured)).toContain("sample-count");
  });

  it("rejects a non-finite input observation rather than reporting NaN latency", () => {
    const run = makeRun({ scrollbackLines: 10_000 });
    const input = run.input.map((entry, index) =>
      index === 0 ? { ...entry, gridChangedAtMs: NaN } : entry,
    );
    const measured = report([
      { ...run, input },
      makeRun({ scrollbackLines: 0 }),
    ]);
    expect(codes(measured)).toContain("latency-observation-failed");
  });

  it("rejects a missing stream-group endpoint rather than using a stale one", () => {
    const run = makeRun({ scrollbackLines: 10_000 });
    const first = run.attribution[0]!;
    const measured = report([
      {
        ...run,
        attribution: [
          { ...first, streamEnds: [] },
          ...run.attribution.slice(1),
        ],
      },
      makeRun({ scrollbackLines: 0 }),
    ]);
    expect(
      measured.variants[0]!.repetitions[0]!.attribution[0]!
        .totalCpuPercentOneCore,
    ).toBeNull();
    expect(codes(measured)).toContain("attribution-metric-invalid");
  });

  it("rejects a shortened attribution settle and leaves its retained value unavailable", () => {
    const run = makeRun({ scrollbackLines: 10_000 });
    const first = run.attribution[0]!;
    const measured = report([
      {
        ...run,
        attribution: [
          { ...first, after: first.after.slice(0, 1) },
          ...run.attribution.slice(1),
        ],
      },
      makeRun({ scrollbackLines: 0 }),
    ]);
    expect(
      measured.variants[0]!.repetitions[0]!.attribution[0]!.roles.renderer
        .retainedBytes,
    ).toBeNull();
    expect(codes(measured)).toContain("attribution-metric-invalid");
  });

  it("distinguishes an unread optional process from an absent role on non-additive metrics", () => {
    const metric = {
      ...makeRun().metric,
      name: "phys_footprint" as const,
      addable: false,
    };
    const run = makeRun({
      scrollbackLines: 10_000,
      platform: "darwin",
      metric,
    });
    const steps = run.steps.map((step) => ({
      ...step,
      samples: step.samples.map((sample) => ({
        ...sample,
        readings: [
          ...sample.readings,
          {
            pid: 500,
            role: "utility",
            bytes: null,
            workingSetKiB: null,
            cpuSeconds: null,
          },
        ],
      })),
    }));
    const measured = report([
      { ...run, steps },
      makeRun({ scrollbackLines: 0, platform: "darwin", metric }),
    ]);
    expect(codes(measured)).toContain("missing-metric");
  });

  it("rejects a partially unread renderer rather than summing the readable process", () => {
    const run = makeRun({ scrollbackLines: 10_000, rendererProcesses: 2 });
    const steps = run.steps.map((step) => ({
      ...step,
      samples: step.samples.map((sample) => ({
        ...sample,
        readings: sample.readings.map((reading) =>
          reading.pid === 202 && reading.role === "renderer"
            ? { ...reading, bytes: null }
            : reading,
        ),
      })),
    }));
    const measured = report([
      { ...run, steps },
      makeRun({ scrollbackLines: 0 }),
    ]);
    expect(
      measured.variants[0]!.repetitions[0]!.steps[0]!.roles.renderer!
        .steadyBytes,
    ).toBeNull();
    expect(codes(measured)).toContain("missing-metric");
  });
});

describe("performance benchmark reference and admission", () => {
  it("retains the separate reference runtime's own artifact provenance", () => {
    const run = makeRun({ scrollbackLines: 10_000 });
    const measured = deriveBenchmarkReport({
      repetitions: [[run], [makeRun({ scrollbackLines: 0 })]],
      runtime: {
        metric: run.metric,
        windowMs: 1000,
        processCount: 1,
        settled: true,
        build: { runtimeIndex: "runtime-only" },
        samples: [
          { atMs: 0, processes: [{ pid: 1, bytes: 20, cpuSeconds: 0 }] },
          { atMs: 1000, processes: [{ pid: 1, bytes: 20, cpuSeconds: 0 }] },
        ],
      },
    });
    expect(measured.extensionRuntime).toMatchObject({
      build: { runtimeIndex: "runtime-only" },
    });
  });

  it("accepts unavailable non-Linux reference CPU while retaining valid memory", () => {
    const metric = {
      ...makeRun().metric,
      name: "phys_footprint" as const,
      addable: false,
    };
    const run = makeRun({
      scrollbackLines: 10_000,
      platform: "darwin",
      metric,
    });
    const measured = deriveBenchmarkReport({
      repetitions: [
        [run],
        [makeRun({ scrollbackLines: 0, platform: "darwin", metric })],
      ],
      runtime: {
        metric,
        windowMs: 1000,
        processCount: 1,
        settled: true,
        samples: [
          { atMs: 0, processes: [{ pid: 1, bytes: 20, cpuSeconds: null }] },
          { atMs: 1000, processes: [{ pid: 1, bytes: 10, cpuSeconds: null }] },
        ],
      },
    });
    expect(measured.extensionRuntime?.cpuPercentOneCore).toBeNull();
    expect(measured.extensionRuntime?.steadyBytes).toBe(10);
    expect(measured.extensionRuntime?.growthBytes).toBe(-10);
    expect(blockingIssues(integrityIssues(measured, context()))).toEqual([]);
  });

  it("rejects a reference runtime window whose process identity changes", () => {
    const run = makeRun({ scrollbackLines: 10_000 });
    const measured = deriveBenchmarkReport({
      repetitions: [[run], [makeRun({ scrollbackLines: 0 })]],
      runtime: {
        metric: run.metric,
        windowMs: 1000,
        processCount: 1,
        settled: true,
        samples: [
          { atMs: 0, processes: [{ pid: 1, bytes: 20, cpuSeconds: 0 }] },
          { atMs: 1000, processes: [{ pid: 2, bytes: 20, cpuSeconds: 0 }] },
        ],
      },
    });
    expect(measured.extensionRuntime?.growthBytes).toBeNull();
    expect(codes(measured)).toContain("extension-runtime-incomplete");
  });

  it("rejects an unread Linux reference CPU counter", () => {
    const run = makeRun({ scrollbackLines: 10_000 });
    const measured = deriveBenchmarkReport({
      repetitions: [[run], [makeRun({ scrollbackLines: 0 })]],
      runtime: {
        metric: run.metric,
        windowMs: 1000,
        processCount: 1,
        settled: true,
        samples: [
          { atMs: 0, processes: [{ pid: 1, bytes: 20, cpuSeconds: null }] },
          { atMs: 1000, processes: [{ pid: 1, bytes: 20, cpuSeconds: null }] },
        ],
      },
    });
    expect(measured.extensionRuntime?.cpuPercentOneCore).toBeNull();
    expect(codes(measured)).toContain("extension-runtime-incomplete");
  });

  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid raw reference runtime bytes: %s",
    (bytes) => {
      const run = makeRun({ scrollbackLines: 10_000, platform: "darwin" });
      const measured = deriveBenchmarkReport({
        repetitions: [
          [run],
          [makeRun({ scrollbackLines: 0, platform: "darwin" })],
        ],
        runtime: {
          metric: run.metric,
          windowMs: 1000,
          processCount: 1,
          settled: true,
          samples: [
            { atMs: 0, processes: [{ pid: 1, bytes, cpuSeconds: null }] },
            {
              atMs: 1000,
              processes: [{ pid: 1, bytes, cpuSeconds: null }],
            },
          ],
        },
      });
      expect(measured.extensionRuntime?.steadyBytes).toBeNull();
      expect(measured.extensionRuntime?.growthBytes).toBeNull();
      expect(measured.extensionRuntime?.cpuPercentOneCore).toBeNull();
      expect(codes(measured)).toContain("extension-runtime-incomplete");
    },
  );

  it("rejects a missing metric instead of reporting around it", () => {
    const measured = report([
      makeRun({ scrollbackLines: 10_000 }),
      makeRun({ scrollbackLines: 0 }),
    ]);
    const mutated = structuredClone(measured) as BenchmarkReport;
    const step = mutated.variants[0]!.repetitions[0]!.steps[2]!;
    Object.assign(step.roles, {
      renderer: { steadyBytes: null, peakBytes: null },
    });
    const issues = integrityIssues(mutated, context());
    expect(issues.map((issue) => issue.code)).toContain("missing-metric");
    expect(
      issues.find((issue) => issue.code === "missing-metric")?.detail,
    ).toContain("renderer");
    expect(blockingIssues(issues)).not.toEqual([]);
  });

  it("does not invent a fallback stream when raw repeated streams are absent", () => {
    const run = makeRun({ scrollbackLines: 10_000 });
    const first = run.attribution[0]!;
    const measured = report([
      {
        ...run,
        attribution: [{ ...first, streams: [] }, ...run.attribution.slice(1)],
      },
      makeRun({ scrollbackLines: 0 }),
    ]);
    expect(
      measured.variants[0]!.repetitions[0]!.attribution[0]!.streams,
    ).toEqual([]);
    expect(codes(measured)).toContain("stream-count");
  });

  it("rejects a stream that did not complete and a short arrival", () => {
    const incomplete = report([
      makeRun({ scrollbackLines: 10_000, streamFound: false }),
      makeRun({ scrollbackLines: 0 }),
    ]);
    expect(codes(incomplete)).toContain("stream-incomplete");

    const run = makeRun({ scrollbackLines: 10_000 });
    const target = run.attribution[0]!;
    const streams = target.streams!.map((stream, index) =>
      index === 1 ? { ...stream, bytes: 100_000, found: true } : stream,
    );
    const short = report([
      {
        ...run,
        attribution: [{ ...target, streams }, ...run.attribution.slice(1)],
      },
      makeRun({ scrollbackLines: 0 }),
    ]);
    expect(codes(short)).toContain("stream-delivery");
    expect(
      short.variants[0]!.repetitions[0]!.attribution[0]!.streams[1]!
        .bytesPerSecond,
    ).toBeNull();
  });

  it("rejects a repetition count below the requested one", () => {
    const measured = report([makeRun({ scrollbackLines: 10_000 })]);
    expect(codes(measured, { expectedRepetitions: 3 })).toContain(
      "repetition-missing",
    );
  });

  it("rejects failed keystroke observations and non-quiescent windows", () => {
    const latency = report([
      makeRun({ scrollbackLines: 10_000, latencyFailures: 2 }),
      makeRun({ scrollbackLines: 0 }),
    ]);
    expect(codes(latency)).toContain("latency-observation-failed");
    const quiescence = report([
      makeRun({ scrollbackLines: 10_000, quiescence: false }),
      makeRun({ scrollbackLines: 0 }),
    ]);
    expect(codes(quiescence)).toContain("quiescence-not-verified");
  });

  it("rejects an unexpected skip when a baseline exists", () => {
    const measured = report([
      makeRun({ scrollbackLines: 10_000 }),
      makeRun({ scrollbackLines: 0 }),
    ]);
    const issues = integrityIssues(
      measured,
      context({
        baselinePresent: true,
        compared: false,
        replacing: false,
        skipReasons: ["renderer grid differs from the recorded baseline"],
      }),
    );
    expect(issues.map((issue) => issue.code)).toContain("unexpected-skip");
  });

  it("notes a missing renderer collection without rejecting the run", () => {
    const measured = report([
      makeRun({ scrollbackLines: 10_000 }),
      makeRun({ scrollbackLines: 0 }),
    ]);
    const mutated = structuredClone(measured) as BenchmarkReport;
    Object.assign(mutated, {
      measurementControl: { rendererGcAvailable: false },
    });
    const issues = integrityIssues(mutated, context());
    expect(issues.map((issue) => issue.code)).toContain("gc-unavailable");
    expect(blockingIssues(issues)).toEqual([]);
  });

  it("rejects a run without the extension runtime", () => {
    const measured = report([makeRun({ scrollbackLines: 10_000 })]);
    const mutated = structuredClone(measured) as BenchmarkReport;
    Object.assign(mutated, { extensionRuntime: null });
    expect(codes(mutated)).toContain("extension-runtime-missing");
  });
});
