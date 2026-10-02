import { readFile } from "node:fs/promises";
import { constants } from "node:os";

export interface NativeFixtureResult {
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  readonly reason: string;
  readonly stdout: string;
  readonly stderr: string;
  readonly cleanupErrors: readonly string[];
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
    result.cleanupErrors.every((error: unknown) => typeof error === "string")
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
