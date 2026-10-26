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
import {
  collectFixtureRegistrations,
  spawnFixtureProcess,
} from "../fixtures/native-fixture-ownership";

vi.mock("node-pty", () => ({
  spawn: vi.fn(() => {
    throw new Error("Native PTY must not run in ownership units");
  }),
}));

const io = vi.hoisted(() => ({
  files: new Map<string, string>(),
  observeWrite: undefined as (() => void) | undefined,
}));
const { files } = io;
vi.mock("node:fs", () => ({
  writeSync: vi.fn(() => 0),
  writeFileSync: (name: string, text: string) => {
    files.set(name, "");
    io.observeWrite?.();
    files.set(name, text.slice(0, Math.floor(text.length / 2)));
    io.observeWrite?.();
    files.set(name, text);
    io.observeWrite?.();
  },
  readFileSync: (name: string) => {
    if (!files.has(name)) throw new Error("Missing ownership record");
    return files.get(name)!;
  },
  renameSync: (from: string, to: string) => {
    files.set(to, files.get(from)!);
    files.delete(from);
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

beforeEach(() => {
  files.clear();
  io.observeWrite = undefined;
  vi.mocked(writeSync).mockClear();
  vi.stubEnv("OMXTERM_NATIVE_FIXTURE_ROOT", root);
  vi.mocked(fixtureProcesses).mockReturnValue([owner, child, unrelated]);
});
afterEach(() => vi.unstubAllEnvs());

const temporary: string[] = [];
afterEach(async () => {
  for (const directory of temporary.splice(0))
    await rm(directory, { recursive: true, force: true });
});

async function composedOwnership() {
  const directory = await mkdtemp(path.join(tmpdir(), "omxterm-ownership-js-"));
  temporary.push(directory);
  const runtime = await preparedWindows(directory);
  const terminal = runtime.spawn();
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
    disposed: () => disposals.map((dispose) => dispose.mock.calls.length),
    registration,
  };
}

const connectedChild = { ...child, pid: 1234 };
const observationRecords = () =>
  vi
    .mocked(writeSync)
    .mock.calls.map(
      ([, text]) =>
        JSON.parse(
          String(text).replace("__OMXTERM_FIXTURE_REGISTRATION_FAILURE__", ""),
        ) as unknown,
    );

describe("prepared PTY, ownership adapter and real session-owner composition", () => {
  it.each([true, false])(
    "delivers a marked connect error without completing PID 0 ownership (inventory sentinel=%s)",
    async (sentinel) => {
      vi.mocked(fixtureProcesses).mockReturnValue([
        owner,
        ...(sentinel ? [{ pid: 0, parent: 0, identity: "sentinel" }] : []),
      ]);
      const h = await composedOwnership();
      expect(h.registration().pending).toBe(1);
      h.runtime.native.connect.mockImplementationOnce(() => {
        throw new Error("error code: 1");
      });
      let thrown: unknown;
      try {
        h.runtime.worker.ready();
      } catch (error) {
        thrown = error;
      }
      // The original emitter aborts its copied listener queue on the ownership throw.
      expect({ thrown, downstream: h.exited.mock.calls }).toEqual({
        thrown: undefined,
        downstream: [
          [{ exitCode: 1, signal: 0, startupFailed: true }, "explicit-command"],
        ],
      });
      expect(h.terminal.pid).toBe(0);
      expect(h.registration()).toEqual({ pending: 1, processes: [owner] });
      expect(observationRecords()).toEqual([
        { version: 1, branch: "early-exit", phase: "exit-observation" },
      ]);
      expect(h.disposed()).toEqual([1, 1]);
      expect(h.registered).not.toHaveBeenCalled();
      const retained = [...files.values()];
      h.runtime.worker.ready();
      expect([...files.values()]).toEqual(retained);
      expect(h.runtime.native.connect).toHaveBeenCalledOnce();
      await h.fixture.complete(1);
      expect(h.app.exit).toHaveBeenCalledExactlyOnceWith(1);
      // Session delivery is not registration success or proof of native retirement.
      expect(h.registration().pending).toBe(1);
    },
  );

  it("retains a still-observable positive identity without starving the ordinary exit consumer", async () => {
    vi.mocked(fixtureProcesses).mockReturnValue([owner]);
    const h = await composedOwnership();
    h.runtime.worker.ready();
    h.runtime.output.emit("connect");
    expect(h.terminal.pid).toBe(connectedChild.pid);
    expect(h.registration().pending).toBe(1);
    vi.mocked(fixtureProcesses).mockReturnValue([owner, connectedChild]);
    h.runtime.nativeExit(1);
    let thrown: unknown;
    try {
      h.runtime.output.emit("close");
    } catch (error) {
      thrown = error;
    }
    expect({ thrown, downstream: h.exited.mock.calls }).toEqual({
      thrown: undefined,
      downstream: [[{ exitCode: 1, signal: 0 }, "explicit-command"]],
    });
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

  it("keeps verified readiness separate from close and completes only on an ordinary actual exit", async () => {
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
    const complete = h.fixture.complete(0);
    expect(h.fixture.complete(0)).toBe(complete);
    await Promise.resolve();
    expect(h.exited).not.toHaveBeenCalled();
    expect(h.app.exit).not.toHaveBeenCalled();
    expect(h.window.destroy).not.toHaveBeenCalled();
    vi.mocked(fixtureProcesses).mockReturnValue([owner, unrelated]);
    h.runtime.nativeExit(1);
    h.runtime.output.emit("close");
    await complete;
    expect(h.exited).toHaveBeenCalledExactlyOnceWith(
      { exitCode: 1, signal: 0 },
      "explicit-command",
    );
    expect(h.app.exit).toHaveBeenCalledExactlyOnceWith(0);
    expect(h.window.destroy).toHaveBeenCalledOnce();
    expect(h.disposed()).toEqual([1, 1]);
    expect(h.registration()).toEqual({
      pending: 0,
      processes: [owner, connectedChild],
    });
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

describe("native fixture spawn ownership", () => {
  it("recovers an explicitly registered child after its parent disappears, excluding unrelated processes", () => {
    const spawned = { pid: child.pid };
    expect(spawnFixtureProcess(() => spawned)).toBe(spawned);
    vi.mocked(fixtureProcesses).mockReturnValue([
      { ...child, parent: 1 },
      unrelated,
    ]);
    const owned = new Map<number, FixtureProcess>();
    expect(collectFixtureRegistrations(root, owner.pid, owned)).toBe(0);
    expect([...owned.values()]).toEqual([owner, child]);
  });

  it("exposes only complete records while either ownership state is being published", () => {
    let spawned = false;
    let observations = 0;
    io.observeWrite = () => {
      observations += 1;
      expect(collectFixtureRegistrations(root, owner.pid, new Map())).toBe(
        spawned ? 1 : 0,
      );
    };
    spawnFixtureProcess(() => {
      expect(collectFixtureRegistrations(root, owner.pid, new Map())).toBe(1);
      spawned = true;
      return { pid: child.pid };
    });
    expect(observations).toBeGreaterThan(0);
    expect(collectFixtureRegistrations(root, owner.pid, new Map())).toBe(0);
  });

  it("defers Windows ownership until launcher metadata arrives without adopting unverified processes", () => {
    spawnFixtureProcess(() => ({ pid: child.pid }));
    const owned = new Map<number, FixtureProcess>();
    expect(collectFixtureRegistrations(root, undefined, owned)).toBe(1);
    expect(owned.size).toBe(0);
    // Unresolved bootstrap must continue to count as uncertainty at cleanup.
    expect(collectFixtureRegistrations(root, undefined, owned)).toBe(1);
    expect(collectFixtureRegistrations(root, owner.pid, owned)).toBe(0);
    expect([...owned.values()]).toEqual([owner, child]);
    expect(() =>
      collectFixtureRegistrations(root, unrelated.pid, new Map()),
    ).toThrow("Invalid native fixture ownership record");
  });

  it("publishes uncertainty before invoking spawn and preserves it on a spawn exception", () => {
    expect(() =>
      spawnFixtureProcess(() => {
        expect(collectFixtureRegistrations(root, owner.pid, new Map())).toBe(1);
        throw new Error("partial native spawn failure");
      }),
    ).toThrow("partial native spawn failure");
    expect(collectFixtureRegistrations(root, owner.pid, new Map())).toBe(1);
  });

  it("does not complete registration when the spawned identity cannot be established", () => {
    vi.mocked(fixtureProcesses).mockReturnValue([owner, unrelated]);
    expect(() => spawnFixtureProcess(() => ({ pid: child.pid }))).toThrow(
      "Cannot establish ownership",
    );
    expect(collectFixtureRegistrations(root, owner.pid, new Map())).toBe(1);
  });

  it("retains early-exit uncertainty until the actual native callback and excludes unrelated PIDs", () => {
    vi.mocked(fixtureProcesses).mockReturnValue([owner, unrelated]);
    let nativeExit!: () => void;
    const spawned = { pid: child.pid };
    expect(
      spawnFixtureProcess(
        () => spawned,
        (_child, completed) => {
          nativeExit = completed;
        },
      ),
    ).toBe(spawned);
    expect(collectFixtureRegistrations(root, owner.pid, new Map())).toBe(1);
    nativeExit();
    const owned = new Map<number, FixtureProcess>();
    expect(collectFixtureRegistrations(root, owner.pid, owned)).toBe(0);
    expect([...owned.values()]).toEqual([owner]);
  });

  it("does not settle early-exit ownership while that PID is still observable", () => {
    vi.mocked(fixtureProcesses).mockReturnValue([owner]);
    let nativeExit!: () => void;
    spawnFixtureProcess(
      () => ({ pid: child.pid }),
      (_child, completed) => {
        nativeExit = completed;
      },
    );
    vi.mocked(fixtureProcesses).mockReturnValue([
      owner,
      { ...child, parent: 1 },
    ]);
    expect(nativeExit).not.toThrow();
    expect(observationRecords()).toEqual([
      { version: 1, branch: "early-exit", phase: "exit-observation" },
    ]);
    expect(collectFixtureRegistrations(root, owner.pid, new Map())).toBe(1);
  });

  it("registers a pending PID only at verified readiness, without waiting for output", () => {
    const spawned = { pid: 0 };
    let ready!: () => boolean;
    const retire = vi.fn();
    vi.mocked(fixtureProcesses).mockReturnValue([owner, unrelated]);
    spawnFixtureProcess(
      () => spawned,
      (_child, _exited, atReady) => {
        ready = atReady;
        return retire;
      },
    );
    expect(collectFixtureRegistrations(root, owner.pid, new Map())).toBe(1);
    expect(ready()).toBe(false);
    spawned.pid = child.pid;
    // A foreign PID is not readiness proof.
    vi.mocked(fixtureProcesses).mockReturnValue([
      owner,
      { ...child, parent: 1 },
    ]);
    expect(ready()).toBe(false);
    expect(collectFixtureRegistrations(root, owner.pid, new Map())).toBe(1);
    vi.mocked(fixtureProcesses).mockReturnValue([owner, child]);
    expect(ready()).toBe(true);
    const owned = new Map<number, FixtureProcess>();
    expect(collectFixtureRegistrations(root, owner.pid, owned)).toBe(0);
    expect([...owned.values()]).toEqual([owner, child]);
    expect(retire).toHaveBeenCalledOnce();
  });

  it.each(["ready", "early-exit", "disappeared-at-ready"])(
    "retires PTY readiness/exit observation at %s without registering PID 0 or republishing",
    (ordering) => {
      const events = new EventEmitter();
      const terminal = Object.assign(events, {
        pid: 0,
        onExit(listener: () => void) {
          events.on("exit", listener);
          return {
            dispose: () => {
              events.removeListener("exit", listener);
            },
          };
        },
      });
      vi.mocked(fixtureProcesses).mockReturnValue([owner]);
      const registered = vi.fn();
      const originalSpawn = vi.fn(() => terminal as unknown as IPty);
      expect(
        spawnFixturePty(
          "silent.exe",
          [],
          {},
          { spawn: originalSpawn, registered },
        ),
      ).toBe(terminal);
      expect(collectFixtureRegistrations(root, owner.pid, new Map())).toBe(1);
      expect(events.listenerCount("exit")).toBe(1);
      if (ordering === "early-exit") {
        terminal.pid = child.pid;
        events.emit("exit");
      } else {
        terminal.pid = child.pid;
        vi.mocked(fixtureProcesses).mockReturnValue(
          ordering === "ready" ? [owner, child] : [owner],
        );
        events.emit("ready_datapipe");
        if (ordering === "disappeared-at-ready") {
          expect(collectFixtureRegistrations(root, owner.pid, new Map())).toBe(
            1,
          );
          events.emit("exit");
        }
      }
      expect(collectFixtureRegistrations(root, owner.pid, new Map())).toBe(0);
      expect(events.listenerCount("exit")).toBe(0);
      expect(events.listenerCount("ready_datapipe")).toBe(0);
      expect(registered).toHaveBeenCalledTimes(ordering === "ready" ? 1 : 0);
      const completed = [...files.values()];
      terminal.pid = child.pid;
      events.emit("ready_datapipe");
      events.emit("exit");
      expect([...files.values()]).toEqual(completed);
      expect(completed.some((text) => text.includes('"pid":0'))).toBe(false);
    },
  );

  it("refuses to spawn without a supervised profile", () => {
    vi.stubEnv("OMXTERM_NATIVE_FIXTURE_ROOT", undefined);
    const spawn = vi.fn(() => ({ pid: child.pid }));
    expect(() => spawnFixtureProcess(spawn)).toThrow(
      "ownership root is missing",
    );
    expect(spawn).not.toHaveBeenCalled();
  });

  it("rejects ownership records belonging to another leader or a reused leader PID", () => {
    spawnFixtureProcess(() => ({ pid: child.pid }));
    expect(() =>
      collectFixtureRegistrations(root, unrelated.pid, new Map()),
    ).toThrow("Invalid native fixture ownership");
    expect(() =>
      collectFixtureRegistrations(
        root,
        owner.pid,
        new Map([[owner.pid, { ...owner, identity: "999" }]]),
      ),
    ).toThrow("Invalid native fixture ownership");
  });

  it("does not adopt an unrelated process that reused a registered PID", () => {
    spawnFixtureProcess(() => ({ pid: child.pid }));
    vi.mocked(fixtureProcesses).mockReturnValue([
      { ...child, parent: 1, identity: "999" },
    ]);
    const owned = new Map<number, FixtureProcess>();
    expect(collectFixtureRegistrations(root, owner.pid, owned)).toBe(0);
    expect(owned.has(child.pid)).toBe(false);
  });

  it("keeps the live registered incarnation regardless of historical record order", () => {
    spawnFixtureProcess(() => ({ pid: child.pid }));
    vi.mocked(fixtureProcesses).mockReturnValue([
      owner,
      { ...child, identity: "999" },
    ]);
    spawnFixtureProcess(() => ({ pid: child.pid }));
    for (const records of [
      [...files.entries()],
      [...files.entries()].reverse(),
    ]) {
      files.clear();
      for (const [name, text] of records) files.set(name, text);
      const owned = new Map([[child.pid, child]]);
      expect(collectFixtureRegistrations(root, owner.pid, owned)).toBe(0);
      expect(owned.get(child.pid)?.identity).toBe("999");
    }
  });

  it("rejects malformed and unrelated process records instead of declaring cleanup safe", () => {
    spawnFixtureProcess(() => ({ pid: child.pid }));
    const name = [...files.keys()][0]!;
    for (const processes of [[owner, unrelated], [{ pid: -1 }], "invalid"]) {
      files.set(name, JSON.stringify({ owner, processes }));
      expect(() =>
        collectFixtureRegistrations(root, owner.pid, new Map()),
      ).toThrow();
    }
    files.set(name, "{");
    expect(() =>
      collectFixtureRegistrations(root, owner.pid, new Map()),
    ).toThrow();
  });
});
