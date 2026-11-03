import { readFile } from "node:fs/promises";
import { constants } from "node:os";

export const MAX_CLEANUP_COMMAND_ELAPSED_MS = 86_400_000;

export interface NativeFixtureCleanupFailure {
  readonly callsite:
    | "final-sample"
    | "registration-before-kill"
    | "termination"
    | "registration-after-kill"
    | "survival";
  // Failed execFileSync invocation only, floored milliseconds, capped at one day.
  readonly elapsedMs: number;
  readonly category: "timeout" | "command-failed" | "unknown";
}

function isCleanupFailure(
  value: unknown,
): value is NativeFixtureCleanupFailure {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === 3 &&
    Object.keys(value).every(
      (key) => key === "callsite" || key === "elapsedMs" || key === "category",
    ) &&
    "callsite" in value &&
    (value.callsite === "final-sample" ||
      value.callsite === "registration-before-kill" ||
      value.callsite === "termination" ||
      value.callsite === "registration-after-kill" ||
      value.callsite === "survival") &&
    "elapsedMs" in value &&
    typeof value.elapsedMs === "number" &&
    Number.isSafeInteger(value.elapsedMs) &&
    value.elapsedMs >= 0 &&
    value.elapsedMs <= MAX_CLEANUP_COMMAND_ELAPSED_MS &&
    "category" in value &&
    (value.category === "timeout" ||
      value.category === "command-failed" ||
      value.category === "unknown")
  );
}

export interface NativeFixtureResult {
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly reason: string;
  readonly stdout: string;
  readonly stderr: string;
  readonly cleanupErrors: readonly string[];
  readonly cleanupFailure?: NativeFixtureCleanupFailure;
  // Absent in historical receipts. Attempts do not establish signal delivery or
  // causation; cleanupErrors separately reports whether settlement completed.
  readonly cleanupAssistance?: "none" | "attempted" | "unknown";
}

export function isNativeFixtureResult(
  result: unknown,
): result is NativeFixtureResult {
  return (
    typeof result === "object" &&
    result !== null &&
    "exitCode" in result &&
    (result.exitCode === null || Number.isSafeInteger(result.exitCode)) &&
    "signal" in result &&
    (result.signal === null ||
      (typeof result.signal === "string" &&
        Object.hasOwn(constants.signals, result.signal))) &&
    "reason" in result &&
    typeof result.reason === "string" &&
    result.reason.length > 0 &&
    "stdout" in result &&
    typeof result.stdout === "string" &&
    "stderr" in result &&
    typeof result.stderr === "string" &&
    "cleanupErrors" in result &&
    Array.isArray(result.cleanupErrors) &&
    result.cleanupErrors.every((error: unknown) => typeof error === "string") &&
    (!("cleanupAssistance" in result) ||
      ["none", "attempted", "unknown"].some(
        (value) => value === result.cleanupAssistance,
      )) &&
    (!("cleanupFailure" in result) ||
      (result.cleanupErrors.length > 0 &&
        isCleanupFailure(result.cleanupFailure)))
  );
}

// A receipt is only data; its caller must separately join the actual owner.
export async function readOutcome(
  evidencePath: string,
): Promise<NativeFixtureResult | undefined> {
  let result: unknown;
  try {
    result = JSON.parse(await readFile(evidencePath, "utf8"));
  } catch (error) {
    if (
      (error as NodeJS.ErrnoException).code === "ENOENT" ||
      error instanceof SyntaxError
    )
      return undefined;
    throw error;
  }
  if (typeof result !== "object" || result === null)
    throw new Error("Invalid native fixture supervisor outcome");
  if ("reason" in result && result.reason === "supervisor-error")
    throw new Error(
      `Native fixture supervisor failed: ${JSON.stringify(result)}`,
    );
  if (!isNativeFixtureResult(result))
    throw new Error("Invalid native fixture supervisor outcome");
  return result;
}
