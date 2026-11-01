import path from "node:path";
import { EventEmitter } from "node:events";
import { writeSync } from "node:fs";
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

// Every PTY call supplies its controlled spawn; no ESM mock of CJS fallback.
const io = vi.hoisted(() => ({
  files: new Map<string, string>(),
  observeWrite: undefined as (() => void) | undefined,
  heldPending: undefined as string | undefined,
  afterList: undefined as (() => void) | undefined,
  omitPendingFromList: false,
  heldCompletionSource: false,
  completionReadError: undefined as string | undefined,
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
  lstatSync: (name: string) => {
    if (!files.has(name))
      throw Object.assign(new Error("missing"), { code: "ENOENT" });
    return {};
  },
  readFileSync: (name: string) => {
    if (name.endsWith(".complete.json") && io.completionReadError)
      throw Object.assign(new Error("unreadable completion"), {
        code: io.completionReadError,
      });
    if (!files.has(name))
      throw Object.assign(new Error("Missing ownership record"), {
        code: "ENOENT",
      });
    return files.get(name)!;
  },
  renameSync: (from: string, to: string) => {
    if (io.heldCompletionSource && from.endsWith(".complete.json.tmp"))
      throw Object.assign(new Error("held completion source"), {
        code: "EBUSY",
        errno: -4082,
        syscall: "rename",
      });
    if (to === io.heldPending)
      throw Object.assign(new Error("held pending record"), {
        code: "EPERM",
        errno: -4048,
        syscall: "rename",
      });
    files.set(to, files.get(from)!);
    files.delete(from);
  },
  readdirSync: () => {
    const names = [...files.keys()]
      .map((name) => path.basename(name))
      .filter(
        (name) => !io.omitPendingFromList || name.endsWith(".complete.json"),
      );
    io.afterList?.();
    return names;
  },
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
  io.heldPending = undefined;
  io.afterList = undefined;
  io.omitPendingFromList = false;
  io.heldCompletionSource = false;
  io.completionReadError = undefined;
  vi.mocked(writeSync).mockClear();
  vi.stubEnv("OMXTERM_NATIVE_FIXTURE_ROOT", root);
  vi.mocked(fixtureProcesses).mockReturnValue([owner, child, unrelated]);
});
afterEach(() => vi.unstubAllEnvs());
const observationRecords = () =>
  vi
    .mocked(writeSync)
    .mock.calls.map(
      ([, text]) =>
        JSON.parse(
          String(text).replace("__OMXTERM_FIXTURE_REGISTRATION_FAILURE__", ""),
        ) as unknown,
    );

// Existing generic registration controls, separated from prepared-runtime
// composition to keep both specifications within the per-file lint bound.
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

  it("acquires readiness while a reader holds the pending record, before notifying the caller", () => {
    const spawned = { pid: 0 };
    let ready!: () => boolean;
    const retire = vi.fn();
    const registered = vi.fn(() => {
      const owned = new Map<number, FixtureProcess>();
      expect(collectFixtureRegistrations(root, owner.pid, owned)).toBe(0);
      expect([...owned.values()]).toEqual([owner, child]);
    });
    spawnFixtureProcess(
      () => spawned,
      (_child, _exited, observeReady) => {
        ready = observeReady;
        return retire;
      },
      registered,
    );
    const [pendingPath, pendingText] = [...files.entries()][0]!;
    io.heldPending = pendingPath;
    expect(collectFixtureRegistrations(root, owner.pid, new Map())).toBe(1);
    spawned.pid = child.pid;
    expect(ready()).toBe(true);
    expect(files.get(pendingPath)).toBe(pendingText);
    expect(registered).toHaveBeenCalledExactlyOnceWith(spawned);
    expect(retire).toHaveBeenCalledOnce();
    expect(observationRecords()).toEqual([]);
  });

  it("acquires a completion published after directory enumeration without adopting a staged snapshot", () => {
    const spawned = { pid: 0 };
    let ready!: () => boolean;
    spawnFixtureProcess(
      () => spawned,
      (_child, _exit, atReady) => {
        ready = atReady;
      },
    );
    spawned.pid = child.pid;
    io.afterList = () => {
      io.afterList = undefined;
      expect(ready()).toBe(true);
    };
    const owned = new Map<number, FixtureProcess>();
    expect(collectFixtureRegistrations(root, owner.pid, owned)).toBe(0);
    expect([...owned.values()]).toEqual([owner, child]);
  });

  it("acquires the matching pending record even when enumeration omitted it", () => {
    spawnFixtureProcess(() => ({ pid: child.pid }));
    io.omitPendingFromList = true;
    const owned = new Map<number, FixtureProcess>();
    expect(collectFixtureRegistrations(root, owner.pid, owned)).toBe(0);
    expect([...owned.values()]).toEqual([owner, child]);
    const unverified = new Map<number, FixtureProcess>();
    expect(collectFixtureRegistrations(root, undefined, unverified)).toBe(1);
    expect(unverified.size).toBe(0);
  });

  it.each(["EACCES", "ENOENT"])(
    "fails safely when a listed completion becomes unreadable (%s)",
    (code) => {
      spawnFixtureProcess(() => ({ pid: child.pid }));
      io.completionReadError = code;
      const owned = new Map<number, FixtureProcess>();
      expect(() =>
        collectFixtureRegistrations(root, owner.pid, owned),
      ).toThrow();
      expect(owned.has(child.pid)).toBe(false);
    },
  );

  it("retains pending ownership and later listeners when the completion source cannot be renamed", () => {
    const events = new EventEmitter();
    const spawned = { pid: 0 };
    const registered = vi.fn();
    spawnFixtureProcess(
      () => spawned,
      (_child, _exit, ready) => {
        events.on("ready", ready);
        return () => events.removeListener("ready", ready);
      },
      registered,
    );
    const laterListener = vi.fn();
    events.on("ready", laterListener);
    spawned.pid = child.pid;
    io.heldCompletionSource = true;
    expect(() => events.emit("ready")).not.toThrow();
    expect(laterListener).toHaveBeenCalledOnce();
    expect(registered).not.toHaveBeenCalled();
    expect(collectFixtureRegistrations(root, owner.pid, new Map())).toBe(1);
    expect(
      [...files.keys()].some((name) => name.endsWith(".complete.json.tmp")),
    ).toBe(true);
    expect(observationRecords()).toEqual([
      {
        version: 1,
        branch: "normal",
        phase: "completed-publication",
        code: "EBUSY",
        errno: -4082,
        syscall: "rename",
      },
      {
        version: 1,
        branch: "normal",
        phase: "ready-observation",
        code: "EBUSY",
        errno: -4082,
        syscall: "rename",
      },
    ]);
    io.heldCompletionSource = false;
    events.emit("ready");
    expect(collectFixtureRegistrations(root, owner.pid, new Map())).toBe(1);
    expect(registered).not.toHaveBeenCalled();
    expect(laterListener).toHaveBeenCalledTimes(2);
  });

  it("does not overwrite a pre-existing contradictory completion", () => {
    const spawned = { pid: 0 };
    let ready!: () => boolean;
    const registered = vi.fn();
    spawnFixtureProcess(
      () => spawned,
      (_child, _exit, atReady) => {
        ready = atReady;
      },
      registered,
    );
    const pending = [...files.keys()][0]!;
    const completion = `${pending.slice(0, -5)}.complete.json`;
    files.set(completion, "contradictory retained evidence");
    spawned.pid = child.pid;
    expect(ready()).toBe(false);
    expect(files.get(completion)).toBe("contradictory retained evidence");
    expect(registered).not.toHaveBeenCalled();
    expect(() =>
      collectFixtureRegistrations(root, owner.pid, new Map()),
    ).toThrow();
  });

  it("does not notify readiness when the acquired process snapshot is malformed", () => {
    const spawned = { pid: 0 };
    let ready!: () => boolean;
    const registered = vi.fn();
    const retire = vi.fn();
    spawnFixtureProcess(
      () => spawned,
      (_child, _exit, atReady) => {
        ready = atReady;
        return retire;
      },
      registered,
    );
    spawned.pid = child.pid;
    vi.mocked(fixtureProcesses).mockReturnValue([
      owner,
      { ...child, identity: "" },
    ]);
    expect(ready()).toBe(false);
    expect(registered).not.toHaveBeenCalled();
    expect(retire).toHaveBeenCalledOnce();
    expect(
      collectFixtureRegistrations(root, owner.pid, new Map(), [owner]),
    ).toBe(1);
    expect(observationRecords()).toEqual([
      { version: 1, branch: "normal", phase: "ready-observation" },
    ]);
  });

  it("does not acquire readiness from an inventory with conflicting owner incarnations", () => {
    const spawned = { pid: 0 };
    let ready!: () => boolean;
    const registered = vi.fn();
    spawnFixtureProcess(
      () => spawned,
      (_child, _exit, atReady) => {
        ready = atReady;
      },
      registered,
    );
    spawned.pid = child.pid;
    vi.mocked(fixtureProcesses).mockReturnValue([
      owner,
      { ...owner, identity: "999" },
      child,
    ]);
    expect(ready()).toBe(false);
    expect(registered).not.toHaveBeenCalled();
    expect(
      collectFixtureRegistrations(root, owner.pid, new Map(), [owner]),
    ).toBe(1);
  });

  it("does not spawn without a valid write-ahead owner identity", () => {
    vi.mocked(fixtureProcesses).mockReturnValue([{ ...owner, identity: "" }]);
    const spawn = vi.fn(() => ({ pid: child.pid }));
    expect(() => spawnFixtureProcess(spawn)).toThrow();
    expect(spawn).not.toHaveBeenCalled();
    expect(files.size).toBe(0);
  });

  it("does not spawn with conflicting write-ahead owner incarnations", () => {
    vi.mocked(fixtureProcesses).mockReturnValue([
      owner,
      { ...owner, identity: "999" },
      child,
    ]);
    const spawn = vi.fn(() => ({ pid: child.pid }));
    expect(() => spawnFixtureProcess(spawn)).toThrow();
    expect(spawn).not.toHaveBeenCalled();
    expect(files.size).toBe(0);
  });

  it("never treats the owner PID as a verified spawned child", () => {
    const spawned = { pid: 0 };
    let ready!: () => boolean;
    const registered = vi.fn();
    spawnFixtureProcess(
      () => spawned,
      (_child, _exit, atReady) => {
        ready = atReady;
      },
      registered,
    );
    spawned.pid = owner.pid;
    expect(ready()).toBe(false);
    expect(registered).not.toHaveBeenCalled();
    expect(collectFixtureRegistrations(root, owner.pid, new Map())).toBe(1);
  });
});

describe("native fixture registration and lifecycle", () => {
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
        events.emit("exit", { exitCode: 1 });
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
          events.emit("exit", { exitCode: 1 });
        }
      }
      expect(collectFixtureRegistrations(root, owner.pid, new Map())).toBe(0);
      expect(events.listenerCount("exit")).toBe(0);
      expect(events.listenerCount("ready_datapipe")).toBe(0);
      expect(registered).toHaveBeenCalledTimes(ordering === "ready" ? 1 : 0);
      const completed = [...files.values()];
      terminal.pid = child.pid;
      events.emit("ready_datapipe");
      events.emit("exit", { exitCode: 1 });
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
    const name = [...files.keys()].find((entry) =>
      entry.endsWith(".complete.json"),
    )!;
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
