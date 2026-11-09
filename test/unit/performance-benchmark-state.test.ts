import { describe, expect, it } from "vitest";
import { makeRun, report } from "../fixtures/performance-benchmark-synthetic";
import { integrityIssues } from "../fixtures/performance-benchmark-integrity";
import type { BenchmarkReport } from "../fixtures/performance-benchmark-report";

function codes(measured: BenchmarkReport): string[] {
  return integrityIssues(measured, {
    expectedRepetitions: 1,
    expectedStreams: 3,
    baselinePresent: false,
    compared: false,
    replacing: false,
    skipReasons: [],
  }).map((issue) => issue.code);
}

describe("performance benchmark state admission", () => {
  it("does not let a renamed idle window bypass its required sampling span", () => {
    const run = makeRun();
    const measured = report([
      {
        ...run,
        idle: {
          ...run.idle,
          name: "other",
          samples: run.idle.samples.map((sample, index) => ({
            ...sample,
            atMs: index * 4000,
          })),
        },
      },
      makeRun({ scrollbackLines: 0 }),
    ]);
    expect(codes(measured)).toEqual(
      expect.arrayContaining(["window-name", "window-invalid"]),
    );
  });

  it("rejects CPU scenario focus and visibility mismatches", () => {
    const run = makeRun();
    for (const broken of [
      { ...run.idleCpu[0]!, documentHasFocus: false },
      { ...run.idleCpu[1]!, documentHasFocus: true },
      { ...run.idleCpu[0]!, visibilityState: "hidden" },
    ]) {
      const measured = report([
        {
          ...run,
          idleCpu: run.idleCpu.map((window) =>
            window.name === broken.name ? broken : window,
          ),
        },
        makeRun({ scrollbackLines: 0 }),
      ]);
      expect(codes(measured)).toContain("cpu-window-state");
    }
  });
});
