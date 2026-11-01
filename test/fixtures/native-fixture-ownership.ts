import { randomUUID } from "node:crypto";
import {
  lstatSync,
  readFileSync,
  readdirSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { recordFixtureRegistrationFailure } from "./native-fixture-registration-diagnostics";
import {
  collectFixtureDescendants,
  fixtureProcesses,
  type FixtureProcess,
  type FixtureCleanupCommandContext,
} from "./native-fixture-processes";

export const FIXTURE_PROCESS_DIRECTORY = "native-process-ownership";

function requireUnpublished(destination: string): void {
  try {
    lstatSync(destination);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw error;
  }
  throw Object.assign(new Error("Native fixture completion already exists"), {
    code: "EEXIST",
  });
}

function publishRegistration(
  record: string,
  branch: Parameters<typeof recordFixtureRegistrationFailure>[0],
  data: {
    readonly owner: FixtureProcess;
    readonly processes?: readonly FixtureProcess[];
  },
): void {
  const completed = data.processes !== undefined;
  if (data.processes !== undefined)
    validateSnapshot(data.owner, data.processes);
  const destination = completed
    ? `${record.slice(0, -5)}.complete.json`
    : record;
  const temporary = `${destination}.tmp`;
  let phase: Parameters<typeof recordFixtureRegistrationFailure>[1] = completed
    ? "completed-write"
    : "pending-write";
  try {
    writeFileSync(temporary, JSON.stringify(data), { flag: "wx" });
    phase = completed ? "completed-publication" : "pending-publication";
    // Each UUID has one cooperative writer. Do not overwrite a completion
    // already present when publication is attempted.
    if (completed) requireUnpublished(destination);
    renameSync(temporary, destination);
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
  const initial = fixtureProcesses();
  assertUniqueProcessIds(initial);
  const owner = initial.find((row) => row.pid === process.pid);
  if (!isProcess(owner))
    throw new Error("Cannot identify native fixture process owner");
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
    if (
      !Number.isSafeInteger(child.pid) ||
      child.pid <= 0 ||
      child.pid === owner.pid
    )
      return false;
    try {
      const rows = fixtureProcesses();
      assertUniqueProcessIds(rows);
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
        if (
          !Number.isSafeInteger(child.pid) ||
          child.pid <= 0 ||
          child.pid === owner.pid
        )
          throw new Error(
            "Early-exit fixture has no verified positive child PID",
          );
        const remaining = fixtureProcesses();
        assertUniqueProcessIds(remaining);
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

function assertUniqueProcessIds(rows: readonly FixtureProcess[]): void {
  const pids = rows.filter((row) => row.pid > 0).map((row) => row.pid);
  if (new Set(pids).size !== pids.length)
    throw new Error("Conflicting native fixture process inventory");
}

function validateSnapshot(
  owner: FixtureProcess,
  processes: unknown,
): Map<number, FixtureProcess> {
  if (
    !isProcess(owner) ||
    !Array.isArray(processes) ||
    !processes.every(isProcess) ||
    new Set(processes.map((row) => row.pid)).size !== processes.length ||
    !processes.some(
      (row) =>
        row.pid === owner.pid &&
        row.parent === owner.parent &&
        row.identity === owner.identity,
    )
  )
    throw new Error("Invalid native fixture process snapshot");
  const registered = new Map([[owner.pid, owner]]);
  collectFixtureDescendants(processes, registered);
  if (
    processes.some((row) => registered.get(row.pid)?.identity !== row.identity)
  )
    throw new Error("Unrelated process in native fixture ownership record");
  return registered;
}

function readRegistration(
  directory: string,
  name: string,
  names: Set<string>,
  leaderPid: number,
  owned: Map<number, FixtureProcess>,
): { owner: FixtureProcess; registered?: Map<number, FixtureProcess> } {
  let record: unknown = JSON.parse(
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
  const owner = record.owner;
  const completedName = `${name.slice(0, -5)}.complete.json`;
  let completedText: string | undefined;
  try {
    // A completion can be published after the non-transactional listing.
    completedText = readFileSync(path.join(directory, completedName), "utf8");
  } catch (error) {
    if (
      (error as NodeJS.ErrnoException).code !== "ENOENT" ||
      names.has(completedName)
    )
      throw error;
  }
  if (completedText !== undefined) {
    if ("processes" in record)
      throw new Error("Contradictory native fixture ownership records");
    record = JSON.parse(completedText) as unknown;
    if (
      typeof record !== "object" ||
      record === null ||
      !("owner" in record) ||
      !isProcess(record.owner) ||
      record.owner.pid !== owner.pid ||
      record.owner.parent !== owner.parent ||
      record.owner.identity !== owner.identity ||
      !("processes" in record)
    )
      throw new Error("Invalid native fixture completion record");
  }
  return "processes" in record
    ? { owner, registered: validateSnapshot(owner, record.processes) }
    : { owner };
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
  const names = new Set(readdirSync(directory));
  const records = new Set(
    [...names]
      .filter((name) => name.endsWith(".json"))
      .map((name) =>
        name.endsWith(".complete.json")
          ? `${name.slice(0, -".complete.json".length)}.json`
          : name,
      ),
  );
  for (const name of records) {
    // The Windows launcher publishes its independently inspected leader after
    // spawn. A fixture can register first; defer adoption, not the uncertainty.
    if (leaderPid === undefined) {
      pending += 1;
      continue;
    }
    const { owner, registered } = readRegistration(
      directory,
      name,
      names,
      leaderPid,
      owned,
    );
    owned.set(owner.pid, owner);
    if (!registered) {
      pending += 1;
      continue;
    }
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
