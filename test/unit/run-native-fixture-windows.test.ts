import * as childProcess from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { mkdir, mkdtemp, readFile, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { build } from "esbuild";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  runNativeFixture,
  type NativeFixtureTestContext,
} from "../fixtures/run-native-fixture";

vi.mock("node:child_process", { spy: true });

const platform = Object.getOwnPropertyDescriptor(process, "platform")!;
const completed = {
  exitCode: 7,
  signal: null,
  reason: "exit",
  stdout: "synthetic stdout\n",
  stderr: "synthetic stderr\n",
  cleanupErrors: ["synthetic cleanup failure"],
  ownedProcesses: [{ pid: 42, parent: 1, identity: "456" }],
};
let root: string;
let evidencePath: string;
let preservedRoots: string[];
beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "omxterm-outcome-"));
  evidencePath = path.join(root, "outcome.json");
  preservedRoots = [];
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
afterEach(async () => {
  vi.restoreAllMocks();
  Object.defineProperty(process, "platform", platform);
  await rm(root, { recursive: true, force: true });
  await Promise.all(
    preservedRoots.map((profile) =>
      rm(profile, { recursive: true, force: true }),
    ),
  );
});

function run(testContext?: NativeFixtureTestContext) {
  return runNativeFixture({
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

describe("Native fixture preparation lifetime", () => {
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
    const operation = runNativeFixture({
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
    const finishing = vi
      .mocked(context.onTestFinished)
      .mock.calls[0]![0](actualContext);
    try {
      await preparing;
      controller.abort();
      expect(settled).toBe(false);
      expect(vi.mocked(childProcess.execFileSync)).not.toHaveBeenCalled();
    } finally {
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
      runNativeFixture({
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
    const operation = runNativeFixture({
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
    let now = 0;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const outcome = { ...completed, cleanupErrors: [] };
    const inventory = vi.spyOn(process, "kill").mockImplementation(() => {
      now += 1_000;
      if (now > 28_000) {
        writeFileSync(evidencePath, JSON.stringify(outcome));
        throw Object.assign(new Error("Supervisor settled"), { code: "ESRCH" });
      }
      return true;
    });
    await expect(run()).resolves.toEqual(outcome);
    expect(inventory).toHaveBeenCalledTimes(29);
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
    await alive;
    expect(settled).toBe(false);
    allowExit = true;
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
    expect(onFinished).toHaveBeenCalledWith(expect.any(Function), 0);
    const finishing = onFinished.mock.calls[0]![0](actualContext);
    await alive;
    controller.abort();
    expect(settled).toBe(false);
    allowExit = true;
    await expect(operation).resolves.toEqual(outcome);
    await finishing;
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
