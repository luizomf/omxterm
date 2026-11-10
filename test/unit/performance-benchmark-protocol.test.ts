import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import { baselineFrom } from "../fixtures/performance-benchmark-baseline";
import {
  makeRun as syntheticRun,
  METRIC,
  PROTOCOL as SYNTHETIC_PROTOCOL,
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

it.each([
  [
    "later repetition",
    1,
    "application-tabs-scrollback-idle-input-attribution:0123456789ab",
  ],
  [
    "later variant",
    2,
    "application-tabs-scrollback-idle-input-attribution:0123456789ab",
  ],
  ["missing later repetition", 1, undefined],
  ["missing later variant", 3, undefined],
  ["null ID", 1, null],
  ["numeric ID", 2, 123],
  ["object ID", 1, { privateValue: "do not echo this" }],
  ["empty ID", 3, ""],
  ["malformed ID", 1, "private-value\nnot-a-protocol"],
  ["all matching but not selected", -1, SYNTHETIC_PROTOCOL],
] as const)(
  "refuses %s before comparison or reference writes",
  async (_label, changedIndex, protocol) => {
    root = await mkdtemp(path.join(os.tmpdir(), "perf-protocol-"));
    const baselinePath = path.join(root, "baseline.json");
    const runs = [10_000, 0].map((scrollbackLines) =>
      makeRun({
        scrollbackLines,
        platform: process.platform,
        arch: process.arch,
      }),
    );
    const baselineText = JSON.stringify(
      baselineFrom(
        report(runs),
        "c".repeat(40),
        profileFor(process.platform, process.arch).key,
      ),
    );
    await writeFile(baselinePath, baselineText);
    const observations = [runs[0]!, runs[0]!, runs[1]!, runs[1]!].map(
      (run, index) =>
        index === changedIndex || changedIndex === -1
          ? { ...run, protocol }
          : run,
    );
    const runtime = {
      metric: METRIC,
      windowMs: 1000,
      processCount: 1,
      settled: true,
      build: REFERENCE_BUILD,
      samples: [
        { atMs: 0, processes: [{ pid: 1, bytes: 20, cpuSeconds: 0 }] },
        { atMs: 1000, processes: [{ pid: 1, bytes: 20, cpuSeconds: 0 }] },
      ],
    };
    // Check ordinary report mode, replacement, and first recording independently.
    for (const mode of ["report", "replace", "create"]) {
      if (mode === "create") await rm(baselinePath);
      for (const run of observations) launch.mockResolvedValueOnce(run);
      launch.mockResolvedValueOnce(runtime);
      const artifactsDirectory = path.join(root, mode);
      const firstInvalid = changedIndex === -1 ? 0 : changedIndex;
      const message = `Invalid benchmark protocol at variant ${Math.floor(firstInvalid / 2) + 1}, repetition ${(firstInvalid % 2) + 1}: observation does not match the selected runner protocol`;
      await expect(
        runAndEvaluate({
          scratch: root,
          baselinePath,
          repetitions: 2,
          artifactsDirectory,
          ...(mode === "report"
            ? {}
            : {
                recordBaseline: {
                  sourceCommit: "c".repeat(40),
                  cleanTree: true,
                  replace: mode === "replace",
                },
              }),
        }),
      ).rejects.toThrow(message);
      if (mode === "create") {
        await expect(readFile(baselinePath)).rejects.toMatchObject({
          code: "ENOENT",
        });
      } else {
        expect(await readFile(baselinePath, "utf8")).toBe(baselineText);
      }
      const raw: unknown = JSON.parse(
        await readFile(
          path.join(artifactsDirectory, "raw-observations.json"),
          "utf8",
        ),
      );
      expect(raw).toEqual(
        JSON.parse(
          JSON.stringify({
            repetitions: [observations.slice(0, 2), observations.slice(2)],
            runtime,
          }),
        ),
      );
      const failure: unknown = JSON.parse(
        await readFile(path.join(artifactsDirectory, "failure.json"), "utf8"),
      );
      expect(failure).toEqual({
        status: "fixture-failed",
        stage: "measurement",
        error: `Error: ${message}`,
      });
      await expect(
        readFile(path.join(artifactsDirectory, "report.json")),
      ).rejects.toMatchObject({ code: "ENOENT" });
      await expect(
        readFile(path.join(artifactsDirectory, "summary.md")),
      ).rejects.toMatchObject({ code: "ENOENT" });
    }
  },
);

it.each([0, 1, 4])(
  "retains a generic launch failure after %i valid observations",
  async (completedCount) => {
    root = await mkdtemp(path.join(os.tmpdir(), "perf-launch-prefix-"));
    const baselinePath = path.join(root, "baseline.json");
    const runs = [10_000, 10_000, 0, 0]
      .slice(0, completedCount)
      .map((scrollbackLines) => makeRun({ scrollbackLines }));
    for (const run of runs) launch.mockResolvedValueOnce(run);
    launch.mockRejectedValueOnce(new Error("synthetic launch failure"));
    await expect(
      runAndEvaluate({ scratch: root, baselinePath, repetitions: 2 }),
    ).rejects.toThrow("synthetic launch failure");
    expect(launch).toHaveBeenCalledTimes(completedCount + 1);
    const artifacts = path.join(root, "artifacts");
    const raw: unknown = JSON.parse(
      await readFile(path.join(artifacts, "raw-observations.json"), "utf8"),
    );
    expect(raw).toEqual({
      repetitions:
        completedCount < 2 ? [runs] : [runs.slice(0, 2), runs.slice(2)],
      runtime: null,
    });
    const failure: unknown = JSON.parse(
      await readFile(path.join(artifacts, "failure.json"), "utf8"),
    );
    expect(failure).toEqual({
      status: "fixture-failed",
      stage: "measurement",
      error: "Error: synthetic launch failure",
    });
    await expect(readFile(baselinePath)).rejects.toMatchObject({
      code: "ENOENT",
    });
    for (const filename of ["report.json", "summary.md"]) {
      await expect(
        readFile(path.join(artifacts, filename)),
      ).rejects.toMatchObject({ code: "ENOENT" });
    }
  },
);

it("compares matching selected-protocol repetitions without judging numeric changes", async () => {
  root = await mkdtemp(path.join(os.tmpdir(), "perf-protocol-match-"));
  const baselinePath = path.join(root, "baseline.json");
  const runs = [10_000, 0].map((scrollbackLines) =>
    makeRun({
      scrollbackLines,
      platform: process.platform,
      arch: process.arch,
    }),
  );
  const baselineText = JSON.stringify(
    baselineFrom(
      report(runs),
      "c".repeat(40),
      profileFor(process.platform, process.arch).key,
    ),
  );
  await writeFile(baselinePath, baselineText);
  launch.mockImplementation(async (options: { scrollbackLines?: number }) =>
    options.scrollbackLines === undefined
      ? {
          metric: METRIC,
          windowMs: 1000,
          processCount: 1,
          settled: true,
          build: REFERENCE_BUILD,
          samples: [
            { atMs: 0, processes: [{ pid: 1, bytes: 20, cpuSeconds: 0 }] },
            { atMs: 1000, processes: [{ pid: 1, bytes: 20, cpuSeconds: 0 }] },
          ],
        }
      : makeRun({
          scrollbackLines: options.scrollbackLines,
          platform: process.platform,
          arch: process.arch,
          idleRendererCpu: 200,
        }),
  );
  const outcome = await runAndEvaluate({
    scratch: root,
    baselinePath,
    repetitions: 2,
  });
  expect(outcome.report.protocol).toBe(PERFORMANCE_BENCHMARK_PROTOCOL);
  expect(
    outcome.report.variants.map((variant) => variant.repetitions.length),
  ).toEqual([2, 2]);
  expect(outcome.comparabilityReasons).toEqual([]);
  expect(outcome.issues.filter((issue) => issue.blocking)).toEqual([]);
  expect(
    outcome.comparison.some(
      (row) => row.family === "idle CPU" && (row.deltaPercent ?? 0) > 100,
    ),
  ).toBe(true);
  expect(outcome.recorded).toBe(false);
  expect(await readFile(baselinePath, "utf8")).toBe(baselineText);
});

it.each([
  ["partial first group", 0, 1, undefined],
  ["complete first group then later variant failure", 1, 2, SYNTHETIC_PROTOCOL],
  ["partial second group", 2, 3, "private-value\nnot-a-protocol"],
  ["runtime failure after complete variants", 1, 4, SYNTHETIC_PROTOCOL],
] as const)(
  "preserves invalid protocol evidence after %s",
  async (_label, invalidIndex, failureIndex, protocol) => {
    root = await mkdtemp(path.join(os.tmpdir(), "perf-protocol-prefix-"));
    const baselinePath = path.join(root, "baseline.json");
    const runs = [10_000, 0].map((scrollbackLines) =>
      makeRun({
        scrollbackLines,
        platform: process.platform,
        arch: process.arch,
      }),
    );
    const baselineText = JSON.stringify(
      baselineFrom(
        report(runs),
        "c".repeat(40),
        profileFor(process.platform, process.arch).key,
      ),
    );
    await writeFile(baselinePath, baselineText);
    const completed = [runs[0]!, runs[0]!, runs[1]!, runs[1]!]
      .slice(0, failureIndex)
      .map((run, index) =>
        index === invalidIndex ? { ...run, protocol } : run,
      );
    const expectedRepetitions =
      failureIndex < 2
        ? [completed]
        : [completed.slice(0, 2), completed.slice(2)];
    for (const mode of ["report", "replace", "create"]) {
      if (mode === "create") await rm(baselinePath);
      launch.mockReset();
      for (const run of completed) launch.mockResolvedValueOnce(run);
      launch.mockRejectedValueOnce(
        new Error("later launch failed: PRIVATE_LAUNCH_DETAIL"),
      );
      const artifactsDirectory = path.join(root, mode);
      const message = `Invalid benchmark protocol at variant ${Math.floor(invalidIndex / 2) + 1}, repetition ${(invalidIndex % 2) + 1}: observation does not match the selected runner protocol`;
      await expect
        .soft(
          runAndEvaluate({
            scratch: root,
            baselinePath,
            repetitions: 2,
            artifactsDirectory,
            ...(mode === "report"
              ? {}
              : {
                  recordBaseline: {
                    sourceCommit: "c".repeat(40),
                    cleanTree: true,
                    replace: mode === "replace",
                  },
                }),
          }),
        )
        .rejects.toThrow(message);
      expect(launch).toHaveBeenCalledTimes(failureIndex + 1);
      const raw: unknown = JSON.parse(
        await readFile(
          path.join(artifactsDirectory, "raw-observations.json"),
          "utf8",
        ),
      );
      expect(raw).toEqual(
        JSON.parse(
          JSON.stringify({
            repetitions: expectedRepetitions,
            runtime: null,
          }),
        ),
      );
      const failure: unknown = JSON.parse(
        await readFile(path.join(artifactsDirectory, "failure.json"), "utf8"),
      );
      expect(failure).toEqual({
        status: "fixture-failed",
        stage: "measurement",
        error: `Error: ${message}`,
      });
      for (const filename of ["report.json", "summary.md"]) {
        await expect(
          readFile(path.join(artifactsDirectory, filename)),
        ).rejects.toMatchObject({ code: "ENOENT" });
      }
      if (mode === "create") {
        await expect(readFile(baselinePath)).rejects.toMatchObject({
          code: "ENOENT",
        });
      } else {
        expect(await readFile(baselinePath, "utf8")).toBe(baselineText);
      }
    }
  },
);
