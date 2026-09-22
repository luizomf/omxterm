import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import {
  collectFixtureDescendants,
  fixtureProcesses,
  type FixtureProcess,
} from "./native-fixture-processes";

export const FIXTURE_PROCESS_DIRECTORY = "native-process-ownership";

// A write-ahead record makes interruption during spawn/registration observable.
// The completed snapshot survives leader exit and POSIX reparenting. This is a
// cooperative test-fixture protocol, not containment for arbitrary programs.
export function spawnFixtureProcess<T extends { readonly pid: number }>(
  spawn: () => T,
): T {
  const root = process.env["OMXTERM_NATIVE_FIXTURE_ROOT"];
  if (!root) throw new Error("Native fixture ownership root is missing");
  const owner = fixtureProcesses().find((row) => row.pid === process.pid);
  if (!owner) throw new Error("Cannot identify native fixture process owner");
  const record = path.join(
    root,
    FIXTURE_PROCESS_DIRECTORY,
    `${randomUUID()}.json`,
  );
  const temporary = `${record}.tmp`;
  writeFileSync(temporary, JSON.stringify({ owner }), { flag: "wx" });
  renameSync(temporary, record);
  const child = spawn();
  const rows = fixtureProcesses();
  const owned = new Map([[owner.pid, owner]]);
  collectFixtureDescendants(rows, owned);
  if (!owned.has(child.pid))
    throw new Error("Cannot establish ownership of spawned fixture process");
  writeFileSync(
    temporary,
    JSON.stringify({ owner, processes: [...owned.values()] }),
    {
      flag: "wx",
    },
  );
  renameSync(temporary, record);
  return child;
}

function isProcess(value: unknown): value is FixtureProcess {
  if (typeof value !== "object" || value === null) return false;
  return (
    "pid" in value &&
    Number.isSafeInteger(value.pid) &&
    Number(value.pid) > 0 &&
    "parent" in value &&
    Number.isSafeInteger(value.parent) &&
    Number(value.parent) >= 0 &&
    "identity" in value &&
    typeof value.identity === "string" &&
    value.identity.length > 0
  );
}

export function collectFixtureRegistrations(
  root: string,
  leaderPid: number | undefined,
  owned: Map<number, FixtureProcess>,
  current: readonly FixtureProcess[] = fixtureProcesses(),
): number {
  let pending = 0;
  const directory = path.join(root, FIXTURE_PROCESS_DIRECTORY);
  for (const name of readdirSync(directory)) {
    if (!name.endsWith(".json")) continue;
    // The Windows launcher publishes its independently inspected leader after
    // spawn. A fixture can register first; defer adoption, not the uncertainty.
    if (leaderPid === undefined) {
      pending += 1;
      continue;
    }
    const record: unknown = JSON.parse(
      readFileSync(path.join(directory, name), "utf8"),
    );
    if (
      typeof record !== "object" ||
      record === null ||
      !("owner" in record) ||
      !isProcess(record.owner) ||
      record.owner.pid !== leaderPid ||
      (owned.has(leaderPid) &&
        owned.get(leaderPid)!.identity !== record.owner.identity)
    )
      throw new Error("Invalid native fixture ownership record");
    owned.set(record.owner.pid, record.owner);
    if (!("processes" in record)) {
      pending += 1;
      continue;
    }
    if (!Array.isArray(record.processes) || !record.processes.every(isProcess))
      throw new Error("Invalid native fixture process snapshot");
    const registered = new Map([[record.owner.pid, record.owner]]);
    collectFixtureDescendants(record.processes, registered);
    if (
      record.processes.some(
        (row) => registered.get(row.pid)?.identity !== row.identity,
      )
    )
      throw new Error("Unrelated process in native fixture ownership record");
    for (const row of registered.values()) {
      // Records are historical: Windows can reuse a PID within one fixture.
      // Never overwrite a live registered identity with an earlier incarnation.
      if (
        current.some(
          (live) => live.pid === row.pid && live.identity === row.identity,
        )
      )
        owned.set(row.pid, row);
    }
  }
  return pending;
}
