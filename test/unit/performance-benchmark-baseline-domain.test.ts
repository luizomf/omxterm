import { describe, expect, it } from "vitest";
import {
  baselineFrom,
  baselinePreflight,
  type BenchmarkBaseline,
} from "../fixtures/performance-benchmark-baseline";
import { acceptedReport } from "../fixtures/performance-benchmark-synthetic";

function baseline(): BenchmarkBaseline {
  return baselineFrom(acceptedReport(), "c".repeat(40), "linux-arm64");
}

function reject(mutator: (stored: BenchmarkBaseline) => void) {
  const stored = structuredClone(baseline());
  mutator(stored);
  expect(baselinePreflight(stored, [10_000, 0])).not.toBeNull();
}

describe("stored benchmark reference value domains", () => {
  it.each([-1, 1.5, Number.MAX_SAFE_INTEGER + 1])(
    "rejects invalid absolute step memory: %s",
    (steadyBytes) =>
      reject((stored) => {
        const repetition = stored.variants["10000"]!.repetitions[0]!;
        Object.assign(repetition.steps.one!.roles.main!, { steadyBytes });
      }),
  );

  it("rejects negative totals, stream peaks and runtime steady memory", () => {
    reject((stored) => {
      const repetition = stored.variants["10000"]!.repetitions[0]!;
      Object.assign(repetition.steps.one!, { totalBytes: -1 });
    });
    reject((stored) => {
      const repetition = stored.variants["10000"]!.repetitions[0]!;
      Object.assign(repetition.streams[0]!.peaks, { renderer: -1 });
    });
    reject((stored) => {
      Object.assign(stored.extensionRuntime!, { steadyBytes: -1 });
    });
  });

  it("rejects fractional delivered stream byte counts", () =>
    reject((stored) => {
      const repetition = stored.variants["10000"]!.repetitions[0]!;
      const streams = repetition.streams.map((stream, index) =>
        index === 0
          ? {
              ...stream,
              bytes: stream.bytes.map((value, byteIndex) =>
                byteIndex === 0 ? stream.expectedBytes + 0.5 : value,
              ),
            }
          : stream,
      );
      Object.assign(repetition, { streams });
    }));

  it("rejects negative stored stream and runtime CPU percentages", () => {
    reject((stored) => {
      const repetition = stored.variants["10000"]!.repetitions[0]!;
      Object.assign(repetition.streams[0]!, { cpuPercentOneCore: -0.1 });
    });
    reject((stored) => {
      Object.assign(stored.extensionRuntime!, { cpuPercentOneCore: -0.1 });
    });
    reject((stored) => {
      const repetition = stored.variants["10000"]!.repetitions[0]!;
      Object.assign(repetition.idle.cpuPercentOneCore, { renderer: -0.1 });
    });
    reject((stored) => {
      const repetition = stored.variants["10000"]!.repetitions[0]!;
      Object.assign(repetition.idleCpuWindows[0]!.cpuPercentOneCore, {
        renderer: -0.1,
      });
    });
  });

  it("keeps optional unavailable CPU values admissible", () => {
    const stored = baseline();
    Object.assign(stored.machine, { platform: "darwin" });
    Object.assign(stored.variants["10000"]!.repetitions[0]!.streams[0]!, {
      cpuPercentOneCore: null,
    });
    expect(baselinePreflight(stored, [10_000, 0])).toBeNull();
  });

  it("preserves fractional per-tab marginals and negative memory growth", () => {
    const stored = baseline();
    const repetition = stored.variants["10000"]!.repetitions[0]!;
    Object.assign(repetition.marginal.oneToThree.perTab, { renderer: 0.5 });
    Object.assign(repetition.idle.growthBytes, { renderer: -1 });
    Object.assign(repetition.streams[0]!.retained, { renderer: -1 });
    Object.assign(stored.extensionRuntime!, { growthBytes: -1 });
    expect(baselinePreflight(stored, [10_000, 0])).toBeNull();
  });
});
