import { describe, expect, it } from "vitest";
import {
  acceptedReport,
  makeRun,
  report,
} from "../fixtures/performance-benchmark-synthetic";
import { MEBIBYTE, median } from "../fixtures/performance-benchmark-report";
import {
  baselineFrom,
  comparisonRows,
  comparability,
} from "../fixtures/performance-benchmark-baseline";
import {
  LIMITATIONS,
  renderSummary,
} from "../fixtures/performance-benchmark-summary";

describe("performance benchmark report", () => {
  it("derives marginals, idle CPU, latency and totals from raw samples", () => {
    const measured = acceptedReport();
    const full = measured.variants.find(
      (variant) => variant.scrollbackLines > 0,
    )!;
    const repetition = full.repetitions[0]!;
    expect(repetition.marginal.oneToThree.perTab.renderer).toBe(10 * MEBIBYTE);
    expect(repetition.marginal.threeToSix.perTab.renderer).toBe(10 * MEBIBYTE);
    expect(repetition.idleCpuMedianPercent.renderer).toBeCloseTo(2, 5);
    expect(repetition.inputLatency.medianCorrectedMs).toBeCloseTo(11.7, 5);
    expect(repetition.inputLatency.pollCostMedianMs).toBe(0.3);
    expect(measured.extensionRuntime?.steadyBytes).toBe(46 * MEBIBYTE);
    // Arithmetic median: the mean of the two middle values for even counts.
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([3, 1, 2])).toBe(2);
    // Totals contain application roles only.
    const first = repetition.steps[0]!;
    expect(first.totalBytes).toBe(
      (first.roles.main?.steadyBytes ?? 0) +
        (first.roles.renderer?.steadyBytes ?? 0) +
        (first.roles.gpu?.steadyBytes ?? 0),
    );
    expect(first.roles.shell?.steadyBytes ?? 0).toBeGreaterThan(0);
  });

  it("marks impossible raw memory values as incomplete", () => {
    const run = makeRun({ scrollbackLines: 10_000 });
    const invalid = {
      ...run,
      steps: run.steps.map((step) => ({
        ...step,
        samples: step.samples.map((sample) => ({
          ...sample,
          readings: sample.readings.map((reading) =>
            reading.role === "main" ? { ...reading, bytes: -1 } : reading,
          ),
        })),
      })),
    };
    const measured = report([invalid, makeRun({ scrollbackLines: 0 })]);
    const summary = measured.variants.find(
      (variant) => variant.scrollbackLines === 10_000,
    )!.repetitions[0]!.steps[0]!;
    expect(summary.applicationMemoryComplete).toBe(false);
    expect(summary.roles.main?.steadyBytes).toBeNull();
    expect(summary.totalBytes).toBeNull();
  });

  it("excludes fixture shells from application window CPU", () => {
    const run = makeRun({ scrollbackLines: 10_000 });
    const idle = {
      ...run.idle,
      samples: run.idle.samples.map((sample, index) => ({
        ...sample,
        readings: sample.readings.map((reading) =>
          reading.role === "shell"
            ? { ...reading, cpuSeconds: index * 100 }
            : reading,
        ),
      })),
    };
    const measured = report([
      { ...run, idle },
      makeRun({ scrollbackLines: 0 }),
    ]);
    expect(
      measured.variants[0]!.repetitions[0]!.idle.totalCpuPercentOneCore,
    ).toBeCloseTo(0);
  });

  it("compares the median of per-window application CPU totals", () => {
    const run = makeRun({ scrollbackLines: 10_000 });
    const idleCpu = run.idleCpu.map((window, index) => ({
      ...window,
      samples: window.samples.map((sample, sampleIndex) => ({
        ...sample,
        atMs: sampleIndex * 4000,
        readings: sample.readings.map((reading) => ({
          ...reading,
          cpuSeconds:
            sampleIndex === 1 &&
            reading.role === ["main", "renderer", "gpu"][index]
              ? 0.4
              : 0,
        })),
      })),
    }));
    const measured = report([
      { ...run, idleCpu },
      makeRun({ scrollbackLines: 0 }),
    ]);
    const baseline = baselineFrom(measured, "c".repeat(40), "linux-arm64");
    const row = comparisonRows(measured, baseline).find(
      (entry) =>
        entry.family === "idle CPU total" && entry.scenario === "10000 lines",
    )!;
    expect(row.candidateMedian).toBeCloseTo(10);
  });

  it("reports every repetition individually, in order", () => {
    const measured = report(
      [],
      [
        [
          makeRun({ scrollbackLines: 10_000 }),
          makeRun({ scrollbackLines: 10_000 }),
        ],
        [makeRun({ scrollbackLines: 0 }), makeRun({ scrollbackLines: 0 })],
      ],
    );
    const full = measured.variants[0]!;
    expect(full.repetitions.map((repetition) => repetition.index)).toEqual([
      1, 2,
    ]);
    const summary = renderSummary(measured, {
      issues: [],
      baseline: null,
      comparison: [],
      comparabilityReasons: [],
    });
    expect(summary).toContain("2 repetitions");
    // Every repetition has its own row: no aggregate replaces an observation.
    expect(summary).toContain("| one | 1 |");
    expect(summary).toContain("| one | 2 |");
  });

  it("retains each stream observer cost and uses the final group endpoint", () => {
    const run = makeRun({ scrollbackLines: 10_000 });
    const first = run.attribution[0]!;
    const streams = first.streams!.map((stream, index) => ({
      ...stream,
      pollCostMs: index + 1,
    }));
    const endpoint = first.streamEnds!.at(-1)!;
    const final = {
      ...endpoint,
      atMs: 1000,
      readings: endpoint.readings.map((reading) => ({
        ...reading,
        cpuSeconds: reading.cpuSeconds === null ? null : 1.1,
      })),
    };
    const measured = report([
      {
        ...run,
        attribution: [
          {
            ...first,
            streams,
            streamEnds: [first.streamEnds![0]!, first.streamEnds![1]!, final],
          },
          ...run.attribution.slice(1),
        ],
      },
      makeRun({ scrollbackLines: 0 }),
    ]);
    const group = measured.variants[0]!.repetitions[0]!.attribution[0]!;
    expect(group.streams).toMatchObject([
      { pollCostMs: 1 },
      { pollCostMs: 2 },
      { pollCostMs: 3 },
    ]);
    expect(group.totalCpuPercentOneCore).toBeCloseTo(300);
  });

  it("keeps peaks above the settled floors of the same repetition", () => {
    const measured = report([
      makeRun({ scrollbackLines: 10_000, peakExtra: 30 * MEBIBYTE }),
      makeRun({ scrollbackLines: 0 }),
    ]);
    const repetition = measured.variants[0]!.repetitions[0]!;
    const ascii = repetition.attribution.find(
      (entry) => entry.name === "ascii",
    )!;
    const renderer = ascii.roles.renderer;
    expect(renderer.peakBytes! - renderer.beforeBytes!).toBeGreaterThanOrEqual(
      30 * MEBIBYTE,
    );
    expect(renderer.retainedBytes).toBe(0);
  });

  it("keeps the recorded baseline free of host-identifying strings and stores per-repetition values", () => {
    const baseline = baselineFrom(
      acceptedReport(),
      "c".repeat(40),
      "linux-arm64",
    );
    const serialised = JSON.stringify(baseline);
    expect(serialised).not.toContain("virgl");
    expect(serialised).not.toContain("Synthetic CPU");
    expect(serialised).not.toContain("test-release");
    expect(serialised).not.toContain("totalMemoryBytes");
    expect(baseline.machine.gpuClass).toBe("virtualized");
    expect(baseline.machine.identityHash).toMatch(/^[a-f0-9]{16}$/u);
    expect(baseline.identity.grid).toBeDefined();
    expect(baseline.sourceCommit).toBe("c".repeat(40));
    for (const variant of Object.values(baseline.variants))
      for (const repetition of variant.repetitions) {
        expect(repetition.steps.one).toBeDefined();
        expect(repetition.marginal.oneToThree).toBeDefined();
        expect(repetition.idle.growthBytes).toBeDefined();
        expect(repetition.idleCpuMedianPercent).toBeDefined();
        expect(repetition.streams.map((stream) => stream.name)).toEqual([
          "ascii",
          "variety",
          "deep-history",
        ]);
        expect(repetition.latency.medianCorrectedMs).not.toBeNull();
      }
  });
});

describe("performance benchmark comparison", () => {
  it("retains and displays every named CPU and post-history window", () => {
    const measured = acceptedReport();
    const baseline = baselineFrom(measured, "c".repeat(40), "linux-arm64");
    const repetition = baseline.variants["10000"]!.repetitions[0]!;
    expect(repetition).toMatchObject({
      idleCpuWindows: [
        { name: "blink-off-focused" },
        { name: "blink-off-unfocused" },
        { name: "blink-on-focused" },
        { name: "blink-on-unfocused" },
      ],
      quiet: { name: "sitting-still-after-history" },
    });
    const summary = renderSummary(measured, {
      issues: [],
      baseline: null,
      comparison: [],
      comparabilityReasons: [],
    });
    expect(summary).toContain("blink-off-unfocused");
    expect(summary).toContain("sitting-still-after-history");
  });

  it("prints candidate and baseline side by side without any verdict", () => {
    const accepted = acceptedReport();
    const baseline = baselineFrom(accepted, "c".repeat(40), "linux-arm64");
    const repeat = report([
      makeRun({ scrollbackLines: 10_000 }),
      makeRun({ scrollbackLines: 0 }),
    ]);
    const verdict = comparability(repeat, baseline, "linux-arm64");
    expect(verdict).toEqual({ comparable: true, reasons: [] });
    const rows = comparisonRows(repeat, baseline);
    expect(rows.some((row) => row.family === "step steady")).toBe(true);
    // Reference-zero families have no percentage; everything else matches.
    expect(
      rows
        .filter(
          (row) => row.baselineMedian !== null && row.baselineMedian !== 0,
        )
        .every((row) => row.deltaPercent === 0),
    ).toBe(true);
    expect(rows.some((row) => row.deltaPercent === 0)).toBe(true);
    const summary = renderSummary(repeat, {
      issues: [],
      baseline,
      comparison: rows,
      comparabilityReasons: [],
    });
    expect(summary).toContain("Comparison with the recorded baseline");
    expect(summary).toContain("no limit is applied and no verdict follows");
    expect(summary).not.toMatch(/\bPASS\b/u);
    expect(summary).not.toMatch(/\bFAIL\b/u);
    expect(summary).toContain("This run measures");
  });

  it("reports incomplete stream rates as unavailable with their valid counts", () => {
    const baseline = baselineFrom(
      acceptedReport(),
      "c".repeat(40),
      "linux-arm64",
    );
    const run = makeRun({ scrollbackLines: 10_000 });
    const first = run.attribution[0]!;
    const streams = first.streams!.map((stream, index) =>
      index === 0 ? { ...stream, found: false } : stream,
    );
    const measured = report([
      {
        ...run,
        attribution: [{ ...first, streams }, ...run.attribution.slice(1)],
      },
      makeRun({ scrollbackLines: 0 }),
    ]);
    const rows = comparisonRows(measured, baseline);
    const row = rows.find(
      (entry) =>
        entry.family === "stream rate" &&
        entry.scenario === "10000 lines / ascii",
    )!;
    expect(row.candidateMedian).toBeNull();
    const summary = renderSummary(measured, {
      issues: [],
      baseline,
      comparison: rows,
      comparabilityReasons: [],
    });
    expect(summary).toContain("2/3 streams");
  });

  it("does not compare different machine identities with the same class", () => {
    const measured = acceptedReport();
    const baseline = baselineFrom(measured, "c".repeat(40), "linux-arm64");
    const changed = {
      ...measured,
      machine: { ...measured.machine, identityHash: "different" },
    };
    const verdict = comparability(changed, baseline, "linux-arm64");
    expect(verdict.comparable).toBe(false);
    expect(verdict.reasons.join(" ")).toContain("machine identity");
    expect(
      comparability(
        {
          ...measured,
          identity: { ...measured.identity, build: { main: "different" } },
        },
        baseline,
        "linux-arm64",
      ).comparable,
    ).toBe(true);
  });

  it("refuses to print a comparison when the baseline is not comparable", () => {
    const accepted = acceptedReport();
    const baseline = baselineFrom(accepted, "c".repeat(40), "linux-arm64");
    const other = report([
      makeRun({
        scrollbackLines: 10_000,
        grid: { columns: 120, rows: 35, cellWidth: 8, cellHeight: 16 },
      }),
      makeRun({ scrollbackLines: 0 }),
    ]);
    const verdict = comparability(other, baseline, "linux-arm64");
    expect(verdict.comparable).toBe(false);
    expect(verdict.reasons.join(" ")).toContain("renderer grid differs");
    const summary = renderSummary(other, {
      issues: [],
      baseline,
      comparison: [],
      comparabilityReasons: verdict.reasons,
    });
    expect(summary).toContain("Not comparable");
    expect(summary).not.toContain("candidate median");
  });

  it("labels memory, input and grouped stream observations accurately", () => {
    const summary = renderSummary(acceptedReport(), {
      issues: [],
      baseline: null,
      comparison: [],
      comparabilityReasons: [],
    });
    expect(summary).not.toContain("Resident memory");
    expect(summary).not.toContain("main-process parse");
    expect(summary).toContain("renderer grid");
    expect(summary).toContain("group renderer peak");
  });

  it("states every limitation a reader needs to predict a miss", () => {
    const measured = acceptedReport();
    const summary = renderSummary(measured, {
      issues: [],
      baseline: null,
      comparison: [],
      comparabilityReasons: [],
    });
    for (const limitation of LIMITATIONS) expect(summary).toContain(limitation);
    expect(summary).toContain("does not decide whether a number is acceptable");
    expect(summary).toContain("repaint counter");
    expect(summary).toContain("ten thousand retained lines per tab");
  });
});
