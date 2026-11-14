import { describe, expect, it } from "vitest";
import { makeRun, report } from "../fixtures/performance-benchmark-synthetic";
import {
  blockingIssues,
  integrityIssues,
} from "../fixtures/performance-benchmark-integrity";
import {
  deriveBenchmarkReport,
  type BenchmarkReport,
  type RawRuntimeRun,
} from "../fixtures/performance-benchmark-report";

const context = {
  expectedRepetitions: 1,
  expectedStreams: 3,
  baselinePresent: false,
  compared: false,
  replacing: false,
  skipReasons: [],
};

function codes(measured: BenchmarkReport): string[] {
  return integrityIssues(measured, context).map((issue) => issue.code);
}

function runtimeReport(
  run: ReturnType<typeof makeRun>,
  runtime: RawRuntimeRun,
): BenchmarkReport {
  return deriveBenchmarkReport({
    repetitions: [[run], [makeRun({ scrollbackLines: 0 })]],
    runtime,
  });
}

function rawRuntime(counters: readonly (readonly number[])[]): RawRuntimeRun {
  const metric = makeRun().metric;
  return {
    metric,
    processCount: counters[0]!.length,
    windowMs: 6000,
    settled: true,
    samples: counters.map((values, index) => ({
      atMs: index * 3000,
      processes: values.map((cpuSeconds, processIndex) => ({
        pid: 900 + processIndex,
        bytes: 46 * 1024 * 1024,
        cpuSeconds,
      })),
    })),
  };
}

describe("benchmark CPU counter integrity", () => {
  it("blocks a fractional delivered stream byte count", () => {
    const run = makeRun({ scrollbackLines: 10_000 });
    const first = run.attribution[0]!;
    const attribution = [
      {
        ...first,
        streams: first.streams!.map((stream, index) =>
          index === 0
            ? { ...stream, bytes: first.expectedBytes + 0.5 }
            : stream,
        ),
      },
      ...run.attribution.slice(1),
    ];
    const measured = report([
      { ...run, attribution },
      makeRun({ scrollbackLines: 0 }),
    ]);
    expect(codes(measured)).toContain("stream-metric-invalid");
    expect(
      measured.variants[0]!.repetitions[0]!.attribution[0]!.streams[0]!
        .bytesPerSecond,
    ).toBeNull();
  });

  it("rejects per-process CPU regression hidden by a positive window total", () => {
    const run = makeRun({ scrollbackLines: 10_000 });
    const idleCpu = run.idleCpu.map((window) =>
      window.name !== "blink-off-focused"
        ? window
        : {
            ...window,
            samples: window.samples.map((sample, index) => ({
              ...sample,
              readings: [
                ...sample.readings.filter(
                  (reading) => reading.role !== "renderer",
                ),
                ...[
                  { pid: 201, cpuSeconds: index === 0 ? 2 : 1 },
                  { pid: 202, cpuSeconds: index === 0 ? 1 : 3 },
                ].map(({ pid, cpuSeconds }) => ({
                  pid,
                  role: "renderer",
                  bytes: 1,
                  workingSetKiB: 1,
                  cpuSeconds,
                })),
              ],
            })),
          },
    );
    const measured = report([
      { ...run, idleCpu },
      makeRun({ scrollbackLines: 0 }),
    ]);
    expect(
      measured.variants[0]!.repetitions[0]!.idleCpuWindows[0]!.cpuPercentOneCore
        .renderer,
    ).toBeNull();
    expect(codes(measured)).toContain("window-invalid");
  });

  it("rejects a per-process regression hidden by a positive stream-group total", () => {
    const run = makeRun({ scrollbackLines: 10_000 });
    const first = run.attribution[0]!;
    const rewrite = (samples: typeof first.before) =>
      samples.map((sample, index) => ({
        ...sample,
        readings: [
          ...sample.readings.filter((reading) => reading.role !== "renderer"),
          ...[
            { pid: 201, cpuSeconds: index === 0 ? 2 : 1 },
            { pid: 202, cpuSeconds: index === 0 ? 1 : 3 },
          ].map(({ pid, cpuSeconds }) => ({
            pid,
            role: "renderer",
            bytes: 1,
            workingSetKiB: 1,
            cpuSeconds,
          })),
        ],
      }));
    const attribution = [
      {
        ...first,
        before: rewrite(first.before),
        samples: rewrite(first.samples),
        streamEnds: rewrite(first.streamEnds!),
      },
      ...run.attribution.slice(1),
    ];
    const measured = report([
      { ...run, attribution },
      makeRun({ scrollbackLines: 0 }),
    ]);
    expect(
      measured.variants[0]!.repetitions[0]!.attribution[0]!
        .totalCpuPercentOneCore,
    ).toBeNull();
    expect(codes(measured)).toContain("attribution-metric-invalid");
  });

  it.each([
    { name: "negative then positive", counters: [[-1], [1]] },
    { name: "decreasing", counters: [[2], [1]] },
    { name: "invalid intermediate sample", counters: [[1], [-1], [2]] },
    {
      name: "hidden per-process regression",
      counters: [
        [2, 1],
        [1, 3],
      ],
    },
  ])("rejects $name extension runtime CPU counters", ({ counters }) => {
    const run = makeRun({ scrollbackLines: 10_000 });
    const measured = runtimeReport(run, rawRuntime(counters));
    expect(measured.extensionRuntime?.cpuPercentOneCore).toBeNull();
    expect(codes(measured)).toContain("extension-runtime-incomplete");
    expect(blockingIssues(integrityIssues(measured, context))).not.toEqual([]);
  });
});
