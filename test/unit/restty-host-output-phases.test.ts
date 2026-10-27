import { writeSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import {
  exerciseOutput,
  type CopyAckControl,
} from "../fixtures/restty-host-output-test-ports";
import { assertOutputDropRejection } from "../fixtures/restty-output-drop-evidence";

vi.mock("node:fs", { spy: true });
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("settles failed drop/reorder Copy against every original UTF-8 chunk and real retirement in one decision", async () => {
  for (const copy of ["drop", "reorder"] as const) {
    for (const { chunks, bytes } of [
      { chunks: ["transport-envelope", "🙂é"], bytes: 24 },
      { chunks: ["🙂", "漢é"], bytes: 9 },
    ] as const) {
      const afterDecisionChunk =
        copy === "drop" && bytes === 24 ? "late" : undefined;
      const { exercise, copyFlow, calls, kill } = await exerciseOutput({
        copy,
        ack: "delayed",
        chunks,
        ...(afterDecisionChunk ? { afterDecisionChunk } : {}),
      });
      const failure: unknown = await exercise.then(
        () => undefined,
        (error: unknown) => error,
      );
      expect(failure).toBeInstanceOf(Error);
      const message = (failure as Error).message;
      if (copy === "drop") assertOutputDropRejection(message);
      else expect(message).toContain("Destination checkpoint 0 order at 100");
      expect(message).toContain("END present: true");
      expect(message).toContain(
        "source checkpoints=1, source records=4096, pending=0",
      );
      // One 30-byte ready prefix + one exact 131122-byte frame, plus BOTH original
      // chunks. The literal byte counts include multi-byte text, not code units.
      const total = 131_152 + bytes;
      expect(message).toContain(`ACK=${total}/${total}`);
      expect(copyFlow()).toMatchObject({
        sourceBytes: total + (afterDecisionChunk ? 4 : 0),
        acceptedEnd: total + (afterDecisionChunk ? 4 : 0),
        pendingBytes: 0,
      });
      expect(failure).toBe(copyFlow().rejectedAtPredicate);
      expect(calls).toEqual({ copies: 1, exitRequests: 0 });
      expect(kill).not.toHaveBeenCalled();
    }
  }
});

it("keeps accounting timeout, missing real metrics and unmodified Copy out of destination-only negatives", async () => {
  const chunks = ["transport-envelope", "🙂é"] as const;
  const cases: CopyAckControl[] = [
    { copy: "drop", ack: "withheld", chunks },
    { copy: "drop", ack: "counter-only", chunks },
    { copy: "drop", ack: "delayed", chunks, missingMetrics: true },
    { copy: "unmodified", ack: "delayed", chunks },
  ];
  for (const control of cases) {
    const { exercise, copyFlow, calls, kill } = await exerciseOutput(control);
    await vi.advanceTimersByTimeAsync(10_100);
    const failure: unknown = await exercise.then(
      () => undefined,
      (error: unknown) => error,
    );
    expect(failure).toBeInstanceOf(Error);
    const message = (failure as Error).message;
    expect(() => assertOutputDropRejection(message)).toThrow();
    expect(message).not.toContain(
      "source checkpoints=1, source records=4096, pending=0",
    );
    if (control.copy === "unmodified") {
      // Unchanged positive flow checks can reject delayed progress, but an intact
      // Copy must never masquerade as a drop/reorder destination rejection.
      expect(message).toContain("Output ACK cumulative end differs");
      expect(message).not.toContain("Destination checkpoint");
    } else {
      expect(message).toContain(
        "Output failed-copy ACK/accounting did not settle",
      );
      expect(failure).toMatchObject({
        cause: {
          message:
            "Destination checkpoint 0 record length 131040 (END present: true)",
        },
      });
      if (control.missingMetrics)
        expect(message).toContain("Output flow metadata is unavailable");
      else {
        expect(message).toContain(
          "Focused oracle timed out: actual copied destination checkpoint 0",
        );
        expect(copyFlow()).toMatchObject({
          sourceBytes: 131_176,
          acceptedEnd: 131_152,
          pendingBytes: 24,
          observedAckEnd: control.ack === "counter-only" ? 131_176 : 131_152,
        });
      }
    }
    expect(calls).toEqual({ copies: 1, exitRequests: 0 });
    expect(kill).not.toHaveBeenCalled();
  }
});

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
  const records = lines.map(
    (line) =>
      JSON.parse(line.slice("__OMXTERM_RESTTY_HOST_PHASE__".length)) as {
        phase: string;
        status: string;
        checkpoint?: number;
      },
  );
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

it.each(["no-end", "no-exit"] as const)(
  "rejects ordinary output with %s rather than substituting copy/exit success",
  async (mode) => {
    const { exercise, calls } = await exerciseOutput(mode);
    await expect(exercise).rejects.toThrow(
      mode === "no-end" ? "source checkpoint 0" : "output producer clean exit",
    );
    expect(calls).toEqual(
      mode === "no-end"
        ? { copies: 0, exitRequests: 0 }
        : { copies: 1, exitRequests: 1 },
    );
  },
);

it.each(["initial", "resize", "memory", "exit"] as const)(
  "vetoes ordinary output success for contained resize failure at %s",
  async (failureAt) => {
    const { exercise, lines, calls } = await exerciseOutput(
      "resize-failure",
      failureAt,
    );
    await expect(exercise).rejects.toThrow("Output native resize failed");
    expect(calls).toEqual(
      failureAt === "initial" || failureAt === "resize"
        ? { copies: 0, exitRequests: 0 }
        : { copies: 1, exitRequests: 1 },
    );
    expect(lines.join("")).not.toContain("PRIVATE_NATIVE_CANARY");
  },
);

it("preserves the primary checkpoint write failure despite a contained resize failure", async () => {
  const { exercise, calls } = await exerciseOutput("write-failure");
  await expect(exercise).rejects.toThrow("controlled checkpoint write failed");
  expect(calls).toEqual({ copies: 1, exitRequests: 0 });
});
