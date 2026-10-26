import { spawn, spawnSync } from "node:child_process";
import {
  mkdtemp,
  writeFile,
  chmod,
  symlink,
  mkdir,
  readdir,
  rm,
  cp,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyLinuxWrapperPropagation } from "../../scripts/linux-packaged-process.mjs";

// Control external filesystem I/O through the unchanged verifier caller.
// Native actors, streams, outcomes, recovery and pidfd validation remain real.
// Intercept only the owned launcher's real native notification. Recovery still
// invokes the unchanged pidfd helper with the verifier's actual targets.
const exitView = vi.hoisted(() => ({
  launcher: "",
  defer: false,
  received: undefined as Outcome | undefined,
  delivered: undefined as Outcome | undefined,
  atRecovery: undefined as
    | {
        outcome: Outcome | undefined;
        held: boolean;
        targets: Identity[];
        now: number;
      }
    | undefined,
  releasedAtRecovery: false,
  release: undefined as (() => void) | undefined,
  restore: undefined as (() => void) | undefined,
  onCapture: undefined as (() => void) | undefined,
  restoreClock: undefined as (() => void) | undefined,
  startRecovery(targets: Identity[]) {
    this.atRecovery = {
      outcome: this.delivered,
      held: this.release !== undefined,
      targets,
      now: Date.now(),
    };
    this.releasedAtRecovery = this.release !== undefined;
    this.retire();
  },
  retire() {
    // Recovery/failure admits late events even if none has been captured yet.
    this.defer = false;
    this.restoreClock?.();
    this.release?.();
  },
}));
vi.mock("node:child_process", async (importOriginal) => {
  const native = await importOriginal<typeof import("node:child_process")>();
  const path = await import("node:path");
  return {
    ...native,
    spawn(...args: Parameters<typeof native.spawn>) {
      const child = native.spawn(...args);
      if (args[0] !== exitView.launcher) return child;
      const emit: (event: string | symbol, ...values: unknown[]) => boolean =
        child.emit;
      exitView.restore = () => {
        child.emit = emit;
      };
      child.emit = function (event: string | symbol, ...values: unknown[]) {
        if (event !== "exit") return emit.call(this, event, ...values);
        const [code, signal] = values as [number | null, NodeJS.Signals | null];
        const outcome = { code, signal };
        exitView.received = outcome;
        exitView.onCapture?.();
        const deliver = () => {
          const result = emit.call(this, event, ...values);
          exitView.delivered = outcome;
          return result;
        };
        if (!exitView.defer) return deliver();
        exitView.release = () => {
          exitView.release = undefined;
          deliver();
        };
        return true;
      };
      return child;
    },
    spawnSync(...args: Parameters<typeof native.spawnSync>) {
      if (
        exitView.launcher &&
        args[0] === "python3" &&
        args[1]?.[1] === path.resolve("scripts/linux-packaged-signal.py") &&
        typeof args[2]?.input === "string"
      ) {
        const request = JSON.parse(args[2].input) as {
          signal?: string;
          recovery?: boolean;
          targets: Identity[];
        };
        if (request.recovery && request.signal === "SIGKILL") {
          // Snapshot construction, collection and this helper call are
          // synchronous: no exit callback can run between those boundaries.
          exitView.startRecovery(request.targets);
        }
      }
      return native.spawnSync(...args);
    },
  };
});
const procView = vi.hoisted(() => ({
  sample: undefined as undefined | ((names: string[]) => string[]),
  stat: undefined as undefined | ((file: string, text: string) => string),
  ackFault: "" as string,
  ackFaultCalls: 0,
  recordSuccess: false,
  recordedRoot: "",
}));
vi.mock("node:fs", async (importOriginal) => {
  const fs = await importOriginal<typeof import("node:fs")>();
  return {
    ...fs,
    readdirSync(directory: string) {
      const names = fs.readdirSync(directory);
      return directory === "/proc" && procView.sample
        ? procView.sample(names)
        : names;
    },
    readFileSync(...args: Parameters<typeof fs.readFileSync>) {
      const value = fs.readFileSync(...args);
      return typeof args[0] === "string" &&
        args[0].startsWith("/proc/") &&
        typeof value === "string" &&
        procView.stat
        ? procView.stat(args[0], value)
        : value;
    },
    renameSync(from: string, to: string) {
      if (procView.ackFault && to.endsWith(".acquired.json")) {
        procView.ackFaultCalls++;
        if (procView.ackFault === "missing") return;
        const ack = JSON.parse(fs.readFileSync(from, "utf8")) as {
          control: string;
          pid: number;
          start: string;
        };
        if (procView.ackFault === "stale") ack.start = "0";
        if (procView.ackFault === "wrong-actor") ack.pid = process.pid;
        if (procView.ackFault === "wrong-control") ack.control = "signal";
        fs.writeFileSync(
          from,
          procView.ackFault === "malformed" ? "{" : JSON.stringify(ack),
        );
      }
      return fs.renameSync(from, to);
    },
  };
});
vi.mock("node:fs/promises", async (importOriginal) => {
  const fs = await importOriginal<typeof import("node:fs/promises")>();
  const path = await import("node:path");
  return {
    ...fs,
    async rm(...args: Parameters<typeof fs.rm>) {
      const directory = args[0];
      if (
        procView.recordSuccess &&
        typeof directory === "string" &&
        path.basename(directory).startsWith("omxterm-wrapper-outcome-")
      ) {
        // Observe the actual receipts before the unchanged successful cleanup.
        procView.recordedRoot = path.resolve(
          ".scratch/694-acquisition-controls",
          path.basename(directory),
        );
        await fs.cp(directory, procView.recordedRoot, { recursive: true });
      }
      return fs.rm(...args);
    },
  };
});
const fs = await vi.importActual<typeof import("node:fs")>("node:fs");
const positiveSetupBudgetMs = 3_000;
const wallNow = Date.now;
function holdWrapperExpiryUntilExit() {
  const started = wallNow();
  let now = started;
  const clock = vi.spyOn(Date, "now").mockImplementation(() => now);
  const wallDeadline = started + positiveSetupBudgetMs;
  // Retire even if capture occurred but a failed setup never invokes recovery.
  const guard = setTimeout(
    () => exitView.retire(),
    Math.max(0, wallDeadline - wallNow()),
  );
  exitView.onCapture = () => {
    now = started + 250;
  };
  const retired = new Promise<void>((resolve) => {
    exitView.restoreClock = () => {
      clearTimeout(guard);
      clock.mockRestore();
      resolve();
    };
  });
  return { expiry: started + 250, wallDeadline, retired };
}
// Three controls, preflight/signaling/recovery bounds, and witness cleanup.
const nativeOutcomeGuardMs = 4 * positiveSetupBudgetMs + 3 * 2_000;
const roots: string[] = [];
const cleanup: Identity[] = [];
interface Identity {
  pid: number;
  parent: number;
  group: number;
  start: string;
}
interface Outcome {
  code: number | null;
  signal: string | null;
}
interface Receipt {
  acquired?: Identity;
  beforeCleanup: {
    outcome?: { code: number | null; signal: string | null };
    closed: boolean;
    remaining: Identity[];
  };
  outcome: { code: number | null; signal: string | null };
  closed: boolean;
  remaining: Identity[];
  stdout: string;
  stderr: string;
  failures: string[];
}
function identity(pid: number): Identity {
  const text = fs.readFileSync(`/proc/${pid}/stat`, "utf8");
  const fields = text
    .slice(text.lastIndexOf(")") + 2)
    .trim()
    .split(/\s+/u);
  return {
    pid,
    parent: Number(fields[1]),
    group: Number(fields[2]),
    start: fields[19]!,
  };
}
function json<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, "utf8")) as T;
}
async function until(
  check: () => boolean,
  now = Date.now,
  deadline = now() + positiveSetupBudgetMs,
) {
  while (!check()) {
    if (now() >= deadline)
      throw new Error("Acquisition fixture deadline exceeded");
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}
async function setup(mode = "control-streams") {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-acquisition-test-"));
  roots.push(root);
  const launcher = path.join(root, "AppImage");
  await writeFile(
    launcher,
    '#!/bin/sh\nexec "$OMXTERM_FIXTURE_NODE" "$OMXTERM_FIXTURE_ENTRY" wrapper "$@"\n',
  );
  await chmod(launcher, 0o700);
  await symlink(process.execPath, path.join(root, "omxterm"));
  vi.stubEnv("OMXTERM_FIXTURE_NODE", process.execPath);
  vi.stubEnv(
    "OMXTERM_FIXTURE_ENTRY",
    path.resolve("test/fixtures/linux-packaged-process.mjs"),
  );
  vi.stubEnv("OMXTERM_FIXTURE_ROOT", root);
  vi.stubEnv("OMXTERM_FIXTURE_MODE", mode);
  return { root, launcher };
}
async function failed(launcher: string, timeoutMs = 250) {
  let failure: unknown;
  try {
    await verifyLinuxWrapperPropagation(launcher, timeoutMs);
  } catch (cause) {
    failure = cause;
  }
  expect(failure).toBeInstanceOf(AggregateError);
  const error = failure as AggregateError;
  const directory = /wrapper controls retained at (.+)$/u.exec(
    error.message,
  )![1]!;
  const receipt = json<Receipt>(path.join(directory, "zero.json"));
  roots.push(directory);
  const retained = path.resolve(
    ".scratch/694-acquisition-controls",
    path.basename(directory),
  );
  await cp(directory, retained, {
    recursive: true,
    filter: (source) => !fs.lstatSync(source).isFIFO(),
  });
  const witness = path.join(path.dirname(launcher), "control-ready.json");
  if (fs.existsSync(witness))
    await cp(witness, path.join(retained, "fixture-witness.json"));
  return { error, directory, receipt };
}
function rootOnlyUntilReleased(
  released: () => boolean,
  heldSample: () => void = () => undefined,
) {
  let rootPid: number | undefined;
  procView.sample = (names) => {
    rootPid ??= names.map(Number).find((pid) => {
      try {
        const row = identity(pid);
        return row.parent === process.pid && row.group === pid;
      } catch {
        return false;
      }
    });
    if (released()) return names;
    heldSample();
    return names.filter((name) => Number(name) === rootPid);
  };
}
function lateHiddenCollection(root: string, timeoutMs: number) {
  const state = { ready: false };
  const sample = () => {
    if (state.ready || !fs.existsSync(`${root}/control-path`)) return;
    const stem = fs.readFileSync(`${root}/control-path`, "utf8");
    if (!fs.existsSync(`${stem}.proposal.json`)) return;
    const proposed = json<{ pid: number; start: string }>(
      `${stem}.proposal.json`,
    );
    const witness = identity(proposed.pid);
    cleanup.push(witness);
    expect(witness.start).toBe(proposed.start);
    expect(fs.existsSync(`${stem}.acquired.json`)).toBe(false);
    const deadline = Number(
      fs.readFileSync(`${root}/control-deadline`, "utf8"),
    );
    const started = deadline - timeoutMs;
    // One bounded scheduling fault, not an ownership/readiness substitute. Keep
    // this collection hidden until setup +220 ms: the next 50 ms opportunity is
    // too late for the deliberate 250 ms negative, but not the positive budget.
    const pause = Math.max(0, Math.min(220, started + 220 - Date.now()));
    const before = Date.now();
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, pause);
    const hiddenAt = Date.now();
    const retained = path.resolve(
      ".scratch/694-acquisition-controls",
      path.basename(path.dirname(stem)),
    );
    fs.mkdirSync(retained, { recursive: true });
    fs.writeFileSync(
      path.join(retained, "late-hidden.json"),
      JSON.stringify({
        timeoutMs,
        deadline,
        started,
        before,
        pause,
        hiddenAt,
        witness,
      }),
    );
    state.ready = true;
  };
  return { state, sample };
}
afterEach(async () => {
  // Release any captured real event even if an assertion or recovery failed,
  // then retire interception before independent fixture cleanup.
  exitView.retire();
  exitView.restore?.();
  exitView.launcher = "";
  exitView.defer = false;
  exitView.received = undefined;
  exitView.delivered = undefined;
  exitView.atRecovery = undefined;
  exitView.releasedAtRecovery = false;
  exitView.release = undefined;
  exitView.restore = undefined;
  exitView.onCapture = undefined;
  exitView.restoreClock = undefined;
  procView.sample = undefined;
  procView.stat = undefined;
  procView.ackFault = "";
  procView.ackFaultCalls = 0;
  procView.recordSuccess = false;
  procView.recordedRoot = "";
  vi.unstubAllEnvs();
  // Independent native witnesses are for test recovery only, including when an
  // ordering assertion fails. Never inject them into the verifier's ownership.
  for (const root of roots) {
    if (!fs.existsSync(`${root}/control-ready.json`)) continue;
    const witness = json<{ leader: Identity; worker: Identity }>(
      `${root}/control-ready.json`,
    );
    cleanup.push(witness.worker, witness.leader);
  }
  if (cleanup.length) {
    const targets = cleanup.splice(0);
    const result = spawnSync(
      "python3",
      ["-I", path.resolve("scripts/linux-packaged-signal.py")],
      {
        input: JSON.stringify({ targets, signal: "SIGKILL", recovery: true }),
        encoding: "utf8",
        timeout: 2_000,
      },
    );
    expect(result.status, result.stderr).toBe(0);
    await until(() =>
      targets.every((target) => !fs.existsSync(`/proc/${target.pid}/stat`)),
    );
  }
  for (const root of roots.splice(0))
    await rm(root, { recursive: true, force: true });
});

it.each(["before native capture", "after native capture"])(
  "delivers the real exit with an open gate and real clock when recovery starts %s",
  async (ordering) => {
    const expectedHeld = ordering === "after native capture";
    exitView.launcher = process.execPath;
    exitView.defer = true;
    const clock = expectedHeld ? holdWrapperExpiryUntilExit() : undefined;
    const child = spawn(process.execPath, ["-e", "process.exit(7)"], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const closed = new Promise<void>((resolve, reject) => {
      child.once("error", reject);
      child.once("close", () => resolve());
    });
    const delivered: Outcome[] = [];
    let realClockAtDelivery = false;
    let gateOpenAtDelivery = false;
    child.on("exit", (code, signal) => {
      delivered.push({ code, signal });
      realClockAtDelivery = Date.now === wallNow;
      gateOpenAtDelivery = !exitView.defer;
    });
    try {
      if (clock) {
        expect(Date.now()).toBe(clock.expiry - 250);
        await until(
          () => exitView.received !== undefined,
          wallNow,
          clock.wallDeadline,
        );
        expect(Date.now()).toBe(clock.expiry);
        expect(exitView.delivered).toBeUndefined();
      }
      // Without the capture wait, this transition precedes any native callback.
      exitView.startRecovery([]);
      expect(exitView.atRecovery).toMatchObject({
        outcome: undefined,
        held: expectedHeld,
        targets: [],
      });
      await closed;
      expect(child.exitCode).toBe(7);
      expect(child.signalCode).toBeNull();
      expect(exitView.received).toStrictEqual({ code: 7, signal: null });
      expect(delivered).toStrictEqual([exitView.received]);
      expect(exitView.delivered).toBe(exitView.received);
      expect(exitView.release).toBeUndefined();
      expect(exitView.releasedAtRecovery).toBe(expectedHeld);
      expect(realClockAtDelivery).toBe(true);
      expect(gateOpenAtDelivery).toBe(true);
    } finally {
      exitView.retire();
      await closed;
    }
  },
);

it(
  "retires the frozen wrapper clock on the independent wall guard when capture never arrives",
  async () => {
    exitView.defer = true;
    const { expiry, retired } = holdWrapperExpiryUntilExit();
    try {
      expect(Date.now()).toBe(expiry - 250);
      await retired;
      // Retirement cannot depend on reaching finally after a blocked join.
      expect(Date.now).toBe(wallNow);
      expect(exitView.defer).toBe(false);
      expect(exitView.received).toBeUndefined();
      expect(exitView.release).toBeUndefined();
    } finally {
      exitView.retire();
    }
  },
  nativeOutcomeGuardMs,
);

describe.skipIf(process.platform !== "linux")(
  "Linux finite wrapper acquisition through the verifier",
  () => {
    it.each(["normal", "deferred"])(
      "holds a ready stream-owning worker through a collection gap with %s exit notification, preserving exit 7 and timeout on recovery",
      async (notification) => {
        const { root, launcher } = await setup();
        exitView.launcher = launcher;
        exitView.defer = notification === "deferred";
        const { expiry, wallDeadline } = holdWrapperExpiryUntilExit();
        let release = false;
        let sampledReady = false;
        rootOnlyUntilReleased(
          () => release,
          () => {
            sampledReady ||= fs.existsSync(`${root}/control-ready.json`);
          },
        );
        const pending = failed(launcher);
        // Observe any early setup rejection while the independent guard runs.
        void pending.catch(() => undefined);
        try {
          await until(
            () => {
              if (!sampledReady) return false;
              if (!release) {
                const witness = json<{ leader: Identity; worker: Identity }>(
                  `${root}/control-ready.json`,
                );
                cleanup.push(witness.worker, witness.leader);
                const stem = fs.readFileSync(`${root}/control-path`, "utf8");
                // Readiness alone cannot release the wrapper or authorize a signal target.
                expect(identity(witness.leader.pid).start).toBe(
                  witness.leader.start,
                );
                expect(identity(witness.worker.pid).parent).toBe(
                  witness.leader.pid,
                );
                expect(fs.existsSync(`${stem}.acquired.json`)).toBe(false);
                expect(
                  Number(fs.readFileSync(`${root}/control-deadline`, "utf8")),
                ).toBe(expiry);
                release = true;
              }
              return exitView.received !== undefined;
            },
            wallNow,
            wallDeadline,
          );
          await pending;
        } finally {
          release = true;
          // A setup/capture failure must unfreeze expiry before joining recovery.
          exitView.retire();
          await pending;
        }
        const { receipt } = await pending;
        const witness = json<{ worker: Identity }>(
          `${root}/control-ready.json`,
        );
        expect(receipt.acquired).toEqual(witness.worker);
        expect(exitView.atRecovery).toBeDefined();
        expect(exitView.atRecovery!.now).toBe(expiry);
        expect(Date.now).toBe(wallNow);
        expect(exitView.atRecovery!.targets).toEqual(
          receipt.beforeCleanup.remaining,
        );
        if (notification === "deferred") {
          expect(exitView.atRecovery!.held).toBe(true);
          expect(exitView.atRecovery!.outcome).toBeUndefined();
          expect(exitView.releasedAtRecovery).toBe(true);
          expect(receipt.beforeCleanup).not.toHaveProperty("outcome");
        } else {
          expect(exitView.atRecovery!.held).toBe(false);
          expect(exitView.releasedAtRecovery).toBe(false);
        }
        expect(exitView.release).toBeUndefined();
        expect(exitView.received).toStrictEqual({ code: 7, signal: null });
        expect(exitView.delivered).toBe(exitView.received);
        // Reparenting proves native parent exit, not JS notification delivery.
        // Require exactly what was observed at the snapshot, including absence.
        expect(receipt.beforeCleanup.outcome).toStrictEqual(
          exitView.atRecovery!.outcome,
        );
        if (exitView.atRecovery!.outcome !== undefined)
          expect(receipt.beforeCleanup.outcome).toStrictEqual({
            code: 7,
            signal: null,
          });
        expect(receipt.beforeCleanup.closed).toBe(false);
        expect(receipt.beforeCleanup.remaining).toHaveLength(1);
        const orphan = receipt.beforeCleanup.remaining[0]!;
        expect(orphan.pid).toBe(witness.worker.pid);
        expect(orphan.start).toBe(witness.worker.start);
        expect(orphan.group).toBe(witness.worker.group);
        expect(orphan.parent).toBeTypeOf("number");
        expect(orphan.parent).not.toBe(witness.worker.parent);
        expect(receipt.outcome).toStrictEqual({ code: 7, signal: null });
        expect(receipt.outcome).toStrictEqual(exitView.received);
        expect(receipt.stdout).toBe("control stdout retained\n");
        expect(receipt.stderr).toBe("control stderr retained\n");
        expect(receipt.remaining).toEqual([]);
        expect(receipt.closed).toBe(true);
        expect(receipt.failures).toEqual([
          "Linux wrapper outcome control did not settle",
        ]);
      },
      // Existing outer guard covers wall-clock setup and bounded native recovery.
      nativeOutcomeGuardMs,
    );

    it(
      "keeps the generated Run-as-Node actor alive without acknowledgement before exercising all three native outcomes",
      async () => {
        const { root, launcher } = await setup("normal");
        let release = false;
        const hidden = lateHiddenCollection(root, positiveSetupBudgetMs);
        procView.recordSuccess = true;
        rootOnlyUntilReleased(() => release, hidden.sample);
        const pending = verifyLinuxWrapperPropagation(
          launcher,
          positiveSetupBudgetMs,
        );
        try {
          await until(() => hidden.state.ready);
          const stem = fs.readFileSync(`${root}/control-path`, "utf8");
          const proposed = json<{ pid: number; start: string }>(
            `${stem}.proposal.json`,
          );
          cleanup.push(identity(proposed.pid));
          expect(identity(proposed.pid).start).toBe(proposed.start);
          expect(fs.existsSync(`${stem}.acquired.json`)).toBe(false);
          release = true;
        } finally {
          release = true;
          await pending;
        }
        await expect(pending).resolves.toMatch(/^[a-f0-9]{64}$/u);
        const completedStem = fs.readFileSync(`${root}/control-path`, "utf8");
        expect(fs.existsSync(path.dirname(completedStem))).toBe(false);
        expect(procView.recordedRoot).not.toBe("");
        const held = json<{ witness: Identity }>(
          path.join(procView.recordedRoot, "late-hidden.json"),
        );
        expect(
          json<Receipt>(path.join(procView.recordedRoot, "zero.json")).acquired,
        ).toEqual(held.witness);
        for (const [name, code] of [
          ["zero", 0],
          ["nonzero", 3],
          ["signal", 127],
        ] as const) {
          const stem = path.join(procView.recordedRoot, name);
          const receipt = json<Receipt>(`${stem}.json`);
          const proposed = json<{ pid: number; start: string }>(
            `${stem}.proposal.json`,
          );
          expect(receipt.acquired).toMatchObject({
            pid: proposed.pid,
            start: proposed.start,
          });
          expect(receipt.beforeCleanup).toEqual({
            outcome: { code, signal: null },
            closed: true,
            remaining: [],
          });
          expect(receipt.outcome).toEqual({ code, signal: null });
          expect(receipt.closed).toBe(true);
          expect(receipt.remaining).toEqual([]);
          expect(receipt.stdout).toBe(`OMXTERM_WRAPPER_CONTROL_${name}`);
          expect(receipt.stderr).toBe("");
          expect(receipt.failures).toEqual([]);
        }
      },
      nativeOutcomeGuardMs,
    );

    it(
      "keeps generated actor paths literal across shell metacharacters",
      async () => {
        const { root, launcher } = await setup("normal");
        const temporary = path.join(root, "space $HOME `literal` ' \" control");
        await mkdir(temporary);
        vi.stubEnv("TMPDIR", temporary);
        await expect(
          verifyLinuxWrapperPropagation(launcher, positiveSetupBudgetMs),
        ).resolves.toMatch(/^[a-f0-9]{64}$/u);
        expect(await readdir(temporary)).toEqual([]);
      },
      nativeOutcomeGuardMs,
    );

    it("still exposes the missed orphan when an early-release control deliberately bypasses acquisition", async () => {
      const { root, launcher } = await setup("control-early-release");
      // Expose only the root until it is absent; then expose the orphan. This
      // forces the diagnosed ordering rather than relying on incidental timing.
      let rootPid: number | undefined;
      rootOnlyUntilReleased(
        () => rootPid !== undefined && !fs.existsSync(`/proc/${rootPid}/stat`),
      );
      const sample = procView.sample!;
      procView.sample = (names) => {
        const visible = sample(names);
        rootPid ??= visible.map(Number).find((pid) => {
          try {
            return identity(pid).parent === process.pid;
          } catch {
            return false;
          }
        });
        return visible;
      };
      const { error, directory, receipt } = await failed(launcher);
      const witness = json<{ worker: Identity }>(`${root}/control-ready.json`);
      cleanup.push(witness.worker);
      expect(identity(witness.worker.pid).start).toBe(witness.worker.start);
      expect(receipt.acquired).toBeUndefined();
      expect(receipt.beforeCleanup).toEqual({
        outcome: { code: 7, signal: null },
        closed: false,
        remaining: [],
      });
      expect(receipt.closed).toBe(false);
      expect(receipt.remaining).toEqual([]);
      expect(fs.existsSync(`${directory}/zero.acquired.json`)).toBe(false);
      expect(error.message).toContain("acquisition did not complete");
      expect(receipt.failures).toEqual(
        expect.arrayContaining([
          "Linux wrapper outcome control did not settle",
          "Linux wrapper control failure cleanup did not settle",
        ]),
      );
    });

    it.each([
      "missing",
      "malformed",
      "oversized",
      "stale",
      "wrong-control",
      "wrong-actor",
      "foreign",
      "symlink",
      "directory",
      "fifo",
    ])(
      "rejects %s proposals without acknowledging or signaling a foreign sentinel",
      async (fault) => {
        const { launcher } = await setup(`control-${fault}`);
        const sentinel = spawn(
          process.execPath,
          ["-e", "setTimeout(() => process.exit(98), 10000)"],
          { detached: true, stdio: "ignore" },
        );
        const foreign = identity(sentinel.pid!);
        cleanup.push(foreign);
        vi.stubEnv(
          "OMXTERM_FIXTURE_FOREIGN",
          JSON.stringify({ pid: foreign.pid, start: foreign.start }),
        );
        const { error, directory, receipt } = await failed(launcher);
        expect(receipt.acquired).toBeUndefined();
        expect(fs.existsSync(`${directory}/zero.acquired.json`)).toBe(false);
        expect(receipt.remaining).toEqual([]);
        expect(receipt.closed).toBe(true);
        expect(identity(foreign.pid).start).toBe(foreign.start);
        expect(sentinel.exitCode).toBeNull();
        expect(sentinel.signalCode).toBeNull();
        expect(error.message).toMatch(
          /acquisition|JSON|Oversized|wrapper control file|ELOOP/u,
        );
      },
    );

    it.each(["initial-gap", "reused-root", "exited-root"])(
      "never seeds ownership from a later %s observation",
      async (gap) => {
        const { root, launcher } = await setup();
        let samples = 0;
        let leaderPid: number | undefined;
        let leaderReads = 0;
        procView.sample = (names) => {
          leaderPid ??= names.map(Number).find((pid) => {
            try {
              const row = identity(pid);
              return row.parent === process.pid && row.group === pid;
            } catch {
              return false;
            }
          });
          if (++samples === 1 && gap === "initial-gap") return [];
          return names;
        };
        procView.stat = (file, text) => {
          if (
            gap === "initial-gap" ||
            file !== `/proc/${leaderPid}/stat` ||
            ++leaderReads === 1
          )
            return text;
          const end = text.lastIndexOf(")") + 2;
          const fields = text.slice(end).trim().split(/\s+/u);
          if (gap === "reused-root") fields[19] = "0";
          else fields[0] = "Z";
          return text.slice(0, end) + fields.join(" ");
        };
        const { receipt, directory } = await failed(launcher);
        const witness = json<{ leader: Identity; worker: Identity }>(
          `${root}/control-ready.json`,
        );
        cleanup.push(witness.worker, witness.leader);
        expect(receipt.acquired).toBeUndefined();
        expect(receipt.beforeCleanup.remaining).toEqual([]);
        expect(receipt.remaining).toEqual([]);
        expect(receipt.closed).toBe(false);
        expect(fs.existsSync(`${directory}/zero.acquired.json`)).toBe(false);
        expect(identity(witness.worker.pid).start).toBe(witness.worker.start);
        expect(receipt.failures).toEqual([
          "Linux wrapper control acquisition did not complete",
          "Linux wrapper outcome control did not settle",
          "Linux wrapper control failure cleanup did not settle",
        ]);
      },
    );

    it.each(["missing", "stale", "wrong-actor", "wrong-control", "malformed"])(
      "does not execute a generated actor's native action with %s acknowledgement",
      async (fault) => {
        const { launcher } = await setup("normal");
        procView.ackFault = fault;
        const { error, receipt } = await failed(
          launcher,
          positiveSetupBudgetMs,
        );
        expect(procView.ackFaultCalls).toBe(1);
        expect(receipt.acquired).toBeDefined();
        expect(receipt.stdout).toBe("");
        expect(receipt.closed).toBe(true);
        expect(receipt.remaining).toEqual([]);
        expect(error.message).toMatch(
          /control did not settle|masks or fails zero outcome/u,
        );
      },
      nativeOutcomeGuardMs,
    );

    it(
      "does not release a worker when acknowledgement publication is missing after a late hidden collection",
      async () => {
        const { root, launcher } = await setup();
        procView.ackFault = "missing";
        const hidden = lateHiddenCollection(root, positiveSetupBudgetMs);
        rootOnlyUntilReleased(() => hidden.state.ready, hidden.sample);
        const { receipt, directory } = await failed(
          launcher,
          positiveSetupBudgetMs,
        );
        const witness = json<{ leader: Identity; worker: Identity }>(
          `${root}/control-ready.json`,
        );
        expect(procView.ackFaultCalls).toBe(1);
        expect(fs.existsSync(`${directory}/zero.acquired.json`)).toBe(false);
        expect(receipt).toStrictEqual({
          acquired: witness.worker,
          beforeCleanup: {
            closed: false,
            remaining: [witness.leader, witness.worker],
          },
          outcome: { code: null, signal: "SIGKILL" },
          stdout: "control stdout retained\n",
          stderr: "control stderr retained\n",
          closed: true,
          remaining: [],
          failures: ["Linux wrapper outcome control did not settle"],
        });
      },
      nativeOutcomeGuardMs,
    );
  },
);

it.skipIf(process.platform !== "linux")(
  "expires the deliberate 250 ms control after a late hidden collection without releasing the actor, then settles cleanup",
  async () => {
    const { root, launcher } = await setup("normal");
    let release = false;
    const hidden = lateHiddenCollection(root, 250);
    rootOnlyUntilReleased(() => release, hidden.sample);
    const pending = failed(launcher);
    try {
      await until(() => hidden.state.ready);
      const stem = fs.readFileSync(`${root}/control-path`, "utf8");
      expect(fs.existsSync(`${stem}.acquired.json`)).toBe(false);
      release = true;
    } finally {
      release = true;
      await pending;
    }
    const { error, directory, receipt } = await pending;
    expect(error.message).toContain(
      "Linux wrapper control acquisition did not complete",
    );
    expect(receipt.acquired).toBeUndefined();
    expect(fs.existsSync(`${directory}/zero.acquired.json`)).toBe(false);
    expect(receipt.stdout).toBe("");
    expect(receipt.stderr).toContain(
      "Linux wrapper actor acquisition deadline exceeded",
    );
    expect(receipt.outcome).not.toEqual({ code: 0, signal: null });
    expect(receipt.closed).toBe(true);
    expect(receipt.remaining).toEqual([]);
  },
  nativeOutcomeGuardMs,
);
