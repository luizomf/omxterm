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
  branch: Parameters<typeof recordFixtureRegistrationFailure>[0],
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
    failedStart: () => void,
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
  let failed = false;
  let retire: (() => void) | void;
  const failObservation = (
    branch: Parameters<typeof recordFixtureRegistrationFailure>[0],
    phase:
      "ready-observation" | "exit-observation" | "failed-start-observation",
    error: unknown,
  ) => {
    // Keep the write-ahead record pending. The supervisor must retain/block this
    // scope even if downstream sessions consume their actual exit notification.
    failed = true;
    recordFixtureRegistrationFailure(branch, phase, error);
    retire?.();
  };
  const ready = (observed = false) => {
    if (settled) return true;
    if (failed) return false;
    if (!Number.isSafeInteger(child.pid) || child.pid <= 0) return false;
    try {
      const rows = fixtureProcesses();
      collectFixtureDescendants(rows, owned);
      if (!owned.has(child.pid)) return false;
      publishRegistration(record, "normal", {
        owner,
        processes: [...owned.values()],
      });
    } catch (error) {
      // Initial synchronous registration still throws to its caller. Only the
      // event observer must preserve the dependency's remaining listener queue.
      if (!observed) throw error;
      failObservation("normal", "ready-observation", error);
      return false;
    }
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
      if (settled || failed) return;
      try {
        // An ordinary exit needs a positive child and disappearance. Only the
        // adapter's distinct terminal failed-start path can acquire at PID 0.
        if (!Number.isSafeInteger(child.pid) || child.pid <= 0)
          throw new Error("Early-exit fixture has no verified positive PID");
        const remaining = fixtureProcesses();
        if (remaining.some((row) => row.pid === child.pid))
          throw new Error("Early-exit fixture PID remains observable");
        collectFixtureDescendants(remaining, owned);
        publishRegistration(record, "early-exit", {
          owner,
          processes: [...owned.values()],
        });
      } catch (error) {
        failObservation("early-exit", "exit-observation", error);
        return;
      }
      settled = true;
      retire?.();
    },
    () => ready(true),
    () => {
      if (settled || failed) return;
      try {
        // The pinned adapter establishes terminal connect admission, not native
        // quiescence. A post-creation throw may leave live descendants at PID 0.
        if (child.pid !== 0)
          throw new Error(
            "Failed-start fixture has a contradictory public PID",
          );
        const rows = fixtureProcesses().filter((row) => row.pid !== 0);
        if (
          !isProcess(owner) ||
          // This path is Windows-only: creation identities must retain numeric
          // tick ordering, not bypass ancestry checks with malformed strings.
          !rows.every((row) => isProcess(row) && /^\d+$/u.test(row.identity)) ||
          new Set(rows.map((row) => row.pid)).size !== rows.length ||
          !rows.some(
            (row) => row.pid === owner.pid && row.identity === owner.identity,
          )
        )
          throw new Error(
            "Cannot verify live failed-start fixture owner/inventory",
          );
        const acquired = new Map([[owner.pid, owner]]);
        collectFixtureDescendants(rows, acquired);
        publishRegistration(record, "failed-start", {
          owner,
          processes: [...acquired.values()],
        });
      } catch (error) {
        failObservation("failed-start", "failed-start-observation", error);
        return;
      }
      settled = true;
      retire?.();
      // No successful terminal readiness was observed; do not call registered.
    },
  );
  if (settled || failed) retire?.();
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
