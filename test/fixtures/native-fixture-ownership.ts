import { writeFileSync } from "node:fs";
import path from "node:path";
import { fixtureProcesses } from "./native-fixture-processes";

export const FIXTURE_PROCESS_DIRECTORY = "native-process-ownership";

/**
 * Record a process a fixture spawned, so `runNativeFixture` can still find and
 * kill it after it leaves the fixture's process tree (PTYs call setsid, and
 * children are reparented when the fixture exits first).
 */
export function registerFixtureProcess(pid: number): void {
  const root = process.env["OMXTERM_NATIVE_FIXTURE_ROOT"];
  if (!root) throw new Error("Native fixture ownership root is missing");
  const row = fixtureProcesses().find((candidate) => candidate.pid === pid);
  if (!row) return; // Already gone; nothing left to own.
  writeFileSync(
    path.join(root, FIXTURE_PROCESS_DIRECTORY, `${pid}.json`),
    JSON.stringify(row),
  );
}

export function spawnFixtureProcess<T extends { readonly pid: number }>(
  spawn: () => T,
): T {
  const child = spawn();
  registerFixtureProcess(child.pid);
  return child;
}
