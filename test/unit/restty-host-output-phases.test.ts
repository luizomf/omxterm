import { writeSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { exerciseOutput } from "../fixtures/restty-host-output-test-ports";

vi.mock("node:fs", { spy: true });
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
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
