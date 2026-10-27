import path from "node:path";
import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { writeSync } from "node:fs";
import { tmpdir } from "node:os";
import { createResttyHostSessions } from "../fixtures/restty-host-sessions";
import { preparedWindows } from "../fixtures/prepared-windows-pty";
import type { IPty } from "node-pty";
import { spawnFixturePty } from "../fixtures/native-fixture-pty";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import {
  fixtureProcesses,
  type FixtureProcess,
} from "../fixtures/native-fixture-processes";
import { collectFixtureRegistrations } from "../fixtures/native-fixture-ownership";

// Every PTY call supplies its controlled spawn; no ESM mock of CJS fallback.
const io = vi.hoisted(() => ({
  files: new Map<string, string>(),
  failure: undefined as "write" | "rename" | undefined,
  published: 0,
}));
const { files } = io;
vi.mock("node:fs", () => ({
  writeSync: vi.fn(() => 0),
  writeFileSync: (name: string, text: string) => {
    files.set(name, text);
    if (io.failure === "write") throw new Error("private publication details");
  },
  readFileSync: (name: string) => {
    if (!files.has(name)) throw new Error("Missing ownership record");
    return files.get(name)!;
  },
  renameSync: (from: string, to: string) => {
    if (io.failure === "rename") throw new Error("private publication details");
    files.set(to, files.get(from)!);
    files.delete(from);
    io.published += 1;
  },
  readdirSync: () => [...files.keys()].map((name) => path.basename(name)),
}));
vi.mock("../fixtures/native-fixture-processes", async (importOriginal) => ({
  ...(await importOriginal<
    typeof import("../fixtures/native-fixture-processes")
  >()),
  fixtureProcesses: vi.fn(),
}));
const root = path.resolve("fixture-profile");
const owner: FixtureProcess = { pid: process.pid, parent: 1, identity: "100" };
const child: FixtureProcess = {
  pid: process.pid + 1,
  parent: owner.pid,
  identity: "200",
};
const unrelated: FixtureProcess = {
  pid: process.pid + 2,
  parent: 1,
  identity: "300",
};
const connectedChild = { ...child, pid: 1234 };
const temporary: string[] = [];
beforeEach(() => {
  files.clear();
  io.failure = undefined;
  io.published = 0;
  vi.mocked(writeSync).mockClear();
  vi.stubEnv("OMXTERM_NATIVE_FIXTURE_ROOT", root);
  vi.mocked(fixtureProcesses).mockReturnValue([owner, child, unrelated]);
});
afterEach(async () => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  for (const directory of temporary.splice(0))
    await rm(directory, { recursive: true, force: true });
});

async function composedOwnership(platform = "win32") {
  const directory = await mkdtemp(path.join(tmpdir(), "omxterm-ownership-js-"));
  temporary.push(directory);
  const runtime = await preparedWindows(directory);
  // Select the real adapter's OS branch without changing its dependency seam.
  vi.stubGlobal("process", { ...process, platform });
  const terminal = runtime.spawn() as IPty & EventEmitter;
  const removeListener = vi.spyOn(terminal, "removeListener");
  const subscribe = terminal.onExit;
  const disposals: ReturnType<typeof vi.fn>[] = [];
  Object.defineProperty(terminal, "onExit", {
    value: (listener: Parameters<IPty["onExit"]>[0]) => {
      const subscription = subscribe(listener);
      const dispose = vi.fn(() => subscription.dispose());
      disposals.push(dispose);
      return { dispose };
    },
  });
  const app = Object.assign(new EventEmitter(), { exit: vi.fn() });
  const window = { isDestroyed: () => false, destroy: vi.fn() };
  const registered = vi.fn();
  const exited = vi.fn();
  const fixture = createResttyHostSessions({
    spawn: (...args) =>
      spawnFixturePty(...args, { spawn: () => terminal, registered }),
    app,
    windows: () => [window],
    signals: new EventEmitter(),
    reportError: vi.fn(),
  });
  fixture.createSession({
    shell: "valid.exe",
    launchRequest: {
      kind: "explicit-command",
      executable: "valid.exe",
      arguments: [],
    },
    platform: "win32",
    homeDirectory: "C:\\synthetic",
    environment: {},
    applicationVersionProvider: { getVersion: () => "test" },
    onOutput: vi.fn(),
    onExit: exited,
  });
  const registration = () => {
    const owned = new Map<number, FixtureProcess>();
    const pending = collectFixtureRegistrations(root, owner.pid, owned);
    return { pending, processes: [...owned.values()] };
  };
  return {
    runtime,
    terminal,
    fixture,
    app,
    window,
    registered,
    exited,
    disposed: () => {
      const counts = disposals.map((dispose) => dispose.mock.calls.length);
      expect(removeListener.mock.calls.map(([event]) => event)).toEqual(
        counts[0] ? ["ready_datapipe"] : [],
      );
      return counts;
    },
    registration,
  };
}
const observationRecords = () =>
  vi
    .mocked(writeSync)
    .mock.calls.map(
      ([, text]) =>
        JSON.parse(
          String(text).replace("__OMXTERM_FIXTURE_REGISTRATION_FAILURE__", ""),
        ) as unknown,
    );

// These execute guarded prepared JS -> real ownership adapter -> real session
// owner. Inventories, native calls, sockets and workers remain controlled ports.
describe("prepared PTY, ownership adapter and real session-owner composition", () => {
  it.each([true, false])(
    "acquires a child created before connect throws despite public PID 0 (inventory sentinel=%s)",
    async (sentinel) => {
      vi.mocked(fixtureProcesses).mockReturnValue([owner]);
      const h = await composedOwnership();
      expect(h.registration().pending).toBe(1);
      const descendant = {
        pid: child.pid + 10,
        parent: child.pid,
        identity: "250",
      };
      const stale = { pid: child.pid + 11, parent: child.pid, identity: "150" };
      const orphan = {
        pid: child.pid + 12,
        parent: stale.pid,
        identity: "260",
      };
      h.runtime.native.connect.mockImplementationOnce(() => {
        // Model successful CreateProcess followed by a native throw before the
        // public PID assignment. Descendant order also requires closure traversal.
        vi.mocked(fixtureProcesses).mockReturnValue([
          owner,
          descendant,
          orphan,
          child,
          stale,
          unrelated,
          ...(sentinel ? [{ pid: 0, parent: 0, identity: "sentinel" }] : []),
        ]);
        throw new Error("error code: 1");
      });
      // Acquisition must precede the copied listener queue's session consumer.
      h.exited.mockImplementation(() => {
        expect(h.registration()).toEqual({
          pending: 0,
          processes: [owner, child, descendant],
        });
      });
      expect(() => h.runtime.worker.ready()).not.toThrow();
      expect(h.exited).toHaveBeenCalledExactlyOnceWith(
        { exitCode: 1, signal: 0, startupFailed: true },
        "explicit-command",
      );
      expect(h.terminal.pid).toBe(0);
      expect(h.registration()).toEqual({
        pending: 0,
        processes: [owner, child, descendant],
      });
      expect(observationRecords()).toEqual([]);
      expect(h.disposed()).toEqual([1, 1]);
      expect(h.registered).not.toHaveBeenCalled();
      const retained = [...files.values()];
      h.runtime.worker.ready();
      h.runtime.worker.error(new Error("late error"));
      h.terminal.emit("exit", 1, undefined, true);
      expect([...files.values()]).toEqual(retained);
      expect(io.published).toBe(2); // Write-ahead plus one atomic acquisition.
      expect(h.runtime.native.connect).toHaveBeenCalledOnce();
      expect(h.exited).toHaveBeenCalledOnce();
      expect(h.disposed()).toEqual([1, 1]);
      await h.fixture.complete(1);
      expect(h.app.exit).toHaveBeenCalledExactlyOnceWith(1);
    },
  );

  it.each(["connect", "worker", "timeout"])(
    "acquires an owner-only snapshot on terminal %s failure and seals late admission",
    async (failure) => {
      vi.mocked(fixtureProcesses).mockReturnValue([owner, unrelated]);
      vi.useFakeTimers();
      const h = await composedOwnership();
      if (failure === "connect") {
        h.runtime.native.connect.mockImplementationOnce(() => {
          throw new Error("error code: 1");
        });
        h.runtime.worker.ready();
      } else if (failure === "worker")
        h.runtime.worker.error(new Error("worker unavailable"));
      else vi.advanceTimersByTime(5000);
      expect(h.registration()).toEqual({ pending: 0, processes: [owner] });
      expect(h.terminal.pid).toBe(0);
      expect(h.exited).toHaveBeenCalledExactlyOnceWith(
        {
          exitCode: failure === "connect" ? 1 : -1,
          signal: 0,
          startupFailed: true,
        },
        "explicit-command",
      );
      expect(h.registered).not.toHaveBeenCalled();
      expect(h.disposed()).toEqual([1, 1]);
      expect(h.runtime.worker.dispose).toHaveBeenCalledOnce();
      const retained = [...files.values()];
      for (let repeat = 0; repeat < 2; repeat += 1) {
        h.runtime.worker.ready();
        h.runtime.worker.error(new Error("late worker error"));
      }
      vi.advanceTimersByTime(5000);
      expect(h.runtime.native.connect).toHaveBeenCalledTimes(
        failure === "connect" ? 1 : 0,
      );
      expect([...files.values()]).toEqual(retained);
      expect(io.published).toBe(2);
      expect(h.exited).toHaveBeenCalledOnce();
      expect(h.disposed()).toEqual([1, 1]);
      expect(observationRecords()).toEqual([]);
      await h.fixture.complete(1);
      expect(h.app.exit).toHaveBeenCalledExactlyOnceWith(1);
    },
  );

  it.each([
    "missing-owner",
    "reused-owner",
    "duplicate-owner",
    "inspection",
    "malformed-child",
    "write",
    "rename",
  ])(
    "latches failed-start %s failure without starving lifecycle or allowing later rescue",
    async (failure) => {
      vi.mocked(fixtureProcesses).mockReturnValue([owner]);
      const h = await composedOwnership();
      h.runtime.native.connect.mockImplementationOnce(() => {
        if (failure === "inspection")
          vi.mocked(fixtureProcesses).mockImplementationOnce(() => {
            throw new Error("private inventory details");
          });
        else
          vi.mocked(fixtureProcesses).mockReturnValue(
            failure === "missing-owner"
              ? [child]
              : failure === "reused-owner"
                ? [{ ...owner, identity: "999" }, child]
                : failure === "duplicate-owner"
                  ? [owner, { ...owner, identity: "999" }, child]
                  : failure === "malformed-child"
                    ? [owner, { ...child, identity: "not-a-creation-time" }]
                    : [owner, child],
          );
        if (failure === "write" || failure === "rename") io.failure = failure;
        throw new Error("error code: 1");
      });
      h.exited.mockImplementation(() => {
        expect(h.registration().pending).toBe(1);
      });
      expect(() => h.runtime.worker.ready()).not.toThrow();
      expect(h.exited).toHaveBeenCalledExactlyOnceWith(
        { exitCode: 1, signal: 0, startupFailed: true },
        "explicit-command",
      );
      expect(h.registration()).toEqual({ pending: 1, processes: [owner] });
      expect(observationRecords()).toEqual([
        ...(failure === "write" || failure === "rename"
          ? [
              {
                version: 1,
                branch: "failed-start",
                phase:
                  failure === "write"
                    ? "completed-write"
                    : "completed-replacement",
              },
            ]
          : []),
        {
          version: 1,
          branch: "failed-start",
          phase: "failed-start-observation",
        },
      ]);
      expect(h.disposed()).toEqual([1, 1]);
      const retained = [...files.entries()];
      io.failure = undefined;
      vi.mocked(fixtureProcesses).mockReturnValue([owner, connectedChild]);
      h.runtime.worker.ready();
      h.runtime.output.emit("connect");
      h.runtime.output.emit("ready_datapipe");
      h.terminal.emit("exit", 1, undefined, true);
      expect([...files.entries()]).toEqual(retained);
      expect(io.published).toBe(1);
      expect(h.registration().pending).toBe(1);
      expect(h.exited).toHaveBeenCalledOnce();
      expect(h.registered).not.toHaveBeenCalled();
      expect(h.disposed()).toEqual([1, 1]);
      await h.fixture.complete(1);
      expect(h.app.exit).toHaveBeenCalledExactlyOnceWith(1);
    },
  );

  it.each([
    ["win32", false, false, "early-exit"],
    ["linux", true, true, "early-exit"],
    ["win32", true, true, "failed-start"],
  ] as const)(
    "keeps platform=%s marked=%s positive=%s contradictory/unproven acquisition pending",
    async (platform, marked, positive, branch) => {
      vi.mocked(fixtureProcesses).mockReturnValue([owner]);
      const h = await composedOwnership(platform);
      if (positive) {
        h.runtime.worker.ready();
        h.runtime.output.emit("connect");
      }
      vi.mocked(fixtureProcesses).mockReturnValue([owner, connectedChild]);
      expect(() => h.terminal.emit("exit", 1, undefined, marked)).not.toThrow();
      expect(h.registration()).toEqual({ pending: 1, processes: [owner] });
      expect(observationRecords()).toEqual([
        {
          version: 1,
          branch,
          phase:
            branch === "failed-start"
              ? "failed-start-observation"
              : "exit-observation",
        },
      ]);
      expect(h.exited).toHaveBeenCalledExactlyOnceWith(
        { exitCode: 1, signal: 0, ...(marked ? { startupFailed: true } : {}) },
        "explicit-command",
      );
      expect(h.registered).not.toHaveBeenCalled();
      expect(h.disposed()).toEqual([1, 1]);
      // Consume any still-pending controlled connection before returning.
      h.runtime.worker.error(new Error("late error"));
      expect(h.registration().pending).toBe(1);
      await h.fixture.complete(1);
    },
  );
});

describe("ordinary prepared PTY actual-exit barriers", () => {
  it("retains a still-observable positive identity without starving the ordinary exit consumer", async () => {
    vi.mocked(fixtureProcesses).mockReturnValue([owner]);
    const h = await composedOwnership();
    h.runtime.worker.ready();
    h.runtime.output.emit("connect");
    expect(h.terminal.pid).toBe(connectedChild.pid);
    expect(h.registration().pending).toBe(1);
    vi.mocked(fixtureProcesses).mockReturnValue([owner, connectedChild]);
    h.runtime.nativeExit(1);
    expect(() => h.runtime.output.emit("close")).not.toThrow();
    expect(h.exited).toHaveBeenCalledExactlyOnceWith(
      { exitCode: 1, signal: 0 },
      "explicit-command",
    );
    expect(h.registration()).toEqual({ pending: 1, processes: [owner] });
    expect(observationRecords()).toEqual([
      { version: 1, branch: "early-exit", phase: "exit-observation" },
    ]);
    expect(h.disposed()).toEqual([1, 1]);
    const retained = [...files.values()];
    h.runtime.output.emit("ready_datapipe");
    h.runtime.output.emit("close");
    expect([...files.values()]).toEqual(retained);
    expect(h.exited).toHaveBeenCalledOnce();
    await h.fixture.complete(1);
    expect(h.app.exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(h.registration().pending).toBe(1);
  });

  it("keeps acquired readiness separate from close and completes only on an ordinary actual exit", async () => {
    vi.mocked(fixtureProcesses).mockReturnValue([
      owner,
      connectedChild,
      unrelated,
    ]);
    const h = await composedOwnership();
    h.runtime.worker.ready();
    h.runtime.output.emit("connect");
    expect(h.registration()).toEqual({
      pending: 0,
      processes: [owner, connectedChild],
    });
    expect(h.registered).toHaveBeenCalledExactlyOnceWith(h.terminal);
    expect(h.disposed()).toEqual([1, 0]);
    const retained = [...files.values()];
    h.runtime.output.emit("ready_datapipe");
    h.runtime.worker.error(new Error("late worker error"));
    const complete = h.fixture.complete(0);
    expect(h.fixture.complete(0)).toBe(complete);
    await Promise.resolve();
    expect(h.exited).not.toHaveBeenCalled();
    expect(h.app.exit).not.toHaveBeenCalled();
    expect(h.window.destroy).not.toHaveBeenCalled();
    expect([...files.values()]).toEqual(retained);
    vi.mocked(fixtureProcesses).mockReturnValue([owner, unrelated]);
    h.runtime.nativeExit(1);
    h.runtime.output.emit("close");
    await complete;
    h.terminal.emit("exit", 1, undefined, true);
    expect(h.exited).toHaveBeenCalledExactlyOnceWith(
      { exitCode: 1, signal: 0 },
      "explicit-command",
    );
    expect(h.app.exit).toHaveBeenCalledExactlyOnceWith(0);
    expect(h.window.destroy).toHaveBeenCalledOnce();
    expect(h.disposed()).toEqual([1, 1]);
    expect([...files.values()]).toEqual(retained);
    expect(h.registered).toHaveBeenCalledOnce();
    expect(io.published).toBe(2);
    expect(observationRecords()).toEqual([]);
  });

  it("does not complete an unregistered positive child on absence until its actual ordinary exit", async () => {
    vi.mocked(fixtureProcesses).mockReturnValue([owner, unrelated]);
    const h = await composedOwnership();
    h.runtime.worker.ready();
    h.runtime.output.emit("connect");
    expect(h.registration().pending).toBe(1);
    const complete = h.fixture.complete(0);
    await Promise.resolve();
    expect(h.app.exit).not.toHaveBeenCalled();
    expect(h.registration().pending).toBe(1);
    h.runtime.nativeExit(1);
    h.runtime.output.emit("close");
    await complete;
    expect(h.exited).toHaveBeenCalledExactlyOnceWith(
      { exitCode: 1, signal: 0 },
      "explicit-command",
    );
    expect(h.registration()).toEqual({ pending: 0, processes: [owner] });
    expect(h.disposed()).toEqual([1, 1]);
    expect(observationRecords()).toEqual([]);
    expect(h.app.exit).toHaveBeenCalledExactlyOnceWith(0);
  });

  it("records readiness observation failure and retires it without aborting later readiness or forging exit", async () => {
    vi.mocked(fixtureProcesses).mockReturnValue([owner]);
    const h = await composedOwnership();
    h.runtime.worker.ready();
    vi.mocked(fixtureProcesses).mockImplementationOnce(() => {
      throw new Error("private inventory details");
    });
    const laterReady = vi.fn();
    h.runtime.output.on("ready_datapipe", laterReady);
    expect(() => h.runtime.output.emit("connect")).not.toThrow();
    expect(laterReady).toHaveBeenCalledOnce();
    expect(h.exited).not.toHaveBeenCalled();
    expect(observationRecords()).toEqual([
      { version: 1, branch: "normal", phase: "ready-observation" },
    ]);
    expect(h.registration().pending).toBe(1);
    vi.mocked(fixtureProcesses).mockReturnValue([owner, connectedChild]);
    h.runtime.output.emit("ready_datapipe");
    expect(h.registration().pending).toBe(1);
    expect(h.registered).not.toHaveBeenCalled();
    const complete = h.fixture.complete(1);
    expect(h.app.exit).not.toHaveBeenCalled();
    h.runtime.nativeExit(1);
    h.runtime.output.emit("close");
    await complete;
    expect(h.exited).toHaveBeenCalledExactlyOnceWith(
      { exitCode: 1, signal: 0 },
      "explicit-command",
    );
    expect(h.disposed()).toEqual([1, 1]);
    expect(h.registration().pending).toBe(1);
    expect(h.app.exit).toHaveBeenCalledExactlyOnceWith(1);
  });

  it("records exit observation failure while reentrant completion shares the actual-exit drain", async () => {
    vi.mocked(fixtureProcesses).mockReturnValue([owner]);
    const h = await composedOwnership();
    h.runtime.worker.ready();
    h.runtime.output.emit("connect");
    let reentered: Promise<void> | undefined;
    h.exited.mockImplementation(() => {
      reentered = h.fixture.complete(1);
    });
    const complete = h.fixture.complete(0);
    expect(h.app.exit).not.toHaveBeenCalled();
    vi.mocked(fixtureProcesses).mockImplementationOnce(() => {
      throw Object.assign(new Error("private inventory details"), {
        code: "EIO",
      });
    });
    h.runtime.nativeExit(1);
    expect(() => h.runtime.output.emit("close")).not.toThrow();
    expect(reentered).toBe(complete);
    await complete;
    expect(h.app.exit).toHaveBeenCalledExactlyOnceWith(1);
    expect(h.exited).toHaveBeenCalledExactlyOnceWith(
      { exitCode: 1, signal: 0 },
      "explicit-command",
    );
    expect(h.registration().pending).toBe(1);
    expect(h.disposed()).toEqual([1, 1]);
    expect(observationRecords()).toEqual([
      {
        version: 1,
        branch: "early-exit",
        phase: "exit-observation",
        code: "EIO",
      },
    ]);
  });
});
