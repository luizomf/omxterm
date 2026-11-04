import { build } from "esbuild";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import * as fs from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { runInNewContext } from "node:vm";
import { beforeAll, describe, expect, it, vi } from "vitest";
import {
  isNativeFixtureResult,
  MAX_CLEANUP_COMMAND_ELAPSED_MS,
  readOutcome,
  type NativeFixtureCleanupFailure,
} from "../fixtures/native-fixture-outcome";
import type * as Processes from "../fixtures/native-fixture-processes";

const require = createRequire(import.meta.url);
const callsites = [
  "final-sample",
  "registration-before-kill",
  "termination",
  "registration-after-kill",
  "survival",
] as const;
let processProgram: string, supervisorProgram: string;
beforeAll(async () => {
  [processProgram, supervisorProgram] = (await Promise.all(
    ["native-fixture-processes", "native-fixture-supervisor"].map(
      async (name) => {
        const compiled = await build({
          entryPoints: [`test/fixtures/${name}.ts`],
          bundle: true,
          platform: "node",
          format: "cjs",
          write: false,
        });
        return compiled.outputFiles[0]!.text;
      },
    ),
  )) as [string, string];
});

const inventoryArgs = [
  "-NoProfile",
  "-NonInteractive",
  "-Command",
  "@(Get-CimInstance Win32_Process | Where-Object { $_.CreationDate } | ForEach-Object { @{ pid = [int]$_.ProcessId; parent = [int]$_.ParentProcessId; identity = $_.CreationDate.ToUniversalTime().Ticks.ToString() } }) | ConvertTo-Json -Compress",
];
const parent = { pid: 9990, parent: 1, identity: "50" };
const owner = { pid: 10000, parent: parent.pid, identity: "100" };
const cleanupFailure: NativeFixtureCleanupFailure = {
  callsite: "termination",
  elapsedMs: 123,
  category: "timeout",
};
const legacy = {
  exitCode: 7,
  signal: null,
  reason: "caller-cancelled",
  stdout: "",
  stderr: "",
  cleanupErrors: ["Error: original failure"],
};

describe("optional native cleanup failure schema", () => {
  it("accepts unchanged legacy and successful receipts", () => {
    expect(isNativeFixtureResult(legacy)).toBe(true);
    expect(isNativeFixtureResult({ ...legacy, cleanupErrors: [] })).toBe(true);
    expect(isNativeFixtureResult({ ...legacy, cleanupFailure })).toBe(true);
  });

  it.each([
    undefined,
    null,
    [],
    {},
    { ...cleanupFailure, callsite: "monitor" },
    { ...cleanupFailure, category: "ETIMEDOUT" },
    { ...cleanupFailure, elapsedMs: -1 },
    { ...cleanupFailure, elapsedMs: 0.5 },
    { ...cleanupFailure, elapsedMs: NaN },
    { ...cleanupFailure, elapsedMs: Infinity },
    { ...cleanupFailure, elapsedMs: MAX_CLEANUP_COMMAND_ELAPSED_MS + 1 },
    { ...cleanupFailure, elapsedMs: "123" },
    { ...cleanupFailure, code: "private-data" },
    Object.assign(Object.create(cleanupFailure) as object, {
      code: "private-data",
      argv: "private-data",
      output: "private-data",
    }),
    Object.assign([], cleanupFailure),
  ])("rejects malformed optional metadata (%j)", (value) => {
    expect(isNativeFixtureResult({ ...legacy, cleanupFailure: value })).toBe(
      false,
    );
  });

  it("does not accept failure metadata on a cleanup success", () => {
    expect(
      isNativeFixtureResult({ ...legacy, cleanupErrors: [], cleanupFailure }),
    ).toBe(false);
  });
});

function loadProcesses(execFileSync: unknown, now: () => number) {
  const module = { exports: {} };
  runInNewContext(processProgram, {
    module,
    exports: module.exports,
    Buffer,
    process: { platform: "win32" },
    require: (name: string) => {
      if (name === "node:child_process") return { execFileSync };
      if (name === "node:perf_hooks") return { performance: { now } };
      return require(name) as unknown;
    },
  });
  return module.exports as typeof Processes;
}

describe("actual emitted Windows command failure boundary", () => {
  it.each([
    [
      Object.freeze(
        Object.assign(new Error("private argv/output/path"), {
          code: "ETIMEDOUT",
          status: null,
        }),
      ),
      "timeout",
    ],
    [
      Object.freeze(
        Object.assign(new Error("private command failure"), {
          status: 3,
          code: "private-code",
        }),
      ),
      "command-failed",
    ],
    [
      Object.freeze(
        Object.assign(new Error("private unknown"), { code: "private-code" }),
      ),
      "unknown",
    ],
    ["private thrown string", "unknown"],
    [null, "unknown"],
    [
      {
        get code() {
          throw new Error("private getter");
        },
      },
      "unknown",
    ],
  ] as const)(
    "rethrows the original exception and emits only a bounded category (case %#)",
    (original, category) => {
      let clock = 100;
      const command = vi.fn(() => {
        clock += 17.875;
        throw original;
      });
      const processes = loadProcesses(command, () => clock);
      const failures: NativeFixtureCleanupFailure[] = [];
      let caught: unknown = Symbol("not thrown");
      try {
        processes.fixtureProcesses({
          callsite: "final-sample",
          onFailure: (failure) => failures.push(failure),
        });
      } catch (error) {
        caught = error;
      }
      expect(caught).toBe(original);
      expect(failures).toEqual([
        { callsite: "final-sample", elapsedMs: 17, category },
      ]);
      expect(JSON.stringify(failures)).not.toContain("private");
      expect(command).toHaveBeenCalledExactlyOnceWith(
        "powershell.exe",
        inventoryArgs,
        { encoding: "utf8", timeout: 5_000, windowsHide: true },
      );
    },
  );

  it.each([0, MAX_CLEANUP_COMMAND_ELAPSED_MS + 100])(
    "bounds elapsed milliseconds (%s)",
    (elapsed) => {
      let clock = 100;
      const original = new Error("original");
      const processes = loadProcesses(
        () => {
          clock += elapsed;
          throw original;
        },
        () => clock,
      );
      const onFailure = vi.fn();
      expect(() =>
        processes.fixtureProcesses({ callsite: "final-sample", onFailure }),
      ).toThrow(original);
      expect(onFailure).toHaveBeenCalledWith({
        callsite: "final-sample",
        elapsedMs: Math.min(elapsed, MAX_CLEANUP_COMMAND_ELAPSED_MS),
        category: "unknown",
      });
    },
  );

  it("never invokes arbitrary error getters for classification", () => {
    const getter = vi.fn(() => {
      throw new Error("private getter");
    });
    const original = Object.defineProperties(new Error("original"), {
      code: { get: getter },
      status: { get: getter },
    });
    const processes = loadProcesses(
      () => {
        throw original;
      },
      () => 1,
    );
    const onFailure = vi.fn();
    expect(() =>
      processes.fixtureProcesses({ callsite: "final-sample", onFailure }),
    ).toThrow(original);
    expect(getter).not.toHaveBeenCalled();
    expect(onFailure).toHaveBeenCalledWith({
      callsite: "final-sample",
      elapsedMs: 0,
      category: "unknown",
    });
  });

  it("rethrows the original termination exception without changing its properties", async () => {
    const original = Object.freeze(
      Object.assign(new Error("original"), { status: 3, code: "private" }),
    );
    const processes = loadProcesses(
      () => {
        throw original;
      },
      () => 100,
    );
    const onFailure = vi.fn();
    await expect(
      processes.terminateFixtureProcesses(new Map(), undefined, onFailure),
    ).rejects.toBe(original);
    expect(onFailure).toHaveBeenCalledExactlyOnceWith({
      callsite: "termination",
      elapsedMs: 0,
      category: "command-failed",
    });
    expect(Object.keys(original)).toEqual(["status", "code"]);
  });

  it("does not let a diagnostic sink replace the original exception", () => {
    const original = new Error("original");
    const processes = loadProcesses(
      () => {
        throw original;
      },
      () => 1,
    );
    let caught: unknown;
    try {
      processes.fixtureProcesses({
        callsite: "final-sample",
        onFailure: () => {
          throw new Error("sink failure");
        },
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBe(original);
  });
});

// Execute the real bundled supervisor, ownership collector and process helpers.
// Only OS process/clock seams are modeled; receipt/profile I/O is real and fresh.
async function supervise(
  fault?: number | "invalid-registration" | "invalid-json",
  options: {
    readonly nativeSuccess?: boolean;
    readonly error?: unknown;
    readonly live?: boolean;
    readonly survives?: boolean;
  } = {},
) {
  const base = fs.mkdtempSync(path.join(tmpdir(), "omxterm-cleanup-context-"));
  const root = path.join(base, "profile");
  const registry = path.join(root, "native-process-ownership");
  fs.mkdirSync(registry, { recursive: true });
  fs.writeFileSync(
    path.join(root, "native-process.json"),
    JSON.stringify(owner),
  );
  fs.writeFileSync(
    path.join(root, "native-exit.json"),
    JSON.stringify(
      options.nativeSuccess
        ? { exitCode: 0, signal: null, reason: "exit" }
        : { exitCode: 7, signal: "SIGTERM", reason: "caller-cancelled" },
    ),
  );
  fs.writeFileSync(path.join(root, "native-stdout"), "original stdout");
  fs.writeFileSync(path.join(root, "native-stderr"), "original stderr");
  const evidencePath = path.join(base, "receipt.json");
  const original = Object.freeze(
    Object.assign(new Error("spawnSync powershell.exe ETIMEDOUT"), {
      code: "ETIMEDOUT",
      output: "private output",
      path: "private path",
    }),
  );
  let clock = 100;
  let wallClock = 100_000;
  let live = options.live === true;
  const execFileSync = vi.fn((_file: string, args: string[]) => {
    clock += 12.75;
    if (!options.survives) wallClock -= 10_000;
    const invocation = execFileSync.mock.calls.length;
    if (invocation === fault) throw options.error ?? original;
    if (invocation === 2 && fault === "invalid-registration")
      fs.writeFileSync(path.join(registry, "invalid.json"), "{}");
    if (invocation === 2 && fault === "invalid-json") return "not JSON";
    if (args[3]!.includes("$p.Kill()")) {
      const attempted = live;
      if (!options.survives) live = false;
      return attempted ? "OMXTERM_CLEANUP_ASSISTANCE_ATTEMPTED\n" : "";
    }
    return JSON.stringify(live ? [parent, owner] : [parent]);
  });
  let finish!: () => void;
  const exited = new Promise<void>((resolve) => {
    finish = resolve;
  });
  const supervisor = Object.assign(new EventEmitter(), {
    argv: ["node", "supervisor"],
    platform: "win32",
    connected: false,
    exit: vi.fn(() => finish()),
  });
  const forbiddenSpawn = vi.fn(() => {
    throw new Error("Native spawn forbidden");
  });
  try {
    runInNewContext(supervisorProgram, {
      process: supervisor,
      Buffer,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      Date: {
        now: () => (options.survives ? (wallClock += 10_000) : wallClock),
      },
      require: (name: string) => {
        if (name === "node:child_process")
          return { spawn: forbiddenSpawn, execFileSync };
        if (name === "node:perf_hooks")
          return { performance: { now: () => clock } };
        return require(name) as unknown;
      },
    });
    supervisor.emit("message", {
      executable: "not-executed",
      args: [],
      root,
      timeout: 5000,
      evidencePath,
      parent,
      externalChild: true,
    });
    await exited;
    const result = await readOutcome(evidencePath);
    expect(forbiddenSpawn).not.toHaveBeenCalled();
    return {
      result,
      raw: fs.readFileSync(evidencePath, "utf8"),
      calls: execFileSync.mock.calls as unknown as [string, string[], object][],
      rootRetained: fs.existsSync(root),
      status: supervisor.exit.mock.calls[0],
    };
  } finally {
    fs.rmSync(base, { recursive: true, force: true });
  }
}

describe("actual emitted supervisor cleanup evidence", () => {
  it.each(callsites)(
    "retains %s with monotonic failed-command duration and original mechanical outcome",
    async (callsite) => {
      const failedCall = callsites.indexOf(callsite) + 2;
      const observed = await supervise(failedCall);
      expect(observed.result).toEqual({
        exitCode: 7,
        signal: "SIGTERM",
        reason: "caller-cancelled",
        stdout: "",
        stderr: "",
        cleanupErrors: ["Error: spawnSync powershell.exe ETIMEDOUT"],
        cleanupFailure: { callsite, elapsedMs: 12, category: "timeout" },
        cleanupAssistance: "unknown",
        ownedProcesses: [owner],
      });
      expect(observed.calls).toHaveLength(failedCall);
      expect(observed.rootRetained).toBe(true);
      expect(observed.status).toEqual([1]);
      expect(observed.raw).not.toContain("private");
    },
  );

  it("adds classification without changing command count, bounds or native failure", async () => {
    const observed = await supervise();
    expect(observed.result).toEqual({
      exitCode: 7,
      signal: "SIGTERM",
      reason: "caller-cancelled",
      stdout: "original stdout",
      stderr: "original stderr",
      cleanupErrors: [],
      cleanupAssistance: "none",
      ownedProcesses: [owner],
    });
    expect(observed.rootRetained).toBe(false);
    // Native failure is not converted into a successful supervisor outcome.
    expect(observed.status).toEqual([1]);
    expect(observed.calls).toHaveLength(6);
    for (const index of [0, 1, 2, 4, 5]) {
      expect(observed.calls[index]).toEqual([
        "powershell.exe",
        inventoryArgs,
        { encoding: "utf8", timeout: 5_000, windowsHide: true },
      ]);
    }
    const termination = observed.calls[3]!;
    expect(termination[0]).toBe("powershell.exe");
    expect(termination[1].slice(0, 3)).toEqual([
      "-NoProfile",
      "-NonInteractive",
      "-Command",
    ]);
    expect(termination[1]).toHaveLength(4);
    // Removing only the assistance marker restores the exact fixed-base script.
    const originalScript = termination[1][3]!.replace(
      /\{\n          \[Console\]::Out.WriteLine\('OMXTERM_CLEANUP_ASSISTANCE_ATTEMPTED'\)\n          \[Console\]::Out.Flush\(\)\n          \$p.Kill\(\)\n        \}/u,
      "{ $p.Kill() }",
    );
    expect(createHash("sha256").update(originalScript).digest("hex")).toBe(
      "ddc8384920f01b678f0edaa08b0d2a54772dc102dc1fdddfc23e71d5e5d6b3ab",
    );
    expect(termination[2]).toEqual({ timeout: 5_000, windowsHide: true });
  });

  it("classifies natural native settlement without altering the native outcome", async () => {
    const observed = await supervise(undefined, { nativeSuccess: true });
    expect(observed.result).toEqual({
      exitCode: 0,
      signal: null,
      reason: "exit",
      stdout: "original stdout",
      stderr: "original stderr",
      cleanupErrors: [],
      cleanupAssistance: "none",
      ownedProcesses: [owner],
    });
    expect(observed.calls).toHaveLength(6);
    expect(observed.rootRetained).toBe(false);
    expect(observed.status).toEqual([0]);
  });

  it("records assistance even when exit0 and cleanup success are retained", async () => {
    const observed = await supervise(undefined, {
      nativeSuccess: true,
      live: true,
    });
    expect(observed.result).toMatchObject({
      exitCode: 0,
      signal: null,
      reason: "exit",
      cleanupErrors: [],
      cleanupAssistance: "attempted",
    });
    expect(observed.rootRetained).toBe(false);
    expect(observed.status).toEqual([0]);
  });

  it("retains an attempted but unsuccessful cleanup", async () => {
    const observed = await supervise(undefined, {
      nativeSuccess: true,
      live: true,
      survives: true,
    });
    expect(observed.result).toMatchObject({
      exitCode: 0,
      signal: null,
      reason: "exit",
      cleanupAssistance: "attempted",
      cleanupErrors: ["Error: Fixture processes survived cleanup: 10000"],
    });
    expect(observed.rootRetained).toBe(true);
    expect(observed.status).toEqual([1]);
  });

  it("retains a partial Windows attempt when the command later fails", async () => {
    const error = Object.assign(new Error("partial termination failure"), {
      status: 3,
      stdout: Buffer.from("OMXTERM_CLEANUP_ASSISTANCE_ATTEMPTED\r\n"),
    });
    const observed = await supervise(4, {
      nativeSuccess: true,
      live: true,
      error,
    });
    expect(observed.result).toMatchObject({
      exitCode: 0,
      signal: null,
      reason: "exit",
      cleanupAssistance: "attempted",
      cleanupErrors: [String(error)],
      cleanupFailure: { callsite: "termination", category: "command-failed" },
    });
    expect(observed.rootRetained).toBe(true);
    expect(observed.status).toEqual([1]);
    expect(observed.raw).not.toContain("OMXTERM_CLEANUP_ASSISTANCE_ATTEMPTED");
  });

  it("does not classify an unobserved termination as natural", async () => {
    const observed = await supervise(4, { nativeSuccess: true });
    expect(observed.result).toMatchObject({ cleanupAssistance: "unknown" });
    expect(observed.result!.cleanupErrors).not.toEqual([]);
    expect(observed.rootRetained).toBe(true);
  });

  it.each([
    [
      Object.assign(new Error("original failed command"), {
        status: 3,
        code: "private-code",
      }),
      "command-failed",
    ],
    [
      Object.assign(new Error("original unknown command"), {
        code: "private-code",
        output: "private-output",
      }),
      "unknown",
    ],
  ] as const)(
    "propagates bounded category %s without copying arbitrary error fields",
    async (error, category) => {
      const observed = await supervise(4, { error });
      expect(observed.result!.cleanupErrors).toEqual([String(error)]);
      expect(observed.result!.cleanupFailure).toEqual({
        callsite: "termination",
        elapsedMs: 12,
        category,
      });
      expect(JSON.stringify(observed.result!.cleanupFailure)).not.toContain(
        "private",
      );
      expect(observed.rootRetained).toBe(true);
      expect(observed.status).toEqual([1]);
    },
  );

  it.each([1, "invalid-registration", "invalid-json"] as const)(
    "does not mislabel a failure outside a cleanup command (%s)",
    async (fault) => {
      const observed = await supervise(fault);
      expect(observed.result!.cleanupErrors).not.toEqual([]);
      expect(observed.result).not.toHaveProperty("cleanupFailure");
      expect(observed.rootRetained).toBe(true);
      expect(observed.status).toEqual([1]);
      if (fault === 1) {
        expect(observed.result!.reason).toBe("inspection-error");
        expect(observed.result!.cleanupErrors).toEqual([
          "Error: spawnSync powershell.exe ETIMEDOUT",
        ]);
      }
    },
  );
});
