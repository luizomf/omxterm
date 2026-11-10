import { describe, expect, it } from "vitest";
import {
  blockingIssues,
  integrityIssues,
  type IntegrityContext,
} from "../fixtures/performance-benchmark-integrity";
import {
  deriveBenchmarkReport,
  type BenchmarkReport,
  type RawRuntimeRun,
} from "../fixtures/performance-benchmark-report";
import { makeRun } from "../fixtures/performance-benchmark-synthetic";

const context = (): IntegrityContext => ({
  expectedRepetitions: 1,
  expectedStreams: 3,
  baselinePresent: false,
  compared: false,
  replacing: false,
  skipReasons: [],
});

const codes = (measured: BenchmarkReport): string[] =>
  integrityIssues(measured, context()).map((issue) => issue.code);

type RawRuntimeProcess = RawRuntimeRun["samples"][number]["processes"][number];

function rawRuntime(
  processesBySample: readonly (readonly RawRuntimeProcess[])[],
): RawRuntimeRun {
  return {
    metric: makeRun().metric,
    windowMs: Math.max(0, processesBySample.length - 1) * 1000,
    processCount: processesBySample[0]?.length ?? 1,
    samples: processesBySample.map((processes, index) => ({
      atMs: index * 1000,
      processes,
    })),
    settled: true,
  };
}

function reportWithRuntime(runtime: RawRuntimeRun): BenchmarkReport {
  return deriveBenchmarkReport({
    repetitions: [
      [makeRun({ scrollbackLines: 10_000 })],
      [makeRun({ scrollbackLines: 0 })],
    ],
    runtime,
  });
}

describe("performance benchmark extension-runtime memory integrity", () => {
  it("rejects invalid absolute bytes at every sample position without changing CPU", () => {
    const invalidBytes = [-1, 1.5, Number.MAX_SAFE_INTEGER + 1];

    for (const invalid of invalidBytes) {
      for (const invalidPosition of [0, 1, 2]) {
        const runtime = rawRuntime(
          [100, 90, 80].map((bytes, index) => [
            {
              pid: 1,
              bytes: index === invalidPosition ? invalid : bytes,
              cpuSeconds: index + 1,
            },
          ]),
        );
        const measured = reportWithRuntime(runtime);
        expect(measured.extensionRuntime).toMatchObject({
          steadyBytes: null,
          growthBytes: null,
          cpuPercentOneCore: 100,
        });
        expect(integrityIssues(measured, context())).toContainEqual(
          expect.objectContaining({
            code: "extension-runtime-incomplete",
            blocking: true,
          }),
        );
      }
    }
  });

  it("rejects invalid per-process bytes hidden by an addable aggregate", () => {
    const maskedComponents = [
      [-1, 101],
      [1.5, 2.5],
      [Number.MAX_SAFE_INTEGER + 1, -1],
    ];

    for (const bytes of maskedComponents) {
      const runtime = rawRuntime(
        [0, 1, 2].map((index) =>
          bytes.map((value, pid) => ({
            pid: pid + 1,
            bytes: value,
            cpuSeconds: index,
          })),
        ),
      );
      const measured = reportWithRuntime(runtime);
      expect(measured.extensionRuntime).toMatchObject({
        steadyBytes: null,
        growthBytes: null,
      });
      expect(codes(measured)).toContain("extension-runtime-incomplete");
    }

    const unsafeAggregate = reportWithRuntime(
      rawRuntime(
        [0, 1, 2].map((index) => [
          {
            pid: 1,
            bytes: Number.MAX_SAFE_INTEGER,
            cpuSeconds: index,
          },
          { pid: 2, bytes: 1, cpuSeconds: index },
        ]),
      ),
    );
    expect(unsafeAggregate.extensionRuntime).toMatchObject({
      steadyBytes: null,
      growthBytes: null,
    });
    expect(codes(unsafeAggregate)).toContain("extension-runtime-incomplete");
  });

  it("accepts valid Darwin runtime bytes and rejects invalid non-addable readings", () => {
    const metric = makeRun({ platform: "darwin" }).metric;
    expect(metric).toMatchObject({ name: "phys_footprint", addable: false });

    const reportFor = (bytes: readonly number[]) =>
      deriveBenchmarkReport({
        repetitions: [
          [makeRun({ platform: "darwin", scrollbackLines: 10_000, metric })],
          [makeRun({ platform: "darwin", scrollbackLines: 0, metric })],
        ],
        runtime: {
          metric,
          windowMs: (bytes.length - 1) * 1000,
          processCount: 1,
          settled: true,
          samples: bytes.map((value, index) => ({
            atMs: index * 1000,
            processes: [{ pid: 1, bytes: value, cpuSeconds: null }],
          })),
        },
      });

    const accepted = reportFor([100, 90, 80]);
    expect(accepted.machine.platform).toBe("darwin");
    expect(accepted.extensionRuntime).toMatchObject({
      steadyBytes: 80,
      growthBytes: -20,
      cpuPercentOneCore: null,
    });
    expect(blockingIssues(integrityIssues(accepted, context()))).toEqual([]);

    for (const invalid of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
      const measured = reportFor([100, invalid, 80]);
      expect(measured.extensionRuntime).toMatchObject({
        steadyBytes: null,
        growthBytes: null,
        cpuPercentOneCore: null,
      });
      expect(integrityIssues(measured, context())).toContainEqual(
        expect.objectContaining({
          code: "extension-runtime-incomplete",
          blocking: true,
        }),
      );
    }
  });

  it("accepts negative growth derived from valid decreasing absolute bytes", () => {
    const measured = reportWithRuntime(
      rawRuntime([
        [
          { pid: 1, bytes: 100, cpuSeconds: 1 },
          { pid: 2, bytes: 40, cpuSeconds: 1 },
        ],
        [
          { pid: 1, bytes: 90, cpuSeconds: 2 },
          { pid: 2, bytes: 35, cpuSeconds: 2 },
        ],
        [
          { pid: 1, bytes: 80, cpuSeconds: 3 },
          { pid: 2, bytes: 30, cpuSeconds: 3 },
        ],
      ]),
    );

    expect(measured.extensionRuntime).toMatchObject({
      steadyBytes: 110,
      growthBytes: -30,
      cpuPercentOneCore: 200,
    });
    expect(blockingIssues(integrityIssues(measured, context()))).toEqual([]);
  });
});
