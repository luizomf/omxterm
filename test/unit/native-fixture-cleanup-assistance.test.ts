import { build } from "esbuild";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import { beforeAll, expect, it, vi } from "vitest";
import { isNativeFixtureResult } from "../fixtures/native-fixture-outcome";
import type * as Processes from "../fixtures/native-fixture-processes";

const require = createRequire(import.meta.url);
let program: string;
beforeAll(async () => {
  const compiled = await build({
    entryPoints: ["test/fixtures/native-fixture-processes.ts"],
    bundle: true,
    platform: "node",
    format: "cjs",
    write: false,
  });
  program = compiled.outputFiles[0]!.text;
});
const owner = { pid: 10000, parent: 1, identity: "birth" };
const receipt = {
  exitCode: 0,
  signal: null,
  reason: "exit",
  stdout: "",
  stderr: "",
  cleanupErrors: [],
};

it.each(["none", "attempted", "unknown"])(
  "accepts explicit %s assistance evidence",
  (cleanupAssistance) => {
    expect(isNativeFixtureResult({ ...receipt, cleanupAssistance })).toBe(true);
  },
);
it.each([undefined, null, true, false, {}, [], "successful", ""])(
  "rejects malformed assistance (%j)",
  (cleanupAssistance) => {
    expect(isNativeFixtureResult({ ...receipt, cleanupAssistance })).toBe(
      false,
    );
  },
);
it("keeps historical absence valid but does not classify it", () => {
  expect(isNativeFixtureResult(receipt)).toBe(true);
  expect(receipt).not.toHaveProperty("cleanupAssistance");
});

function load(
  platform: string,
  execFileSync: unknown,
  kill: unknown = vi.fn(),
) {
  const module = { exports: {} };
  runInNewContext(program, {
    module,
    exports: module.exports,
    Buffer,
    setTimeout,
    process: { platform, kill },
    require: (name: string) =>
      name === "node:child_process"
        ? { execFileSync }
        : (require(name) as unknown),
  });
  return module.exports as typeof Processes;
}

it("observes POSIX freeze and kill attempts only after identity validation", async () => {
  let alive = true;
  const events: string[] = [];
  // ps always contains another process even after our owned identity settles.
  const inventory = vi.fn(() =>
    alive ? "10000 1 birth S\n" : "999 1 other S\n",
  );
  const kill = vi.fn((_pid: number, signal: string) => {
    events.push(signal);
    if (signal === "SIGKILL") alive = false;
  });
  const helper = load("darwin", inventory, kill);
  await helper.terminateFixtureProcesses(
    new Map([[owner.pid, owner]]),
    undefined,
    undefined,
    () => events.push("attempt"),
  );
  expect(events).toEqual([
    "attempt",
    "SIGSTOP",
    "attempt",
    "SIGSTOP",
    "attempt",
    "SIGSTOP",
    "attempt",
    "SIGKILL",
  ]);
  expect(kill.mock.calls.every(([pid]) => pid === owner.pid)).toBe(true);
});

it.each(["absent", "reused"])(
  "does not record assistance for a POSIX %s identity",
  async (mode) => {
    const kill = vi.fn();
    const helper = load(
      "darwin",
      () => (mode === "reused" ? "10000 1 replacement S\n" : "999 1 other S\n"),
      kill,
    );
    const attempted = vi.fn();
    await helper.terminateFixtureProcesses(
      new Map([[owner.pid, owner]]),
      undefined,
      undefined,
      attempted,
    );
    expect(attempted).not.toHaveBeenCalled();
    expect(kill).not.toHaveBeenCalled();
  },
);

it.each(["ESRCH", "EPERM"])(
  "records a POSIX signal attempt even if it throws %s",
  (code) => {
    const original = Object.assign(new Error("signal failure"), { code });
    const helper = load(
      "darwin",
      () => "10000 1 birth S\n",
      () => {
        throw original;
      },
    );
    const attempted = vi.fn();
    if (code === "ESRCH")
      expect(() =>
        helper.signalFixtureProcess(owner, "SIGSTOP", attempted),
      ).not.toThrow();
    else
      expect(() =>
        helper.signalFixtureProcess(owner, "SIGSTOP", attempted),
      ).toThrow(original);
    expect(attempted).toHaveBeenCalledExactlyOnceWith();
  },
);

it("preserves a command exception even when assistance observation throws", async () => {
  const original = new Proxy(new Error("original"), {
    getOwnPropertyDescriptor() {
      throw new Error("observation failure");
    },
  });
  const helper = load("win32", () => {
    throw original;
  });
  const attempted = vi.fn();
  await expect(
    helper.terminateFixtureProcesses(
      new Map(),
      undefined,
      undefined,
      attempted,
    ),
  ).rejects.toBe(original);
  expect(attempted).not.toHaveBeenCalled();
});

it("retains Windows partial-command assistance without masking the original failure", async () => {
  const original = Object.assign(
    new Error("command failed after first target"),
    {
      stdout: Buffer.from("OMXTERM_CLEANUP_ASSISTANCE_ATTEMPTED\r\n"),
      status: 3,
    },
  );
  const helper = load("win32", () => {
    throw original;
  });
  const attempted = vi.fn();
  await expect(
    helper.terminateFixtureProcesses(
      new Map([[owner.pid, owner]]),
      undefined,
      undefined,
      attempted,
    ),
  ).rejects.toBe(original);
  expect(attempted).toHaveBeenCalledExactlyOnceWith();
});
