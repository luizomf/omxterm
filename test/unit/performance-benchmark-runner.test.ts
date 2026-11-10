import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import {
  baselineFrom,
  baselinePreflight,
  isBaseline,
} from "../fixtures/performance-benchmark-baseline";
import {
  acceptedReport,
  makeRun as syntheticRun,
  METRIC,
  report,
} from "../fixtures/performance-benchmark-synthetic";

const launch = vi.hoisted(() => vi.fn());
vi.mock(
  "../fixtures/performance-benchmark-session",
  async (importOriginal) => ({
    ...(await importOriginal<
      typeof import("../fixtures/performance-benchmark-session")
    >()),
    runVariant: launch,
    runExtensionRuntime: launch,
  }),
);
import {
  profileFor,
  runAndEvaluate,
} from "../fixtures/performance-benchmark-run";

import { PERFORMANCE_BENCHMARK_PROTOCOL } from "../fixtures/performance-benchmark-workload";

// The real runner selects its protocol; generic synthetic reports use a fake ID.
const makeRun = (options: Parameters<typeof syntheticRun>[0] = {}) => ({
  ...syntheticRun(options),
  protocol: PERFORMANCE_BENCHMARK_PROTOCOL,
});

const REFERENCE_BUILD = {
  runtimeIndex: "a".repeat(64),
  runtimePackages: "b".repeat(64),
  runtimeBootstrap: "c".repeat(64),
  runtimeLeases: "d".repeat(64),
};
let root = "";

afterEach(async () => {
  if (root) await rm(root, { recursive: true, force: true });
  launch.mockReset();
});

it("admits the committed Linux reference through the baseline preflight", async () => {
  const baseline: unknown = JSON.parse(
    await readFile("test/performance/baseline.linux-arm64.json", "utf8"),
  );
  expect(isBaseline(baseline)).toBe(true);
  if (!isBaseline(baseline)) throw new Error("baseline header is invalid");
  expect(baselinePreflight(baseline, [10_000, 0])).toBeNull();
});

it("rejects a malformed current baseline before launching a native workload", async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "perf-preflight-"));
  const baselinePath = path.join(root, "baseline.json");
  const baseline = baselineFrom(
    acceptedReport(),
    "c".repeat(40),
    "linux-arm64",
  );
  await writeFile(baselinePath, JSON.stringify({ ...baseline, variants: {} }));
  await expect(runAndEvaluate({ scratch: root, baselinePath })).rejects.toThrow(
    /baseline/i,
  );
  expect(launch).not.toHaveBeenCalled();
});

it("refuses dirty baseline recording before launching a native workload", async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "perf-preflight-"));
  await expect(
    runAndEvaluate({
      scratch: root,
      baselinePath: path.join(root, "baseline.json"),
      recordBaseline: {
        sourceCommit: "c".repeat(40),
        cleanTree: false,
        replace: false,
      },
    }),
  ).rejects.toThrow(/commit tracked changes/i);
  expect(launch).not.toHaveBeenCalled();
});

it("refuses invalid raw observations and records a valid run at the real runner boundary", async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "perf-record-"));
  const baselinePath = path.join(root, "baseline.json");
  let invalid = true;
  launch.mockImplementation(async (options: { scrollbackLines?: number }) =>
    options.scrollbackLines === undefined
      ? {
          metric: METRIC,
          windowMs: 1000,
          processCount: 1,
          settled: true,
          samples: [
            { atMs: 0, processes: [{ pid: 1, bytes: 20, cpuSeconds: 0 }] },
            { atMs: 1000, processes: [{ pid: 1, bytes: 20, cpuSeconds: 0 }] },
          ],
          build: REFERENCE_BUILD,
        }
      : makeRun({
          scrollbackLines: options.scrollbackLines,
          streamFound: !invalid,
        }),
  );
  const request = {
    scratch: root,
    baselinePath,
    repetitions: 1,
    recordBaseline: {
      sourceCommit: "c".repeat(40),
      cleanTree: true,
      replace: false,
    },
  };
  await expect(runAndEvaluate(request)).rejects.toThrow(/stream-incomplete/i);
  await expect(readFile(baselinePath)).rejects.toMatchObject({
    code: "ENOENT",
  });
  invalid = false;
  const outcome = await runAndEvaluate(request);
  expect(outcome.recorded).toBe(true);
  const raw = JSON.parse(await readFile(outcome.artifacts.rawPath, "utf8")) as {
    repetitions: unknown[][];
    runtime: unknown;
  };
  expect(raw.repetitions.map((runs) => runs.length)).toEqual([1, 1]);
  expect(raw.runtime).not.toBeNull();
  expect(
    (
      JSON.parse(await readFile(baselinePath, "utf8")) as {
        sourceCommit: string;
      }
    ).sourceCommit,
  ).toBe("c".repeat(40));
  launch.mockClear();
  await expect(runAndEvaluate(request)).rejects.toThrow(/--replace/i);
  expect(launch).not.toHaveBeenCalled();
});

it("reports invalid runtime bytes without suppressing report-only baseline comparisons", async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "perf-runtime-integrity-"));
  const baselinePath = path.join(root, "baseline.json");
  const platformRuns = [
    makeRun({
      platform: process.platform,
      arch: process.arch,
      scrollbackLines: 10_000,
    }),
    makeRun({
      platform: process.platform,
      arch: process.arch,
      scrollbackLines: 0,
    }),
  ];
  const baseline = baselineFrom(
    report(platformRuns),
    "c".repeat(40),
    profileFor(process.platform, process.arch).key,
  );
  expect(baselinePreflight(baseline, [10_000, 0])).toBeNull();
  await writeFile(baselinePath, JSON.stringify(baseline));

  launch.mockImplementation(async (options: { scrollbackLines?: number }) =>
    options.scrollbackLines === undefined
      ? {
          metric: METRIC,
          windowMs: 2000,
          processCount: 2,
          settled: true,
          build: REFERENCE_BUILD,
          samples: [
            {
              atMs: 0,
              processes: [
                { pid: 1, bytes: -1, cpuSeconds: 0 },
                { pid: 2, bytes: 101, cpuSeconds: 0 },
              ],
            },
            {
              atMs: 2000,
              processes: [
                { pid: 1, bytes: -1, cpuSeconds: 1 },
                { pid: 2, bytes: 101, cpuSeconds: 1 },
              ],
            },
          ],
        }
      : makeRun({
          scrollbackLines: options.scrollbackLines,
          platform: process.platform,
          arch: process.arch,
        }),
  );

  const outcome = await runAndEvaluate({
    scratch: root,
    baselinePath,
    repetitions: 1,
  });

  expect(outcome.comparabilityReasons).toEqual([]);
  expect(outcome.report.extensionRuntime).toMatchObject({
    steadyBytes: null,
    growthBytes: null,
  });
  expect(outcome.issues).toContainEqual(
    expect.objectContaining({
      code: "extension-runtime-incomplete",
      blocking: true,
    }),
  );
  expect(
    outcome.comparison.find((row) => row.family === "extension runtime steady"),
  ).toMatchObject({
    candidateMedian: null,
  });
  expect(
    outcome.comparison.find((row) => row.family === "extension runtime steady")
      ?.baselineMedian,
  ).toBeGreaterThan(0);
});

it("allows explicit replacement of an unreadable baseline after a valid run", async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "perf-replace-"));
  const baselinePath = path.join(root, "baseline.json");
  await writeFile(baselinePath, "{");
  launch.mockImplementation(async (options: { scrollbackLines?: number }) =>
    options.scrollbackLines === undefined
      ? {
          metric: METRIC,
          windowMs: 1000,
          processCount: 1,
          settled: true,
          samples: [
            { atMs: 0, processes: [{ pid: 1, bytes: 20, cpuSeconds: 0 }] },
            { atMs: 1000, processes: [{ pid: 1, bytes: 20, cpuSeconds: 0 }] },
          ],
          build: REFERENCE_BUILD,
        }
      : makeRun({ scrollbackLines: options.scrollbackLines }),
  );
  const outcome = await runAndEvaluate({
    scratch: root,
    baselinePath,
    repetitions: 1,
    recordBaseline: {
      sourceCommit: "c".repeat(40),
      cleanTree: true,
      replace: true,
    },
  });
  expect(outcome.recorded).toBe(true);
  expect(
    (JSON.parse(await readFile(baselinePath, "utf8")) as { schema: number })
      .schema,
  ).toBe(5);
});

it("preflights missing baseline machine and version metadata", async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "perf-preflight-"));
  const baselinePath = path.join(root, "baseline.json");
  const baseline = baselineFrom(
    acceptedReport(),
    "c".repeat(40),
    "linux-arm64",
  );
  for (const broken of [
    { ...baseline, versions: undefined },
    { ...baseline, machine: { ...baseline.machine, platform: undefined } },
    { ...baseline, identity: { ...baseline.identity, applied: null } },
    { ...baseline, metric: { ...baseline.metric, source: undefined } },
    {
      ...baseline,
      identity: { ...baseline.identity, grid: { "tab-0": null } },
    },
  ]) {
    await writeFile(baselinePath, JSON.stringify(broken));
    await expect(
      runAndEvaluate({ scratch: root, baselinePath }),
    ).rejects.toThrow(/baseline/i);
    expect(launch).not.toHaveBeenCalled();
  }
});

it("preflights an omitted optional-latency field rather than crashing comparison", async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "perf-preflight-"));
  const baselinePath = path.join(root, "baseline.json");
  const baseline = baselineFrom(
    acceptedReport(),
    "c".repeat(40),
    "linux-arm64",
  );
  const variant = baseline.variants["0"]!;
  const repetition = variant.repetitions[0]!;
  const latency = { ...repetition.latency, medianGridToDrawMs: undefined };
  await writeFile(
    baselinePath,
    JSON.stringify({
      ...baseline,
      variants: {
        ...baseline.variants,
        "0": { ...variant, repetitions: [{ ...repetition, latency }] },
      },
    }),
  );
  await expect(runAndEvaluate({ scratch: root, baselinePath })).rejects.toThrow(
    /baseline/i,
  );
  expect(launch).not.toHaveBeenCalled();
});

it("preflights required nested geometry and idle CPU data", async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "perf-preflight-"));
  const baselinePath = path.join(root, "baseline.json");
  const baseline = baselineFrom(
    acceptedReport(),
    "c".repeat(40),
    "linux-arm64",
  );
  const variant = baseline.variants["0"]!;
  const repetition = variant.repetitions[0]!;
  for (const broken of [
    {
      ...baseline,
      identity: { ...baseline.identity, requestedContentSize: null },
    },
    {
      ...baseline,
      variants: {
        ...baseline.variants,
        "0": {
          ...variant,
          repetitions: [
            {
              ...repetition,
              idle: { ...repetition.idle, cpuPercentOneCore: null },
            },
          ],
        },
      },
    },
  ]) {
    await writeFile(baselinePath, JSON.stringify(broken));
    await expect(
      runAndEvaluate({ scratch: root, baselinePath }),
    ).rejects.toThrow(/baseline/i);
    expect(launch).not.toHaveBeenCalled();
  }
});

it("preflights missing measured artifact provenance before launching", async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "perf-preflight-"));
  const baselinePath = path.join(root, "baseline.json");
  const baseline = baselineFrom(
    acceptedReport(),
    "c".repeat(40),
    "linux-arm64",
  );
  await writeFile(
    baselinePath,
    JSON.stringify({
      ...baseline,
      identity: { ...baseline.identity, build: {} },
    }),
  );
  await expect(runAndEvaluate({ scratch: root, baselinePath })).rejects.toThrow(
    /baseline/i,
  );
  expect(launch).not.toHaveBeenCalled();
});

it("preflights a corrupt declared stream size before launching", async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "perf-preflight-"));
  const baselinePath = path.join(root, "baseline.json");
  const baseline = baselineFrom(
    acceptedReport(),
    "c".repeat(40),
    "linux-arm64",
  );
  const variant = baseline.variants["0"]!;
  const repetition = variant.repetitions[0]!;
  const streams = repetition.streams.map((stream, index) =>
    index === 0 ? { ...stream, expectedBytes: 1 } : stream,
  );
  await writeFile(
    baselinePath,
    JSON.stringify({
      ...baseline,
      variants: {
        ...baseline.variants,
        "0": { ...variant, repetitions: [{ ...repetition, streams }] },
      },
    }),
  );
  await expect(runAndEvaluate({ scratch: root, baselinePath })).rejects.toThrow(
    /baseline/i,
  );
  expect(launch).not.toHaveBeenCalled();
});

it("preflights malformed optional CPU fields on non-Linux baselines", async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "perf-preflight-"));
  const baselinePath = path.join(root, "baseline.json");
  const original = baselineFrom(
    acceptedReport(),
    "c".repeat(40),
    "darwin-arm64",
  );
  const baseline = {
    ...original,
    machine: { ...original.machine, platform: "darwin" },
  };
  const variant = baseline.variants["0"]!;
  const repetition = variant.repetitions[0]!;
  for (const broken of [
    { ...repetition, idleCpuTotalMedianPercent: undefined },
    {
      ...repetition,
      idleCpuMedianPercent: {
        ...repetition.idleCpuMedianPercent,
        renderer: "bad",
      },
    },
    { ...repetition, idle: { ...repetition.idle, cpuPercentOneCore: {} } },
    {
      ...repetition,
      idleCpuWindows: repetition.idleCpuWindows.map((window) => ({
        ...window,
        totalCpuPercentOneCore: "bad",
      })),
    },
  ]) {
    await writeFile(
      baselinePath,
      JSON.stringify({
        ...baseline,
        variants: {
          ...baseline.variants,
          "0": { ...variant, repetitions: [broken] },
        },
      }),
    );
    await expect(
      runAndEvaluate({ scratch: root, baselinePath }),
    ).rejects.toThrow(/baseline/i);
    expect(launch).not.toHaveBeenCalled();
  }
});

it("preflights an extra stream group before launching", async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "perf-preflight-"));
  const baselinePath = path.join(root, "baseline.json");
  const baseline = baselineFrom(
    acceptedReport(),
    "c".repeat(40),
    "linux-arm64",
  );
  const variant = baseline.variants["0"]!;
  const repetition = variant.repetitions[0]!;
  const streams = [...repetition.streams, repetition.streams[0]!];
  await writeFile(
    baselinePath,
    JSON.stringify({
      ...baseline,
      variants: {
        ...baseline.variants,
        "0": { ...variant, repetitions: [{ ...repetition, streams }] },
      },
    }),
  );
  await expect(runAndEvaluate({ scratch: root, baselinePath })).rejects.toThrow(
    /baseline/i,
  );
  expect(launch).not.toHaveBeenCalled();
});

it("preflights an unavailable Linux stream-group CPU before launching", async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "perf-preflight-"));
  const baselinePath = path.join(root, "baseline.json");
  const baseline = baselineFrom(
    acceptedReport(),
    "c".repeat(40),
    "linux-arm64",
  );
  const variant = baseline.variants["0"]!;
  const repetition = variant.repetitions[0]!;
  const streams = repetition.streams.map((stream, index) =>
    index === 0 ? { ...stream, cpuPercentOneCore: null } : stream,
  );
  await writeFile(
    baselinePath,
    JSON.stringify({
      ...baseline,
      variants: {
        ...baseline.variants,
        "0": { ...variant, repetitions: [{ ...repetition, streams }] },
      },
    }),
  );
  await expect(runAndEvaluate({ scratch: root, baselinePath })).rejects.toThrow(
    /baseline/i,
  );
  expect(launch).not.toHaveBeenCalled();
});

it("preflights corrupt named CPU windows before launching", async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "perf-preflight-"));
  const baselinePath = path.join(root, "baseline.json");
  const baseline = baselineFrom(
    acceptedReport(),
    "c".repeat(40),
    "linux-arm64",
  );
  const variant = baseline.variants["0"]!;
  const repetition = variant.repetitions[0]!;
  const broken = {
    ...baseline,
    variants: {
      ...baseline.variants,
      "0": {
        ...variant,
        repetitions: [{ ...repetition, idleCpuWindows: [{}, {}, {}, {}] }],
      },
    },
  };
  await writeFile(baselinePath, JSON.stringify(broken));
  await expect(runAndEvaluate({ scratch: root, baselinePath })).rejects.toThrow(
    /baseline/i,
  );
  expect(launch).not.toHaveBeenCalled();
});

it("preflights a missing scrollback pair before launching", async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "perf-preflight-"));
  const baselinePath = path.join(root, "baseline.json");
  const baseline = baselineFrom(
    acceptedReport(),
    "c".repeat(40),
    "linux-arm64",
  );
  await writeFile(
    baselinePath,
    JSON.stringify({
      ...baseline,
      scrollbackPair: { emptyLines: 0, fullLines: 10000 },
    }),
  );
  await expect(runAndEvaluate({ scratch: root, baselinePath })).rejects.toThrow(
    /baseline/i,
  );
  expect(launch).not.toHaveBeenCalled();
});

it("preflights missing measurement fields inside a current baseline repetition", async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "perf-preflight-"));
  const baselinePath = path.join(root, "baseline.json");
  const baseline = baselineFrom(
    acceptedReport(),
    "c".repeat(40),
    "linux-arm64",
  );
  const original = baseline.variants["0"]!;
  const broken = {
    ...baseline,
    variants: {
      ...baseline.variants,
      "0": { ...original, repetitions: [{ index: 1 }] },
    },
  };
  await writeFile(baselinePath, JSON.stringify(broken));
  await expect(runAndEvaluate({ scratch: root, baselinePath })).rejects.toThrow(
    /baseline/i,
  );
  expect(launch).not.toHaveBeenCalled();
});

it("preflights malformed JSON, missing nested identity and missing repetitions", async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "perf-preflight-"));
  const baselinePath = path.join(root, "baseline.json");
  const baseline = baselineFrom(
    acceptedReport(),
    "c".repeat(40),
    "linux-arm64",
  );
  for (const text of [
    "{",
    JSON.stringify({ ...baseline, identity: {} }),
    JSON.stringify({
      ...baseline,
      variants: {
        ...baseline.variants,
        "0": { scrollbackLines: 0, repetitions: [] },
      },
    }),
  ]) {
    await writeFile(baselinePath, text);
    await expect(
      runAndEvaluate({ scratch: root, baselinePath }),
    ).rejects.toThrow(/baseline/i);
    expect(launch).not.toHaveBeenCalled();
  }
});
