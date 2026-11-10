import { spawn } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { mkdir, rm } from "node:fs/promises";
import path from "node:path";
import type { TestContext } from "vitest";
import { FIXTURE_PROCESS_DIRECTORY } from "./native-fixture-ownership";
import {
  collectFixtureDescendants,
  fixtureProcesses,
  nativeFixtureEnvironment,
  type FixtureProcess,
} from "./native-fixture-processes";
import { removeFailedFixture } from "./remove-failed-fixture";

export type NativeFixtureTestContext = Pick<
  TestContext,
  "signal" | "onTestFinished"
>;

export interface NativeFixtureResult {
  readonly exitCode: number | null;
  readonly signal: NodeJS.Signals | null;
  /** "exit", "timeout", "cancelled" or "spawn-error". */
  readonly reason: string;
  readonly stdout: string;
  readonly stderr: string;
  /** Empty when every owned process ended and the profile was removed. */
  readonly cleanupErrors: readonly string[];
  /** "attempted" when an owned process outlived the fixture and was killed. */
  readonly cleanupAssistance?: "none" | "attempted";
}

interface NativeFixtureOptions {
  readonly executable: string;
  readonly args: string[];
  /** Fresh profile directory; removed after a clean run, kept otherwise. */
  readonly root: string;
  readonly timeout: number;
  /**
   * File in `root` holding `{ exitCode, stdout }`. After a zero exit, the run
   * waits for it, for fixtures whose result comes from a relaunched process.
   */
  readonly completionFile?: string;
  readonly testContext?: NativeFixtureTestContext;
  /** Writes the fixture's files into `root` before launch. */
  readonly prepare?: () => Promise<void>;
}

const SAMPLE_INTERVAL_MS = 500;
const KILL_DEADLINE_MS = 5_000;
const EXIT_GRACE_MS = 1_000;
const STREAM_CLOSE_MS = 1_000;

const delay = (ms: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Launch a native fixture in its own profile, collect its output, and make sure
 * nothing it started outlives the run: the fixture's process tree and every
 * process it registered (see `spawnFixtureProcess`) are killed at the end.
 */
export function runNativeFixture(
  options: NativeFixtureOptions,
): Promise<NativeFixtureResult> {
  const operation = execute(options);
  const { testContext } = options;
  // A timed-out test must not hand the desktop to the next one mid-cleanup.
  if (testContext && !testContext.signal.aborted)
    testContext.onTestFinished(() => operation.then(noop, noop));
  return operation;
}

function noop(): void {}

/** Kill every owned process still alive after `graceMs`. */
async function killRemaining(
  sample: () => FixtureProcess[],
  owned: ReadonlyMap<number, FixtureProcess>,
  graceMs: number,
): Promise<"none" | "attempted"> {
  const killFrom = Date.now() + graceMs;
  const deadline = killFrom + KILL_DEADLINE_MS;
  let assistance: "none" | "attempted" = "none";
  let failure: unknown;
  while (Date.now() < deadline) {
    try {
      const alive = sample().filter(
        (row) => owned.get(row.pid)?.identity === row.identity,
      );
      if (alive.length === 0) return assistance;
      failure = new Error(
        `Fixture processes survived cleanup: ${alive.map((row) => row.pid).join(",")}`,
      );
      if (Date.now() >= killFrom) {
        assistance = "attempted";
        for (const row of alive) kill(row.pid);
      }
    } catch (error) {
      // A failed inventory is retried until the deadline.
      failure = error;
    }
    await delay(100);
  }
  throw failure;
}

function kill(pid: number): void {
  try {
    process.kill(pid, "SIGKILL");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ESRCH") throw error;
  }
}

async function execute({
  executable,
  args,
  root,
  timeout,
  completionFile,
  testContext,
  prepare,
}: NativeFixtureOptions): Promise<NativeFixtureResult> {
  const abortSignal = testContext?.signal;
  try {
    abortSignal?.throwIfAborted();
    await prepare?.();
    abortSignal?.throwIfAborted();
    await mkdir(path.join(root, FIXTURE_PROCESS_DIRECTORY));
  } catch (error) {
    return removeFailedFixture(root, error);
  }

  const child = spawn(executable, args, {
    cwd: root,
    env: nativeFixtureEnvironment(root),
    stdio: ["ignore", "pipe", "pipe"],
  });
  let stdout = "";
  let stderr = "";
  child.stdout.setEncoding("utf8").on("data", (chunk: string) => {
    stdout += chunk;
  });
  child.stderr.setEncoding("utf8").on("data", (chunk: string) => {
    stderr += chunk;
  });
  const streamsClosed = new Promise<boolean>((resolve) =>
    child.once("close", () => resolve(true)),
  );

  let reason = "exit";
  let exitCode: number | null = null;
  let exitSignal: NodeJS.Signals | null = null;
  let exited = false;
  const cleanupErrors: string[] = [];
  let finish = noop;
  const finished = new Promise<void>((resolve) => {
    finish = resolve;
  });
  child.once("error", (error) => {
    reason = "spawn-error";
    stderr += `${error.message}\n`;
    finish();
  });
  child.once("exit", (code, signal) => {
    exited = true;
    exitCode = code;
    exitSignal = signal;
    if (code !== 0 || signal !== null || !completionFile) finish();
  });

  // Ownership is tracked while the fixture runs: once a process exits, its
  // children are reparented and can no longer be found by descent.
  const owned = new Map<number, FixtureProcess>();
  const sample = (): FixtureProcess[] => {
    const rows = fixtureProcesses();
    const leader = rows.find((row) => row.pid === child.pid);
    if (leader && !exited && !owned.has(leader.pid))
      owned.set(leader.pid, leader);
    const registry = path.join(root, FIXTURE_PROCESS_DIRECTORY);
    for (const name of readdirSync(registry)) {
      if (!name.endsWith(".json")) continue; // Still being written.
      const row = JSON.parse(
        readFileSync(path.join(registry, name), "utf8"),
      ) as FixtureProcess;
      owned.set(row.pid, row);
    }
    collectFixtureDescendants(rows, owned);
    return rows;
  };
  const monitor = () => {
    try {
      sample();
      if (exited && exitCode === 0 && completionFile) {
        const file = path.join(root, completionFile);
        if (existsSync(file)) {
          const record = JSON.parse(readFileSync(file, "utf8")) as {
            exitCode: number;
            stdout: string;
          };
          exitCode = record.exitCode;
          stdout += record.stdout;
          finish();
        }
      }
    } catch (error) {
      cleanupErrors.push(`Fixture process inspection failed: ${error}`);
      finish();
    }
  };
  monitor();
  const interval = setInterval(monitor, SAMPLE_INTERVAL_MS);
  const timer = setTimeout(() => {
    reason = "timeout";
    finish();
  }, timeout);
  const cancel = () => {
    reason = "cancelled";
    finish();
  };
  abortSignal?.addEventListener("abort", cancel, { once: true });
  if (abortSignal?.aborted) cancel();

  await finished;
  clearInterval(interval);
  clearTimeout(timer);
  abortSignal?.removeEventListener("abort", cancel);

  let cleanupAssistance: "none" | "attempted" = "none";
  if (!exited && child.exitCode === null && child.signalCode === null) {
    cleanupAssistance = "attempted";
    child.kill("SIGKILL");
  }
  try {
    // A naturally exiting fixture gets a moment for its helpers to exit too.
    const grace = reason === "exit" ? EXIT_GRACE_MS : 0;
    if ((await killRemaining(sample, owned, grace)) === "attempted")
      cleanupAssistance = "attempted";
  } catch (error) {
    cleanupErrors.push(String(error));
  }

  // An escaped grandchild can hold the inherited pipes open; don't wait on it.
  if (
    !(await Promise.race([
      streamsClosed,
      delay(STREAM_CLOSE_MS).then(() => false),
    ]))
  )
    cleanupErrors.push("Fixture streams did not close after cleanup");
  child.stdout.destroy();
  child.stderr.destroy();

  // Keep the profile for inspection when anything above went wrong.
  if (cleanupErrors.length === 0)
    await rm(root, {
      recursive: true,
      force: true,
      maxRetries: 10,
      retryDelay: 100,
    }).catch((error: unknown) => {
      cleanupErrors.push(String(error));
    });

  return {
    exitCode,
    signal: exitSignal,
    reason,
    stdout,
    stderr,
    cleanupErrors,
    cleanupAssistance,
  };
}
