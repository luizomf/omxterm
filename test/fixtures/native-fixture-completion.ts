import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import type { FixtureProcess } from "./native-fixture-processes";

export interface FixtureCompletion {
  readonly producer: FixtureProcess;
  readonly exitCode: number;
  readonly stdout: string;
}

// A final process-exit record is not enough while its producer is still alive.
// Never let supervisor cleanup turn a still-running producer into a success.
export function completedFixture(
  root: string,
  file: string | undefined,
  owned: ReadonlyMap<number, FixtureProcess>,
  current: readonly FixtureProcess[],
): FixtureCompletion | undefined {
  if (!file || !existsSync(path.join(root, file))) return undefined;
  const record = JSON.parse(
    readFileSync(path.join(root, file), "utf8"),
  ) as FixtureCompletion;
  if (
    !record ||
    !record.producer ||
    !Number.isSafeInteger(record.exitCode) ||
    !owned.has(record.producer.pid) ||
    typeof record.stdout !== "string" ||
    owned.get(record.producer.pid)?.identity !== record.producer.identity
  )
    throw new Error("Invalid native fixture completion identity or outcome");
  return current.some(
    (row) =>
      row.pid === record.producer.pid &&
      row.identity === record.producer.identity,
  )
    ? undefined
    : record;
}
