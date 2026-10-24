import * as childProcess from "node:child_process";
import * as filesystem from "node:fs/promises";
import { existsSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rename } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "esbuild";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NativeFixtureTestContext } from "../fixtures/run-native-fixture";
import {
  completedFixtureOutcome as completed,
  createNativeFixtureUnitScope,
} from "../fixtures/native-fixture-unit-scope";

vi.mock("node:child_process", { spy: true });
vi.mock("node:fs/promises", { spy: true });
vi.mock("esbuild", { spy: true });

let root: string;
let evidencePath: string;
let preservedRoots: string[];
let scope: ReturnType<typeof createNativeFixtureUnitScope>;
beforeEach(async () => {
  vi.clearAllMocks();
  const actualFilesystem =
    await vi.importActual<typeof filesystem>("node:fs/promises");
  vi.mocked(filesystem.writeFile).mockImplementation(
    actualFilesystem.writeFile,
  );
  vi.mocked(filesystem.lstat).mockImplementation(actualFilesystem.lstat);
  vi.mocked(filesystem.mkdir).mockImplementation(actualFilesystem.mkdir);
  const actualBuilder =
    await vi.importActual<typeof import("esbuild")>("esbuild");
  vi.mocked(build).mockImplementation(actualBuilder.build);
  root = await mkdtemp(path.join(tmpdir(), "omxterm-outcome-"));
  evidencePath = path.join(root, "outcome.json");
  preservedRoots = [];
  scope = createNativeFixtureUnitScope(root, preservedRoots);
  // Start the native build service before selecting the Windows caller path.
  await build({ stdin: { contents: "" }, write: false });
  Object.defineProperty(process, "platform", { value: "win32" });
  vi.spyOn(process, "kill").mockImplementation(() => {
    throw Object.assign(new Error("Supervisor exited"), { code: "ESRCH" });
  });
  // Only WMI creation/inventory and process liveness are simulated. Building,
  // the initial ENOENT, publication and final read use the real filesystem.
  vi.mocked(childProcess.execFileSync).mockImplementation((_file, args) =>
    String(args?.at(-1)).includes("Invoke-CimMethod")
      ? "987654\n"
      : JSON.stringify([{ pid: process.pid, parent: 1, identity: "123" }]),
  );
});
afterEach(() => scope.teardown());

function run(testContext?: NativeFixtureTestContext) {
  return scope.run({
    executable: process.execPath,
    args: [],
    root,
    evidencePath,
    timeout: 1_000,
    ...(testContext ? { testContext } : {}),
  });
}

function disappear(publish?: string) {
  vi.spyOn(process, "kill").mockImplementation(() => {
    if (publish !== undefined) writeFileSync(evidencePath, publish);
    throw Object.assign(new Error("Supervisor exited"), { code: "ESRCH" });
  });
}

describe("Native preparation prerequisite guards", () => {
  it.each(["initial inspection", "identity recheck", "ownership directory"])(
    "does not start a new phase after abort during %s",
    async (phase) => {
      const actual =
        await vi.importActual<typeof filesystem>("node:fs/promises");
      const controller = new AbortController();
      const failure = new Error(`Abort at ${phase}`);
      const prepare = vi.fn(async () => undefined);
      let reads = 0;
      vi.mocked(filesystem.lstat).mockImplementation(async (...args) => {
        const identity = await actual.lstat(...args);
        if (
          args[0] === root &&
          ++reads === (phase === "initial inspection" ? 1 : 2) &&
          phase !== "ownership directory"
        )
          controller.abort(failure);
        return identity;
      });
      vi.mocked(filesystem.mkdir).mockImplementation(async (...args) => {
        const result = await actual.mkdir(...args);
        if (
          phase === "ownership directory" &&
          args[0] === path.join(root, "native-process-ownership")
        )
          controller.abort(failure);
        return result;
      });
      vi.mocked(build).mockClear();
      await expect(
        scope.run({
          executable: process.execPath,
          args: [],
          root,
          evidencePath,
          timeout: 1000,
          prepare,
          testContext: { signal: controller.signal, onTestFinished: vi.fn() },
        }),
      ).rejects.toBe(failure);
      expect(prepare).toHaveBeenCalledTimes(
        phase === "initial inspection" ? 0 : 1,
      );
      expect(build).not.toHaveBeenCalled();
      expect(existsSync(root)).toBe(false);
      expect(childProcess.execFileSync).not.toHaveBeenCalled();
      expect(childProcess.fork).not.toHaveBeenCalled();
    },
  );
});

describe("Native fixture preparation lifetime", () => {
  it.each(["darwin", "win32"])(
    "reclaims preparation aborted between its last guard and %s caller resume",
    async (callerPlatform) => {
      Object.defineProperty(process, "platform", { value: callerPlatform });
      const controller = new AbortController();
      const failure = new Error("abort at preparation return");
      const context: NativeFixtureTestContext = {
        signal: controller.signal,
        onTestFinished: vi.fn<NativeFixtureTestContext["onTestFinished"]>(),
      };
      const actual =
        await vi.importActual<typeof filesystem>("node:fs/promises");
      let finalInspection = false;
      let abortQueued = false;
      vi.mocked(filesystem.lstat).mockImplementation(async (...args) => {
        const identity = await actual.lstat(...args);
        if (
          args[0] === root &&
          existsSync(path.join(root, "native-fixture-supervisor.cjs"))
        )
          finalInspection = true;
        return identity;
      });
      const check = controller.signal.throwIfAborted.bind(controller.signal);
      vi.spyOn(controller.signal, "throwIfAborted").mockImplementation(() => {
        check();
        // Queue after the final inspection's synchronous guard, before the
        // caller resumes. Guard additions do not change this interleaving.
        if (finalInspection && !abortQueued) {
          abortQueued = true;
          queueMicrotask(() => controller.abort(failure));
        }
      });
      await expect(run(context)).rejects.toBe(failure);
      expect(abortQueued).toBe(true);
      expect(existsSync(root)).toBe(false);
      expect(vi.mocked(childProcess.execFileSync)).not.toHaveBeenCalled();
      expect(vi.mocked(childProcess.fork)).not.toHaveBeenCalled();
    },
  );

  it("joins an already started supervisor build after context closure", async () => {
    const controller = new AbortController();
    const failure = new Error("Abort during supervisor build");
    let release!: () => void;
    let start!: () => void;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const started = new Promise<void>((resolve) => {
      start = resolve;
    });
    vi.mocked(build).mockImplementation(async (options) => {
      start();
      await blocked;
      writeFileSync(options.outfile!, "settled supervisor writer");
      return {} as Awaited<ReturnType<typeof build>>;
    });
    const operation = run({
      signal: controller.signal,
      onTestFinished: vi.fn(),
    });
    let settled = false;
    void operation.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    try {
      await started;
      controller.abort(failure);
      expect(settled).toBe(false);
      expect(existsSync(root)).toBe(true);
      expect(childProcess.execFileSync).not.toHaveBeenCalled();
    } finally {
      release();
      await operation.catch(() => undefined);
    }
    await expect(operation).rejects.toBe(failure);
    expect(existsSync(root)).toBe(false);
    expect(childProcess.fork).not.toHaveBeenCalled();
    expect(childProcess.execFileSync).not.toHaveBeenCalled();
  });

  it("reclaims a settled Windows request writer aborted before WMI handoff", async () => {
    const controller = new AbortController();
    const failure = new Error("abort at request publication");
    const context: NativeFixtureTestContext = {
      signal: controller.signal,
      onTestFinished: vi.fn<NativeFixtureTestContext["onTestFinished"]>(),
    };
    const { writeFile: write } =
      await vi.importActual<typeof filesystem>("node:fs/promises");
    let writerSettled = false;
    vi.spyOn(filesystem, "writeFile").mockImplementation(async (...args) => {
      await write(...args);
      if (args[0] === path.join(root, "supervisor-request.json")) {
        writerSettled = true;
        controller.abort(failure);
      }
    });
    await expect(run(context)).rejects.toBe(failure);
    expect(writerSettled).toBe(true);
    expect(existsSync(root)).toBe(false);
    expect(
      vi
        .mocked(childProcess.execFileSync)
        .mock.calls.some(([, args]) =>
          String(args?.at(-1)).includes("Invoke-CimMethod"),
        ),
    ).toBe(false);
    expect(vi.mocked(childProcess.spawn)).not.toHaveBeenCalled();
  });

  it("preserves a replaced profile on abort after Windows request publication", async () => {
    const controller = new AbortController();
    const failure = new Error("abort after profile replacement");
    const original = root + "-original";
    preservedRoots.push(original);
    const context: NativeFixtureTestContext = {
      signal: controller.signal,
      onTestFinished: vi.fn<NativeFixtureTestContext["onTestFinished"]>(),
    };
    const { writeFile: write } =
      await vi.importActual<typeof filesystem>("node:fs/promises");
    vi.spyOn(filesystem, "writeFile").mockImplementation(async (...args) => {
      await write(...args);
      if (args[0] === path.join(root, "supervisor-request.json")) {
        await rename(root, original);
        await mkdir(root);
        writeFileSync(path.join(root, "foreign-owned"), "preserve");
        controller.abort(failure);
      }
    });
    await expect(run(context)).rejects.toMatchObject({
      cause: failure,
      errors: [failure, expect.any(Error)],
    });
    expect(existsSync(path.join(root, "foreign-owned"))).toBe(true);
    expect(existsSync(original)).toBe(true);
    expect(vi.mocked(childProcess.spawn)).not.toHaveBeenCalled();
    expect(vi.mocked(childProcess.execFileSync)).toHaveBeenCalledTimes(1);
  });

  it("retains an entry-already-aborted unprepared profile", async () => {
    const controller = new AbortController();
    const failure = new Error("already ended");
    controller.abort(failure);
    const prepare = vi.fn<() => Promise<void>>();
    const onTestFinished = vi.fn<NativeFixtureTestContext["onTestFinished"]>();
    await expect(
      scope.run({
        executable: process.execPath,
        args: [],
        root,
        evidencePath,
        timeout: 1_000,
        testContext: { signal: controller.signal, onTestFinished },
        prepare,
      }),
    ).rejects.toBe(failure);
    expect(existsSync(root)).toBe(true);
    expect(prepare).not.toHaveBeenCalled();
    expect(onTestFinished).not.toHaveBeenCalled();
    expect(vi.mocked(childProcess.execFileSync)).not.toHaveBeenCalled();
  });

  it("reclaims known unhanded preparation when Windows parent identity is absent", async () => {
    vi.mocked(childProcess.execFileSync).mockReturnValue("[]");
    await expect(run()).rejects.toThrow(
      "Cannot establish native fixture parent identity",
    );
    expect(existsSync(root)).toBe(false);
    expect(vi.mocked(childProcess.execFileSync)).toHaveBeenCalledTimes(1);
    expect(vi.mocked(childProcess.spawn)).not.toHaveBeenCalled();
  });
  it("joins started preparation after context abort and never performs WMI/native launch", async (actualContext) => {
    const controller = new AbortController();
    const context: NativeFixtureTestContext = {
      signal: controller.signal,
      onTestFinished: vi.fn<NativeFixtureTestContext["onTestFinished"]>(),
    };
    let release!: () => void;
    const pendingWrite = new Promise<void>((resolve) => {
      release = resolve;
    });
    let started!: () => void;
    const preparing = new Promise<void>((resolve) => {
      started = resolve;
    });
    let settled = false;
    const operation = scope.run({
      executable: process.execPath,
      args: [],
      root,
      evidencePath,
      timeout: 1_000,
      testContext: context,
      prepare: async () => {
        started();
        await pendingWrite;
        writeFileSync(path.join(root, "last-writer"), "settled");
      },
    });
    void operation.then(
      () => {
        settled = true;
      },
      () => {
        settled = true;
      },
    );
    let finishing: Promise<void> | undefined;
    try {
      finishing = Promise.resolve(
        vi.mocked(context.onTestFinished).mock.calls[0]![0](actualContext),
      );
      await preparing;
      controller.abort();
      expect(settled).toBe(false);
      expect(vi.mocked(childProcess.execFileSync)).not.toHaveBeenCalled();
    } finally {
      controller.abort();
      release();
      await operation.catch(() => undefined);
    }
    await expect(operation).rejects.toThrow();
    await finishing;
    expect(existsSync(root)).toBe(false);
    expect(vi.mocked(childProcess.execFileSync)).not.toHaveBeenCalled();
  });

  it("preserves preparation failure and reclaims only its unchanged unhanded profile", async () => {
    const failure = new Error("settled builder failure");
    await expect(
      scope.run({
        executable: process.execPath,
        args: [],
        root,
        evidencePath,
        timeout: 1_000,
        prepare: async () => {
          writeFileSync(path.join(root, "partial-build"), "owned");
          throw failure;
        },
      }),
    ).rejects.toBe(failure);
    expect(existsSync(root)).toBe(false);
    expect(vi.mocked(childProcess.execFileSync)).not.toHaveBeenCalled();
  });

  it("retains a replaced profile and the original preparation error without launching", async () => {
    const failure = new Error("settled builder failure");
    const original = root + "-original";
    preservedRoots.push(original);
    const operation = scope.run({
      executable: process.execPath,
      args: [],
      root,
      evidencePath,
      timeout: 1_000,
      prepare: async () => {
        await rename(root, original);
        await mkdir(root);
        writeFileSync(path.join(root, "foreign-owned"), "preserve");
        throw failure;
      },
    });
    await expect(operation).rejects.toMatchObject({
      cause: failure,
      errors: [failure, expect.any(Error)],
    });
    expect(existsSync(path.join(root, "foreign-owned"))).toBe(true);
    expect(existsSync(original)).toBe(true);
    expect(vi.mocked(childProcess.execFileSync)).not.toHaveBeenCalled();
  });
});

describe("Windows fixture bootstrap ownership", () => {
  it("hides the WMI cleanup supervisor while retaining Job breakaway", async () => {
    disappear(JSON.stringify(completed));
    await expect(run()).resolves.toEqual(completed);
    const launch = vi
      .mocked(childProcess.execFileSync)
      .mock.calls.find(([, args]) =>
        String(args?.at(-1)).includes("Invoke-CimMethod"),
      );
    expect(launch).toBeDefined();
    const script = String(launch![1]!.at(-1));
    expect(script).toMatch(/CreateFlags\s*=\s*\[uint32\]16777216/);
    expect(script).toMatch(/ShowWindow\s*=\s*\[uint16\]0/);
    expect(script).toContain("ProcessStartupInformation = $startup");
  });

  it("publishes pending ownership before an interruptible spawn, retaining an unproven synchronous failure", async () => {
    writeFileSync(path.join(root, "supervisor-ready"), "ready\n");
    vi.spyOn(process, "kill").mockImplementation(() => {
      if (existsSync(path.join(root, "native-cancel.json")))
        throw Object.assign(new Error("Supervisor settled"), { code: "ESRCH" });
      return true;
    });
    vi.mocked(childProcess.spawn).mockImplementation(() => {
      expect(existsSync(path.join(root, "native-bootstrap-pending"))).toBe(
        true,
      );
      throw new Error("interrupted native spawn");
    });
    await expect(run()).rejects.toThrow("interrupted native spawn");
    expect(existsSync(path.join(root, "native-bootstrap-pending"))).toBe(true);
    expect(existsSync(path.join(root, "native-process.json"))).toBe(false);
    expect(existsSync(path.join(root, "native-exit.json"))).toBe(false);
  });
});

describe("Windows fixture outcome observation", () => {
  it("returns completed failure and cleanup metadata published after the initial missing read", async () => {
    disappear(JSON.stringify(completed));
    await expect(run()).resolves.toEqual(completed);
  });

  it("preserves timeout and signal failure even when cleanup succeeded", async () => {
    const outcome = {
      ...completed,
      exitCode: null,
      signal: "SIGTERM",
      reason: "timeout",
      cleanupErrors: [],
    };
    disappear(JSON.stringify(outcome));
    await expect(run()).resolves.toEqual(outcome);
  });

  it.each(["initial", "final"])(
    "rejects incomplete evidence on the %s read, not inferring success from file presence",
    async (stage) => {
      const invalid = JSON.stringify({ reason: "exit", exitCode: 0 });
      if (stage === "initial") writeFileSync(evidencePath, invalid);
      else disappear(invalid);
      await expect(run()).rejects.toThrow(
        "Invalid native fixture supervisor outcome",
      );
    },
  );

  it.each([
    null,
    { ...completed, exitCode: "0" },
    { ...completed, signal: "not-a-signal" },
    { ...completed, cleanupErrors: [0] },
    { ...completed, stdout: null },
  ])("rejects invalid final outcome %j", async (invalid) => {
    disappear(JSON.stringify(invalid));
    await expect(run()).rejects.toThrow(
      "Invalid native fixture supervisor outcome",
    );
  });

  it("preserves a final supervisor error instead of reporting missing evidence", async () => {
    disappear(
      JSON.stringify({
        reason: "supervisor-error",
        error: "synthetic failure",
      }),
    );
    await expect(run()).rejects.toThrow(
      'Native fixture supervisor failed: {"reason":"supervisor-error","error":"synthetic failure"}',
    );
  });

  it.each([undefined, "{"])(
    "fails when final evidence is missing or partial (%s)",
    async (text) => {
      disappear(text);
      await expect(run()).rejects.toThrow(
        "Native fixture supervisor disappeared without an outcome",
      );
    },
  );

  it("joins 28 seconds of owner cleanup instead of rejecting at timeout + 15 seconds", async () => {
    // Virtualize polling, not the real filesystem or supervisor preparation.
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
    let now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const outcome = { ...completed, cleanupErrors: [] };
    const inventory = vi.spyOn(process, "kill").mockImplementation(() => {
      now += 1_000;
      if (now > 28_000) {
        writeFileSync(evidencePath, JSON.stringify(outcome));
        throw Object.assign(new Error("Supervisor settled"), { code: "ESRCH" });
      }
      // Drive the poll scheduled synchronously after this observation.
      queueMicrotask(() => vi.advanceTimersByTime(100));
      return true;
    });
    await expect(run()).resolves.toEqual(outcome);
    expect(inventory).toHaveBeenCalledTimes(29);
    expect(now).toBe(29_000);
    expect(vi.getTimerCount()).toBe(0);
    expect(existsSync(path.join(root, "ownership-blocked.json"))).toBe(false);
  });

  it("does not release an already published outcome until the supervisor exits", async () => {
    const outcome = { ...completed, cleanupErrors: [] };
    writeFileSync(evidencePath, JSON.stringify(outcome));
    let observedAlive!: () => void;
    const alive = new Promise<void>((resolve) => {
      observedAlive = resolve;
    });
    let allowExit = false;
    vi.spyOn(process, "kill").mockImplementation(() => {
      observedAlive();
      if (allowExit)
        throw Object.assign(new Error("Supervisor settled"), { code: "ESRCH" });
      return true;
    });
    let settled = false;
    const operation = run().then((result) => {
      settled = true;
      return result;
    });
    try {
      await alive;
      expect(settled).toBe(false);
    } finally {
      allowExit = true;
      await operation.catch(() => undefined);
    }
    await expect(operation).resolves.toEqual(outcome);
  });

  it("cancels and joins a live Windows owner on test abort, blocking later launches from that context", async (actualContext) => {
    const controller = new AbortController();
    const context: NativeFixtureTestContext = {
      signal: controller.signal,
      onTestFinished: vi.fn<NativeFixtureTestContext["onTestFinished"]>(),
    };
    const outcome = {
      ...completed,
      exitCode: null,
      reason: "caller-cancelled",
      cleanupErrors: [],
    };
    let observedAlive!: () => void;
    const alive = new Promise<void>((resolve) => {
      observedAlive = resolve;
    });
    let allowExit = false;
    vi.spyOn(process, "kill").mockImplementation(() => {
      observedAlive();
      if (allowExit && existsSync(path.join(root, "native-cancel.json"))) {
        writeFileSync(evidencePath, JSON.stringify(outcome));
        throw Object.assign(new Error("Supervisor settled"), { code: "ESRCH" });
      }
      return true;
    });
    let settled = false;
    const operation = run(context).then((result) => {
      settled = true;
      return result;
    });
    const onFinished = vi.mocked(context.onTestFinished);
    try {
      expect(onFinished).toHaveBeenCalledWith(expect.any(Function), 0);
      const finishing = onFinished.mock.calls[0]![0](actualContext);
      await alive;
      controller.abort();
      expect(settled).toBe(false);
      allowExit = true;
      await expect(operation).resolves.toEqual(outcome);
      await finishing;
    } finally {
      controller.abort();
      allowExit = true;
      await operation.catch(() => undefined);
    }
    const request = JSON.parse(
      await readFile(path.join(root, "supervisor-request.json"), "utf8"),
    ) as { cancellationToken: string; testContext?: unknown };
    expect(request.testContext).toBeUndefined();
    expect(
      JSON.parse(await readFile(path.join(root, "native-cancel.json"), "utf8")),
    ).toEqual({ token: request.cancellationToken });
    const launches = vi.mocked(childProcess.execFileSync).mock.calls.length;
    await expect(run(context)).rejects.toThrow();
    expect(vi.mocked(childProcess.execFileSync).mock.calls).toHaveLength(
      launches,
    );
    expect(onFinished).toHaveBeenCalledTimes(1);
  });

  it("retains an uncertain profile and refuses another launch in its receipt scope", async () => {
    disappear(JSON.stringify(completed));
    await expect(run()).resolves.toEqual(completed);
    expect(existsSync(root)).toBe(true);
    expect(existsSync(path.join(root, "ownership-blocked.json"))).toBe(true);
    const launches = vi.mocked(childProcess.execFileSync).mock.calls.length;
    await expect(run()).rejects.toThrow("ownership unresolved");
    expect(vi.mocked(childProcess.execFileSync).mock.calls).toHaveLength(
      launches,
    );
  });
});
