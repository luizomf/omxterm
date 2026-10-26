import { randomUUID } from "node:crypto";
import { readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import path from "node:path";
import { recordFixtureRegistrationFailure } from "./native-fixture-registration-diagnostics";
import {
  collectFixtureDescendants,
  fixtureProcesses,
  type FixtureProcess,
  type FixtureCleanupCommandContext,
} from "./native-fixture-processes";

export const FIXTURE_PROCESS_DIRECTORY = "native-process-ownership";

function publishRegistration(
  record: string,
  branch: "normal" | "early-exit",
  data: {
    readonly owner: FixtureProcess;
    readonly processes?: readonly FixtureProcess[];
  },
): void {
  const temporary = `${record}.tmp`;
  const completed = data.processes !== undefined;
  let phase: Parameters<typeof recordFixtureRegistrationFailure>[1] = completed
    ? "completed-write"
    : "pending-write";
  try {
    writeFileSync(temporary, JSON.stringify(data), { flag: "wx" });
    phase = completed ? "completed-replacement" : "pending-replacement";
    renameSync(temporary, record);
  } catch (error) {
    recordFixtureRegistrationFailure(branch, phase, error);
    throw error;
  }
}

// A write-ahead record makes interruption during spawn/registration observable.
// The completed snapshot survives leader exit and POSIX reparenting. This is a
// cooperative test-fixture protocol, not containment for arbitrary programs.
export function spawnFixtureProcess<T extends { readonly pid: number }>(
  spawn: () => T,
  observeLifecycle?: (
    child: T,
    exited: () => void,
    ready: () => boolean,
  ) => (() => void) | void,
  registered?: (child: T) => void,
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
  publishRegistration(record, "normal", { owner });
  const child = spawn();
  const owned = new Map([[owner.pid, owner]]);
  let settled = false;
  let retire: (() => void) | void;
  const ready = () => {
    if (settled) return true;
    if (!Number.isSafeInteger(child.pid) || child.pid <= 0) return false;
    const rows = fixtureProcesses();
    collectFixtureDescendants(rows, owned);
    if (!owned.has(child.pid)) return false;
    publishRegistration(record, "normal", {
      owner,
      processes: [...owned.values()],
    });
    settled = true;
    retire?.();
    registered?.(child);
    return true;
  };
  // Install the observer before inspecting a potentially delayed PID. Only an
  // actual exit plus reinspection can settle a child that vanished before ready.
  retire = observeLifecycle?.(
    child,
    () => {
      if (settled) return;
      const remaining = fixtureProcesses();
      if (remaining.some((row) => row.pid === child.pid))
        throw new Error("Early-exit fixture PID remains observable");
      collectFixtureDescendants(remaining, owned);
      publishRegistration(record, "early-exit", {
        owner,
        processes: [...owned.values()],
      });
      settled = true;
      retire?.();
    },
    ready,
  );
  if (settled) retire?.();
  else if (!ready() && !observeLifecycle)
    throw new Error("Cannot establish ownership of spawned fixture process");
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
  current?: readonly FixtureProcess[],
  failureContext?: FixtureCleanupCommandContext,
): number {
  if (current === undefined) current = fixtureProcesses(failureContext);
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
      // Keep exited identities too: a short-lived relaunch can finish before
      // sampling, but its final outcome still needs historical ownership proof.
      // Never replace a live reused PID with an earlier incarnation.
      if (
        !current.some(
          (live) => live.pid === row.pid && live.identity !== row.identity,
        )
      )
        owned.set(row.pid, row);
    }
  }
  return pending;
}
