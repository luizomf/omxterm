import { writeSync } from "node:fs";
import path from "node:path";
import type { FixtureProcess } from "../fixtures/native-fixture-processes";
import {
  createLocalTerminalSession,
  LocalTerminalSessionStartError,
  type SpawnPty,
} from "../../src/main/local-terminal-session";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  collectFixtureRegistrations,
  spawnFixtureProcess,
} from "../fixtures/native-fixture-ownership";

const io = vi.hoisted(() => ({
  files: new Map<string, string>(),
  fault: "" as
    | ""
    | "pending-write"
    | "pending-replacement"
    | "completed-write"
    | "completed-replacement",
  error: undefined as unknown,
  rows: [] as { pid: number; parent: number; identity: string }[],
}));
vi.mock("node:child_process", () => ({
  execFileSync: () => JSON.stringify(io.rows),
}));
vi.mock("node:fs", () => ({
  writeSync: vi.fn(),
  writeFileSync: (name: string, text: string, options: { flag: string }) => {
    if (options.flag !== "wx") throw new Error("Exclusive write required");
    if (io.files.has(name))
      throw Object.assign(new Error("exists"), { code: "EEXIST" });
    io.files.set(name, text);
    // Model writeFileSync throwing on its internal close after all bytes.
    const phase = (JSON.parse(text) as { processes?: unknown }).processes
      ? "completed-write"
      : "pending-write";
    if (io.fault === phase) throw io.error;
  },
  renameSync: (from: string, to: string) => {
    const phase = (JSON.parse(io.files.get(from)!) as { processes?: unknown })
      .processes
      ? "completed-replacement"
      : "pending-replacement";
    if (io.fault === phase) throw io.error;
    io.files.set(to, io.files.get(from)!);
    io.files.delete(from);
  },
  readFileSync: (name: string) => io.files.get(name)!,
  readdirSync: () => [...io.files.keys()].map((name) => path.basename(name)),
}));
const root = path.resolve("synthetic-profile");
const owner = { pid: process.pid, parent: 1, identity: "100" };
const children = [1, 2, 3, 4].map((offset) => ({
  pid: owner.pid + offset,
  parent: owner.pid,
  identity: String(100 + offset),
}));
const prefix = "__OMXTERM_FIXTURE_REGISTRATION_FAILURE__";
let output: string[];
beforeEach(() => {
  vi.stubEnv("OMXTERM_NATIVE_FIXTURE_ROOT", root);
  vi.spyOn(process, "platform", "get").mockReturnValue("win32");
  io.files.clear();
  io.fault = "";
  io.rows = [owner, ...children];
  io.error = Object.assign(new Error("private path/argv must not be logged"), {
    code: "EIO",
    errno: -5,
    syscall: "close",
    path: "private-path",
  });
  output = [];
  vi.mocked(writeSync)
    .mockReset()
    .mockImplementation((fd, text) => {
      expect(fd).toBe(2);
      output.push(String(text));
      return Buffer.byteLength(String(text));
    });
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it.each([
  ["normal", "completed-write", "close"],
  ["normal", "completed-replacement", "rename"],
  ["early-exit", "completed-write", "close"],
  ["early-exit", "completed-replacement", "rename"],
] as const)(
  "distinguishes %s %s with pending records, throwing synchronously but recording observer failures",
  async (branch, phase, syscall) => {
    io.fault = phase;
    io.error = Object.assign(new Error("private path/argv"), {
      code: "EIO",
      errno: -5,
      syscall,
    });
    let received: unknown;
    let completed!: () => void;
    try {
      spawnFixtureProcess(
        () => ({
          pid: branch === "normal" ? children[0]!.pid : owner.pid + 100,
        }),
        (_child, callback) => {
          completed = callback;
        },
      );
      if (branch === "early-exit") await Promise.resolve().then(completed);
    } catch (error) {
      received = error;
    }
    expect(received).toBe(branch === "normal" ? io.error : undefined);
    expect(collectFixtureRegistrations(root, owner.pid, new Map())).toBe(1);
    const entries = [...io.files.entries()];
    expect(entries).toHaveLength(2);
    expect(
      JSON.parse(entries.find(([name]) => name.endsWith(".json"))![1]),
    ).toEqual({ owner });
    expect(
      JSON.parse(entries.find(([name]) => name.endsWith(".tmp"))![1]),
    ).toEqual({ owner, processes: [owner, ...children] });
    expect(output).toHaveLength(branch === "normal" ? 1 : 2);
    expect(JSON.parse(output[0]!.slice(prefix.length))).toEqual({
      version: 1,
      branch,
      phase,
      code: "EIO",
      errno: -5,
      syscall,
    });
    if (branch === "early-exit")
      expect(JSON.parse(output[1]!.slice(prefix.length))).toEqual({
        version: 1,
        branch,
        phase: "exit-observation",
        code: "EIO",
        errno: -5,
        syscall,
      });
    expect(output.join("")).not.toContain("private");
  },
);

it.each(["pending-write", "pending-replacement"] as const)(
  "reports %s without invoking native spawn or completing ownership",
  (phase) => {
    io.fault = phase;
    const spawn = vi.fn(() => ({ pid: children[0]!.pid }));
    let received: unknown;
    try {
      spawnFixtureProcess(spawn);
    } catch (error) {
      received = error;
    }
    expect(received).toBe(io.error);
    expect(spawn).not.toHaveBeenCalled();
    expect([...io.files.keys()].every((name) => name.endsWith(".tmp"))).toBe(
      true,
    );
    expect(
      [...io.files.values()].map((text) => JSON.parse(text) as unknown),
    ).toEqual([{ owner }]);
    expect(output).toHaveLength(1);
    expect(JSON.parse(output[0]!.slice(prefix.length))).toEqual({
      version: 1,
      branch: "normal",
      phase,
      code: "EIO",
      errno: -5,
      syscall: "close",
    });
  },
);

it.each(["normal", "early-exit"] as const)(
  "preserves successful %s publication without diagnostics or additional registry files",
  async (branch) => {
    let completed!: () => void;
    const child = {
      pid: branch === "normal" ? children[0]!.pid : owner.pid + 100,
    };
    expect(
      spawnFixtureProcess(
        () => child,
        (_child, callback) => {
          completed = callback;
        },
      ),
    ).toBe(child);
    if (branch === "early-exit") {
      expect(collectFixtureRegistrations(root, owner.pid, new Map())).toBe(1);
      await Promise.resolve().then(completed);
    }
    const owned = new Map<number, FixtureProcess>();
    expect(collectFixtureRegistrations(root, owner.pid, owned)).toBe(0);
    expect([...owned.values()]).toEqual([owner, ...children]);
    expect(io.files.size).toBe(1);
    expect([...io.files.keys()][0]).toMatch(/\.json$/u);
    expect(output).toEqual([]);
  },
);

it("never replaces the original exception when the diagnostic sink throws", () => {
  io.fault = "completed-replacement";
  vi.mocked(writeSync).mockImplementation(() => {
    throw new Error("sink failure");
  });
  let received: unknown;
  try {
    spawnFixtureProcess(() => ({ pid: children[0]!.pid }));
  } catch (error) {
    received = error;
  }
  expect(received).toBe(io.error);
  expect(output).toEqual([]);
  expect(io.files.size).toBe(2);
  expect(collectFixtureRegistrations(root, owner.pid, new Map())).toBe(1);
});

it("does not retry a short diagnostic write or replace the publication exception", () => {
  io.fault = "completed-write";
  vi.mocked(writeSync).mockImplementation(() => 0);
  let received: unknown;
  try {
    spawnFixtureProcess(() => ({ pid: children[0]!.pid }));
  } catch (error) {
    received = error;
  }
  expect(received).toBe(io.error);
  expect(writeSync).toHaveBeenCalledOnce();
  expect(output).toEqual([]);
  expect(io.files.size).toBe(2);
  expect(collectFixtureRegistrations(root, owner.pid, new Map())).toBe(1);
});

it("does not retry, overwrite or delete a competing exclusive temporary entry", () => {
  const spawn = () => {
    const record = [...io.files.keys()][0]!;
    io.files.set(`${record}.tmp`, "untouched competing temporary entry");
    return { pid: children[0]!.pid };
  };
  expect(() => spawnFixtureProcess(spawn)).toThrow("exists");
  expect([...io.files.values()]).toContain(
    "untouched competing temporary entry",
  );
  expect(collectFixtureRegistrations(root, owner.pid, new Map())).toBe(1);
  expect(output).toHaveLength(1);
  expect(JSON.parse(output[0]!.slice(prefix.length))).toEqual({
    version: 1,
    branch: "normal",
    phase: "completed-write",
    code: "EEXIST",
  });
});

it("captures publication metadata before explicit-command normalization without widening the safe production error", () => {
  io.fault = "completed-replacement";
  const nativeSpawn = vi.fn(() => ({ pid: children[0]!.pid }));
  let received: unknown;
  try {
    createLocalTerminalSession(
      (() => spawnFixtureProcess(nativeSpawn)) as unknown as SpawnPty,
      {
        shell: "private-shell",
        launchRequest: {
          kind: "explicit-command",
          executable: "private-program",
          arguments: ["private-argv"],
        },
        platform: "win32",
        homeDirectory: "private-home",
        environment: { PRIVATE: "private-env" },
        applicationVersionProvider: { getVersion: () => "test" },
        onOutput: () => {},
        onExit: () => {},
      },
    );
  } catch (error) {
    received = error;
  }
  expect(nativeSpawn).toHaveBeenCalledOnce();
  expect(received).toBeInstanceOf(LocalTerminalSessionStartError);
  expect(received).toMatchObject({
    message: "Failed to start the requested command",
    launchKind: "explicit-command",
  });
  expect((received as Error).cause).toBeUndefined();
  expect(output).toHaveLength(1);
  expect(output[0]).toContain('"phase":"completed-replacement"');
  expect(output[0]).not.toContain("private");
});

it.each(["inherited", "own-getters"])(
  "never reads unexpected fields, %s properties or error serialization hooks",
  (mode) => {
    io.fault = "completed-write";
    const getter = vi.fn(() => {
      throw new Error("private getter");
    });
    io.error = Object.create({ code: "EACCES", syscall: "rename" }) as object;
    Object.defineProperties(io.error, {
      ...(mode === "own-getters"
        ? { code: { get: getter }, syscall: { get: getter } }
        : {}),
      errno: { get: getter },
      message: { get: getter },
      stack: { get: getter },
      path: { get: getter },
      argv: { get: getter },
      env: { get: getter },
      toJSON: { get: getter },
    });
    let received: unknown;
    try {
      spawnFixtureProcess(() => ({ pid: children[0]!.pid }));
    } catch (error) {
      received = error;
    }
    expect(received).toBe(io.error);
    expect(getter).not.toHaveBeenCalled();
    expect(JSON.parse(output[0]!.slice(prefix.length))).toEqual({
      version: 1,
      branch: "normal",
      phase: "completed-write",
    });
  },
);

it("retains the primary exception when an error descriptor trap throws", () => {
  io.fault = "completed-write";
  io.error = new Proxy(
    {},
    {
      getOwnPropertyDescriptor() {
        throw new Error("private trap");
      },
    },
  );
  let received: unknown;
  try {
    spawnFixtureProcess(() => ({ pid: children[0]!.pid }));
  } catch (error) {
    received = error;
  }
  expect(received).toBe(io.error);
  expect(JSON.parse(output[0]!.slice(prefix.length))).toEqual({
    version: 1,
    branch: "normal",
    phase: "completed-write",
  });
});

it.each([
  { code: "private".repeat(10000), syscall: "private-path", errno: 2147483648 },
  { code: {}, syscall: {}, errno: -2147483649 },
  { code: "toString", syscall: "constructor", errno: NaN },
  { code: "__proto__", syscall: "writeFileSync", errno: Infinity },
  { code: ["EIO"], syscall: ["close"], errno: "-5" },
  { code: "EIO\nprivate", syscall: "rename\nprivate", errno: 1.5 },
  "private raw error",
  null,
  undefined,
])("omits non-allowlisted or invalid error metadata (%#)", (error) => {
  io.fault = "completed-write";
  io.error = error;
  let received: unknown;
  try {
    spawnFixtureProcess(() => ({ pid: children[0]!.pid }));
  } catch (failure) {
    received = failure;
  }
  expect(received).toBe(error);
  expect(JSON.parse(output[0]!.slice(prefix.length))).toEqual({
    version: 1,
    branch: "normal",
    phase: "completed-write",
  });
  expect(Buffer.byteLength(output[0]!)).toBeLessThan(256);
});

it.each([-2147483648, 2147483647])(
  "retains bounded numeric errno %s and fixed maximal fields",
  (errno) => {
    io.fault = "completed-replacement";
    io.error = {
      code: "ENAMETOOLONG",
      errno,
      syscall: "rename",
      path: "private",
    };
    expect(() =>
      spawnFixtureProcess(() => ({ pid: children[0]!.pid })),
    ).toThrow();
    expect(JSON.parse(output[0]!.slice(prefix.length))).toEqual({
      version: 1,
      branch: "normal",
      phase: "completed-replacement",
      code: "ENAMETOOLONG",
      errno,
      syscall: "rename",
    });
    expect(Buffer.byteLength(output[0]!)).toBeLessThan(256);
  },
);
