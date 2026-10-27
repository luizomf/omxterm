import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import type { NativeFixtureResult } from "./native-fixture-outcome";

export type FontReadStep = <T>(
  operation: () => T | Promise<T>,
  label: string,
) => Promise<T>;

// One 60 s scenario timer, not one allowance per await, inside the unchanged
// 90 s supervisor budget. Native exit/cleanup still uses the supervisor's remainder.
export async function runFontReadScenario(
  scenario: (step: FontReadStep) => Promise<void>,
) {
  let label = "setup";
  let failure: Error | undefined;
  let expire!: (error: Error) => void;
  const expired = new Promise<never>((_resolve, reject) => {
    expire = reject;
  });
  const timer = setTimeout(() => {
    failure = new Error(
      `Font read/reload scenario timed out waiting for ${label}`,
    );
    expire(failure);
  }, 60_000);
  const step: FontReadStep = async (operation, waitingFor) => {
    if (failure) throw failure;
    label = waitingFor;
    const result = await Promise.race([
      Promise.resolve().then(operation),
      expired,
    ]);
    if (failure) throw failure;
    return result;
  };
  try {
    await step(() => scenario(step), "setup");
  } finally {
    clearTimeout(timer);
  }
}

export function fontReadRendererReady(observation: {
  ready: boolean;
  mounts: readonly {
    status: "pending" | "mounted" | "failed";
    cancelled: boolean;
  }[];
}): boolean {
  assert.ok(
    !observation.mounts.some((record) => record.status === "failed"),
    "Font read/reload Surface failed",
  );
  assert.ok(
    !observation.mounts.some((record) => record.cancelled),
    "Font read/reload Surface cancelled",
  );
  return observation.ready;
}

export const fontReadReloadResultPrefix = "__OMXTERM_FONT_READ_RELOAD_RESULT__";
const mutationSentinel = "__OMXTERM_FONT_READ_RELOAD_A_SUPERSEDED__";
const fatalReceiptPrefix = "__OMXTERM_FONT_READ_RELOAD_FATAL__";
// Only the exact checked race outcome can produce this category; message text
// from an unrelated exception is not authoritative.
const mutationFailures = new WeakSet<Error>();
export interface FontReadResult {
  family: unknown;
  status: "pending" | "fulfilled" | "rejected";
  failure?: "superseded" | "read-error";
}
export interface FontReadResults {
  gateEntered: boolean;
  bQueued: boolean;
  loads: readonly (string | undefined)[];
  received: readonly FontReadResult[];
}
export function fontReadFailure(error: unknown): "superseded" | "read-error" {
  return error instanceof Error &&
    error.message === "Terminal Font request was superseded"
    ? "superseded"
    : "read-error";
}
export function assertFontReadResults(
  A: string,
  B: string,
  evidence: FontReadResults,
) {
  assert.equal(evidence.gateEntered, true, "Physical A read must have entered");
  assert.equal(
    evidence.bQueued,
    true,
    "B must have queued behind the held A read",
  );
  assert.deepEqual(
    evidence.loads,
    [undefined, A, B],
    "Exactly three serialized loads",
  );
  if (
    isDeepStrictEqual(evidence.received, [
      { family: undefined, status: "fulfilled" },
      { family: A, status: "rejected", failure: "superseded" },
      { family: B, status: "fulfilled" },
    ])
  ) {
    const error = new Error(mutationSentinel);
    mutationFailures.add(error);
    throw error;
  }
  assert.deepEqual(
    evidence.received,
    [
      { family: undefined, status: "fulfilled" },
      { family: A, status: "fulfilled" },
      { family: B, status: "fulfilled" },
    ],
    "Exact default/A/B font results must fulfill",
  );
}
export function createFontReadFailureHandler(options: {
  releaseReads(): void;
  writeError(text: string): unknown;
  complete(code: 1): Promise<void>;
}) {
  let ordinal = 0;
  return (error: unknown) => {
    // Account for every invocation, including failures during an existing drain.
    // Keep the existing release, raw diagnostic and native completion handling.
    const receipt = {
      ordinal: ++ordinal,
      category:
        error instanceof Error && mutationFailures.has(error)
          ? "a-superseded"
          : "fatal",
    };
    options.releaseReads();
    options.writeError(`${fatalReceiptPrefix}${JSON.stringify(receipt)}\n`);
    options.writeError(
      `${error instanceof Error ? error.stack : String(error)}\n`,
    );
    void options.complete(1);
  };
}

export function assertOldPostReadRejection(execution: NativeFixtureResult) {
  assert.deepEqual(
    [
      execution.exitCode,
      execution.signal,
      execution.reason,
      execution.cleanupErrors,
      execution.cleanupFailure,
    ],
    [1, null, "exit", [], undefined],
  );
  const receipts = execution.stderr
    .split(/\r?\n/u)
    .filter((line) => line.startsWith(fatalReceiptPrefix))
    .map(
      (line) => JSON.parse(line.slice(fatalReceiptPrefix.length)) as unknown,
    );
  assert.deepEqual(
    receipts,
    [{ ordinal: 1, category: "a-superseded" }],
    "Exactly one intended mutation fatal invocation, and no other fatal failure",
  );
  assert.equal(
    execution.stderr
      .split(/\r?\n/u)
      .filter((line) => line === `Error: ${mutationSentinel}`).length,
    1,
    "Only the intentional A-supersession sentinel qualifies",
  );
  // Keep the owner's fixed failure diagnostics authoritative, without requiring
  // a platform-specific stack layout or treating Electron warnings as the oracle.
  for (const message of [
    "Restty fixture session close failed",
    "Restty fixture completion failed",
  ])
    assert.ok(
      !execution.stderr.includes(message),
      "Fixture completion must not fail",
    );
  assert.ok(!execution.stdout.includes(fontReadReloadResultPrefix));
}
