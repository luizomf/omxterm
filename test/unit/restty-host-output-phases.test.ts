import type { BrowserWindow } from "electron";
import { writeSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { afterEach, expect, it, vi } from "vitest";
import { prepareOutputRefit } from "../fixtures/restty-output-refit";
import { exerciseOutput } from "../fixtures/restty-host-output-test-ports";
import { createFixtureMetricReplyRouter } from "../fixtures/restty-host-metric-replies";

vi.mock("node:fs", { spy: true });
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const phaseLines = (lines: readonly string[], phase: string, status?: string) =>
  lines.filter(
    (line) =>
      line.includes(`"phase":"${phase}"`) &&
      (status === undefined || line.includes(`"status":"${status}"`)),
  );
const phaseRecords = (lines: readonly string[]) =>
  lines
    .filter((line) => line.startsWith("__OMXTERM_RESTTY_HOST_PHASE__"))
    .map(
      (line) =>
        JSON.parse(line.slice("__OMXTERM_RESTTY_HOST_PHASE__".length)) as {
          phase: string;
          status: string;
          checkpoint?: number;
        },
    );

it.each(["withheld", "counter-only"] as const)(
  "rejects an exit trailer with %s ACK even after all copies and pre-exit settlement",
  async (mode) => {
    const { exercise } = await exerciseOutput(mode);
    await expect(exercise).rejects.toThrow(
      mode === "withheld"
        ? "Output ACK cumulative end differs"
        : "Output actual pending bytes remain",
    );
  },
);

it("records each actual source/ACK/copy checkpoint without replacing the output oracle", async () => {
  const { exercise, lines } = await exerciseOutput("acknowledged");
  const result = await exercise;
  expect(result.source.bytes).toBe(2_097_998);
  expect(result.source.envelopeBytes).toBe(46);
  expect(result.flow.pendingBytes).toBe(0);
  expect(result.destination.checkpoints).toHaveLength(16);
  expect(result.destination.records).toBe(65536);
  const records = phaseRecords(lines);
  expect(
    records
      .filter((r) => r.phase.startsWith("checkpoint-"))
      .map((r) => [r.phase, r.status, r.checkpoint]),
  ).toEqual(
    Array.from({ length: 16 }, (_, checkpoint) => [
      ["checkpoint-source", "begin", checkpoint],
      ["checkpoint-source", "complete", checkpoint],
      ["checkpoint-ack", "begin", checkpoint],
      ["checkpoint-ack", "complete", checkpoint],
      ["checkpoint-copy", "begin", checkpoint],
      ["checkpoint-copy", "complete", checkpoint],
    ]).flat(),
  );
  expect(records.at(-1)).toMatchObject({
    phase: "output-producer-exit",
    status: "complete",
  });
  expect(lines.every((line) => line.length < 256)).toBe(true);
});

it("records first delayed continuation after the actual refit producer write returns, without losing exact framing or ACKs", async () => {
  const { exercise, lines, calls } = await exerciseOutput("refit-fragmented");
  const result = await exercise;
  expect(result.source).toMatchObject({
    framedBytes: 131_122,
    envelopeBytes: 46,
    finalized: true,
  });
  expect(result.controlledRefit!.prefixAcknowledgement).toMatchObject({
    pendingBytes: 0,
    cumulativeAck: result.controlledRefit!.prefixAcknowledgement.sourceBytes,
  });
  expect(result.flow.pendingBytes).toBe(0);
  expect(calls).toEqual({ copies: 1, exitRequests: 1 });
  const entered = lines.indexOf(
    phaseLines(lines, "refit-continuation-write", "begin")[0]!,
  );
  const returned = lines.indexOf(
    phaseLines(lines, "refit-continuation-write", "complete")[0]!,
  );
  const firstOutput = lines.indexOf(
    phaseLines(lines, "continuation-output")[0]!,
  );
  expect(entered).toBeGreaterThanOrEqual(0);
  expect(returned).toBeGreaterThan(entered);
  expect(firstOutput).toBeGreaterThan(returned);
  expect(phaseLines(lines, "continuation-output")).toHaveLength(1);
  const metadata = JSON.parse(
    lines[firstOutput]!.slice("__OMXTERM_OUTPUT_REFIT_PROGRESS__".length),
  ) as Record<string, number>;
  const prefix = result.controlledRefit!.prefixAcknowledgement.sourceBytes;
  expect(metadata).toMatchObject({
    sourceBytes: prefix + 47,
    cumulativeAck: prefix,
    checkpoints: 0,
    pendingBytes: 47,
    pauseCount: 1,
    resumeCount: 1,
  });
  expect(phaseLines(lines, "refit-resize-call")).toHaveLength(2);
});

it.each(["refit-no-r", "refit-no-end", "refit-no-exit"] as const)(
  "does not substitute copy/exit success for %s at the composed producer/harness seam",
  async (mode) => {
    const { exercise, calls, lines } = await exerciseOutput(mode);
    await expect(exercise).rejects.toThrow(
      mode === "refit-no-exit"
        ? "output producer clean exit"
        : "source checkpoint 0",
    );
    expect(calls).toEqual(
      mode === "refit-no-exit"
        ? { copies: 1, exitRequests: 1 }
        : { copies: 0, exitRequests: 0 },
    );
    expect(phaseLines(lines, "continuation-failure")).toHaveLength(1);
  },
);

it.each([0, 4])(
  "retains the primary write failure through restoration resize control %i",
  async (failureResizeCall) => {
    const { exercise, calls, lines } = await exerciseOutput(
      "refit-write-failure",
      failureResizeCall,
    );
    await expect(exercise).rejects.toThrow(
      "controlled continuation write failed",
    );
    expect(calls).toEqual({ copies: 0, exitRequests: 0 });
    expect(phaseLines(lines, "refit-continuation-write")).toHaveLength(1);
    expect(phaseLines(lines, "refit-continuation-write", "begin")).toHaveLength(
      1,
    );
    expect(phaseLines(lines, "continuation-failure")).toHaveLength(1);
    expect(phaseLines(lines, "refit-cleanup", "complete")).toHaveLength(1);
    expect(phaseLines(lines, "resize-failure")).toHaveLength(
      failureResizeCall ? 1 : 0,
    );
  },
);

it.each([3, 4, 5])(
  "vetoes settlement for contained resize failure at call %i, including restoration and late exit wait",
  async (failureResizeCall) => {
    const { exercise, calls, lines } = await exerciseOutput(
      "refit-resize-failure",
      failureResizeCall,
    );
    await expect(exercise).rejects.toThrow("Output refit native resize failed");
    expect(calls).toEqual({
      copies: failureResizeCall === 3 ? 0 : 1,
      exitRequests: failureResizeCall === 5 ? 1 : 0,
    });
    expect(phaseLines(lines, "refit-cleanup", "complete")).toHaveLength(1);
    if (failureResizeCall === 3) {
      const first = lines.findIndex((line) =>
        line.includes('"phase":"refit-resize-call","status":"begin"'),
      );
      expect(lines[first + 1]).toContain('"resizeFailure":"native-failure"');
      expect(lines[first + 2]).toContain(
        '"phase":"refit-resize-call","status":"complete"',
      );
    }
    if (failureResizeCall === 5)
      expect(
        phaseLines(lines, "output-producer-exit", "complete"),
      ).toHaveLength(1);
    expect(phaseLines(lines, "resize-failure")).toHaveLength(1);
    expect(
      lines.some((line) => line.includes("controlled resize failure")),
    ).toBe(false);
  },
);

it.each([false, true])(
  "retains one pre-exercise resize category without invented metrics, including sink failure=%s",
  async (failSink) => {
    const { exercise, lines, calls, failedDiagnostics } = await exerciseOutput(
      "refit-resize-failure",
      1,
      failSink,
    );
    await expect(exercise).rejects.toThrow("Output refit native resize failed");
    expect(calls).toEqual({ copies: 0, exitRequests: 0 });
    const failures = phaseLines(lines, "resize-failure");
    expect(failures).toHaveLength(failSink ? 0 : 1);
    expect(failedDiagnostics).toHaveLength(failSink ? 1 : 0);
    if (!failSink)
      expect(lines.indexOf(failures[0]!)).toBeLessThan(
        lines.indexOf(phaseLines(lines, "output-session", "begin")[0]!),
      );
    const receipt = JSON.parse(
      (failSink ? failedDiagnostics[0]! : failures[0]!).slice(
        "__OMXTERM_OUTPUT_REFIT_PROGRESS__".length,
      ),
    ) as Record<string, unknown>;
    expect(receipt).toMatchObject({
      phase: "resize-failure",
      resizeFailure: "closed-pty",
      progress: "unavailable",
    });
    for (const field of [
      "sourceBytes",
      "checkpoints",
      "cumulativeAck",
      "pendingBytes",
      "pauseCount",
      "resumeCount",
    ])
      expect(receipt).not.toHaveProperty(field);
    expect(phaseLines(lines, "refit-cleanup", "complete")).toHaveLength(1);
  },
);

it.each(["matching-deferred-width", "wrong-grid", "rejected", "sink-failure"])(
  "distinguishes targeted width settlement from first grid evaluation: %s",
  async (mode) => {
    const deferred = () => {
      let resolve!: () => void, reject!: (error: unknown) => void;
      const promise = new Promise<void>((yes, no) => {
        resolve = yes;
        reject = no;
      });
      return { promise, resolve, reject };
    };
    const width = deferred(),
      widthEntered = deferred(),
      gridEntered = deferred(),
      gridRelease = deferred();
    const lines: string[] = [],
      boundaries: Array<Record<string, unknown>> = [];
    vi.mocked(writeSync).mockImplementation((_fd, value) => {
      const line = String(value);
      if (/"phase":"(?:width-enter|width-settled|grid-first)"/u.test(line)) {
        boundaries.push(
          JSON.parse(
            line.slice("__OMXTERM_OUTPUT_REFIT_PROGRESS__".length),
          ) as Record<string, unknown>,
        );
        if (
          mode === "sink-failure" ||
          (mode === "rejected" && line.includes('"phase":"width-settled"'))
        )
          throw Error("controlled closed diagnostic sink");
      }
      lines.push(line);
      return 0;
    });
    const sizes = [{ cols: 80, rows: 24 }];
    const { terminal } = createFixtureMetricReplyRouter(
      { write() {}, resize() {} },
      () => {},
      { inputs: [], resizes: sizes },
    );
    let maxWidth = "",
      widthCalls = 0,
      executionCalls = 0,
      gridEvaluations = 0,
      sourceBytes = 53;
    const surface = {
      getBoundingClientRect: () => ({ width: 800 }),
      style: {
        get maxWidth() {
          return maxWidth;
        },
        set maxWidth(value: string) {
          maxWidth = value;
          terminal.resize({
            cols: value
              ? widthCalls === 3 && mode === "wrong-grid"
                ? 59
                : 60
              : 80,
            rows: 24,
          });
        },
      },
    };
    const window = {
      webContents: {
        async executeJavaScript(script: string) {
          executionCalls++;
          const targeted =
            script.includes("surface.style.maxWidth =") && ++widthCalls === 3;
          const result: unknown = runInNewContext(script, {
            document: { querySelector: () => surface },
          });
          if (targeted) {
            widthEntered.resolve();
            await width.promise;
          }
          return result;
        },
      },
    };
    const refit = await prepareOutputRefit({
      window: window as unknown as BrowserWindow,
      sizes,
      readProgress: () => ({
        sourceBytes,
        cumulativeAck: sourceBytes,
        pendingBytes: 0,
        checkpoints: 0,
        pauseCount: 1,
        resumeCount: 1,
      }),
      async waitFor(predicate, label) {
        const grid =
          label === "controlled output Surface grid and PTY resize request";
        if (grid) gridEvaluations++;
        const ready = await predicate();
        if (grid) gridEntered.resolve();
        if (ready) return;
        if (grid) {
          gridEvaluations++;
          expect(await predicate()).toBe(false);
          await gridRelease.promise;
          gridEvaluations++;
          if (await predicate()) return;
        }
        throw Error(`Not ready: ${label}`);
      },
    });
    expect(boundaries).toEqual([]); // Calibration/restoration add no boundary trace.
    sourceBytes += refit.prefixUnits;
    const pending = refit.refit();
    void pending.catch(() => {});
    try {
      await widthEntered.promise;
      expect(gridEvaluations).toBe(0);
      expect(phaseLines(lines, "refit-native-grid", "complete")).toHaveLength(
        0,
      );
      expect(boundaries).toMatchObject([
        {
          phase: "width-enter",
          countBefore: 3,
          requestCount: 3,
          expectedCols: 60,
          expectedRows: 24,
          latestRequestedCols: 80,
          latestRequestedRows: 24,
        },
      ]);
      expect(sizes.at(-1)).toEqual({
        cols: mode === "wrong-grid" ? 59 : 60,
        rows: 24,
      });
      if (mode === "rejected") {
        const original = new Error("controlled width rejection");
        width.reject(original);
        await expect(pending).rejects.toBe(original);
        expect(gridEvaluations).toBe(0);
      } else {
        width.resolve();
        await gridEntered.promise;
        if (mode === "wrong-grid") {
          expect(boundaries.at(-1)).toMatchObject({
            phase: "grid-first",
            predicate: false,
            latestRequestedCols: 59,
          });
          terminal.resize({ cols: 60, rows: 24 });
          gridRelease.resolve();
        }
        expect(await pending).toMatchObject({
          baselineBytes: 53,
          sourceBytes,
          cumulativeAck: sourceBytes,
          pendingBytes: 0,
        });
      }
      expect(boundaries).toHaveLength(mode === "rejected" ? 2 : 3);
      expect(boundaries[1]).toMatchObject({
        phase: "width-settled",
        outcome: mode === "rejected" ? "rejected" : "fulfilled",
        countBefore: 3,
        requestCount: 4,
        expectedCols: 60,
        expectedRows: 24,
        latestRequestedCols: mode === "wrong-grid" ? 59 : 60,
        latestRequestedRows: 24,
      });
      if (mode !== "rejected")
        expect(boundaries[2]).toMatchObject({
          phase: "grid-first",
          predicate: mode !== "wrong-grid",
        });
      expect(gridEvaluations).toBe(
        mode === "rejected" ? 0 : mode === "wrong-grid" ? 3 : 1,
      );
      if (mode === "sink-failure")
        expect(phaseLines(lines, "width-enter")).toHaveLength(0);
      const records = phaseRecords(lines);
      const phases = [
        "refit-layout",
        "refit-calibration",
        "refit-restoration",
        "refit-baseline-ack",
        "refit-prefix-ack",
        "refit-native-grid",
      ];
      const expected = phases.flatMap((phase) => [
        [phase, "begin"],
        [phase, "complete"],
      ]);
      if (mode === "rejected") expected.pop();
      expect(records.map((r) => [r.phase, r.status])).toEqual(expected);
    } finally {
      width.resolve();
      widthEntered.resolve();
      gridEntered.resolve();
      gridRelease.resolve();
      await pending.catch(() => {});
      await refit.restore();
    }
    expect(sizes.at(-1)).toEqual({ cols: 80, rows: 24 });
    expect([widthCalls, executionCalls]).toEqual([4, 5]);
    expect(boundaries).toHaveLength(mode === "rejected" ? 2 : 3);
  },
);
