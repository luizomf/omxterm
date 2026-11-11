import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { vi } from "vitest";

const wallNow = Date.now;

/**
 * Let a short verifier deadline expire only after the fixture work it is meant
 * to cut off has really happened, however slow the machine is.
 *
 * `Date.now` in this process stays at its start until `ready` returns true,
 * allows one more pass of the caller's polling loop, then jumps to
 * `start + timeoutMs` and moves at real pace, so later cleanup budgets run
 * normally. If `ready` never holds, the deadline still expires after `guardMs`
 * and the test fails on its own assertions instead of hanging.
 *
 * Only this process is affected: child processes keep the real clock.
 */
export function holdDeadlineUntil(
  ready: () => boolean,
  timeoutMs: number,
  guardMs = 10_000,
) {
  const started = wallNow();
  let observed = false;
  let expiredAt: number | undefined;
  const clock = vi.spyOn(Date, "now").mockImplementation(() => {
    const now = wallNow();
    if (expiredAt === undefined) {
      if (!observed) {
        observed = now >= started + guardMs || safely(ready);
        return started;
      }
      expiredAt = now;
    }
    return started + timeoutMs + (now - expiredAt);
  });
  return { restore: () => clock.mockRestore() };
}

function safely(check: () => boolean) {
  try {
    return check();
  } catch {
    // Fixture files can be half-written while the actor is still starting.
    return false;
  }
}

// Readiness points written by test/fixtures/linux-packaged-process.mjs.
const controlStem = (root: string) =>
  readFileSync(path.join(root, "control-path"), "utf8");
export function controlProposalIn(root: string) {
  try {
    const file = `${controlStem(root)}.proposal.json`;
    if (existsSync(file))
      return JSON.parse(readFileSync(file, "utf8")) as { pid: number };
  } catch {
    // Not proposed yet.
  }
  return undefined;
}
export const controlAcquiredIn = (root: string) => () =>
  existsSync(`${controlStem(root)}.acquired.json`);
export const controlWorkerReadyIn = (root: string) => () =>
  existsSync(path.join(root, "control-ready.json"));
// The verifier reaps its own child, so a vanished leader means it has seen the
// wrapper's exit.
export const controlWrapperExitedIn = (root: string) => () => {
  const { leader } = JSON.parse(
    readFileSync(path.join(root, "control-ready.json"), "utf8"),
  ) as { leader: { pid: number } };
  return !existsSync(`/proc/${leader.pid}`);
};

export function liveProcess(pid: number) {
  try {
    const text = readFileSync(`/proc/${pid}/stat`, "utf8");
    return text.slice(text.lastIndexOf(")") + 2)[0] !== "Z";
  } catch {
    return false;
  }
}

// What a hanging control reaches before its deadline: a streams wrapper exits
// once its actor is acquired; every other control keeps the acquired actor.
export const controlReachedIn = (root: string, mode: string) =>
  mode === "control-streams"
    ? controlWrapperExitedIn(root)
    : controlAcquiredIn(root);
