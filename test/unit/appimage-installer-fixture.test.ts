import { execFile } from "node:child_process";
import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { beforeEach, expect, it, vi } from "vitest";
import { createAppImageInstallerFixture } from "../fixtures/appimage-installer-fixture";

vi.mock("node:child_process", () => {
  const execFile = vi.fn();
  Object.defineProperty(execFile, Symbol.for("nodejs.util.promisify.custom"), {
    value: (...args: unknown[]) => {
      let resolve!: (value: unknown) => void;
      let reject!: (reason: unknown) => void;
      const promise = new Promise((resolvePromise, rejectPromise) => {
        resolve = resolvePromise;
        reject = rejectPromise;
      });
      const child: unknown = execFile(
        ...args,
        (error: Error | null, stdout: string, stderr: string) => {
          if (error) reject(Object.assign(error, { stdout, stderr }));
          else resolve({ stdout, stderr });
        },
      );
      return Object.assign(promise, { child });
    },
  });
  return { execFile };
});
vi.mock("node:fs/promises", () => ({
  mkdir: vi.fn(),
  mkdtemp: vi.fn(),
  rm: vi.fn(),
  writeFile: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(mkdtemp).mockResolvedValue(
    path.resolve("synthetic-installer-root"),
  );
});

function holdHelper() {
  type Callback = (error: Error | null, stdout: string, stderr: string) => void;
  const callbacks: Callback[] = [];
  vi.mocked(execFile).mockImplementation((...args: unknown[]) => {
    callbacks.push(args.at(-1) as Callback);
    return new EventEmitter() as ReturnType<typeof execFile>;
  });
  return (error: Error | null = null, index = 0) => {
    expect(callbacks[index]).toBeTypeOf("function");
    callbacks[index]!(error, "", "");
  };
}

it("reports settled invocations at test failure without exposing inputs", async () => {
  const clock = vi.spyOn(performance, "now").mockReturnValue(100);
  const report = vi.spyOn(console, "error").mockImplementation(() => {});
  const f = createAppImageInstallerFixture();
  const { home, bin } = await f.fixtureRoot();
  const children: EventEmitter[] = [];
  const callbacks: ((
    error: Error | null,
    stdout: string,
    stderr: string,
  ) => void)[] = [];
  vi.mocked(execFile).mockImplementation((...args: unknown[]) => {
    callbacks.push(args.at(-1) as (typeof callbacks)[number]);
    const child = new EventEmitter();
    children.push(child);
    return child as ReturnType<typeof execFile>;
  });
  try {
    const first = f.runHelper(home, bin, ["private-argument"]);
    callbacks[0]!(null, "", "");
    await first;
    clock.mockReturnValue(150);
    const second = f.runHelper(home, bin, ["private-argument"]);
    clock.mockReturnValue(180);
    children[1]!.emit("exit", 70, null);
    clock.mockReturnValue(185);
    children[1]!.emit("close", 70, null);
    callbacks[1]!(
      new Error("private-error"),
      "private-stdout",
      "private-stderr",
    );
    await expect(second).rejects.toThrow("private-error");
    clock.mockReturnValue(200);
    await f.cleanup(true);
    expect(report).toHaveBeenCalledExactlyOnceWith(
      "Installer fixture failure snapshot: root #1: age 100ms, started 2, pending 0, last settled #2: elapsed 35ms, exit at 30ms, close at 35ms",
    );
  } finally {
    report.mockRestore();
    clock.mockRestore();
  }
});

it("reports only failures and bounds root summaries", async () => {
  const report = vi.spyOn(console, "error").mockImplementation(() => {});
  const f = createAppImageInstallerFixture();
  try {
    await f.fixtureRoot();
    await f.cleanup();
    expect(report).not.toHaveBeenCalled();
    for (let index = 0; index < 5; index++) {
      vi.mocked(mkdtemp).mockResolvedValueOnce(
        path.resolve(`private-root-${index}`),
      );
      await f.fixtureRoot();
    }
    await f.cleanup(true);
    expect(report).toHaveBeenCalledOnce();
    const message = vi.mocked(report).mock.calls[0]![0] as string;
    expect(message).toContain("root #4:");
    expect(message).not.toContain("root #5:");
    expect(message).toContain("1 more roots");
    expect(message).not.toContain("private-root");
  } finally {
    report.mockRestore();
  }
});

it("snapshots the first executing invocation without its inputs", async () => {
  const clock = vi.spyOn(performance, "now").mockReturnValue(100);
  const f = createAppImageInstallerFixture();
  const { root, home, bin } = await f.fixtureRoot();
  const child = new EventEmitter();
  let callback!: (error: Error | null, stdout: string, stderr: string) => void;
  vi.mocked(execFile).mockImplementation((...args: unknown[]) => {
    callback = args.at(-1) as typeof callback;
    return child as ReturnType<typeof execFile>;
  });
  const operation = f.runHelper(home, bin, ["private-argument"], {
    SECRET: "private-environment",
  });
  clock.mockReturnValue(125);
  try {
    const failure = await f.cleanup().catch((error: unknown) => error);
    expect((failure as AggregateError).errors).toEqual([
      new Error(
        `Retained installer fixture: ${root}; invocation #1: elapsed 25ms, exit not observed, close not observed, execFile settlement pending`,
      ),
    ]);
    expect(String((failure as AggregateError).errors[0])).not.toContain(
      "private-",
    );
  } finally {
    callback(null, "out", "err");
    await expect(operation).resolves.toEqual({ stdout: "out", stderr: "err" });
    clock.mockRestore();
  }
});

it("snapshots the later exited invocation before another root's removal settles it", async () => {
  const clock = vi.spyOn(performance, "now").mockReturnValue(100);
  const f = createAppImageInstallerFixture();
  const idle = await f.fixtureRoot();
  vi.mocked(mkdtemp).mockResolvedValueOnce(path.resolve("synthetic-held-root"));
  const held = await f.fixtureRoot();
  const children: EventEmitter[] = [];
  const callbacks: ((
    error: Error | null,
    stdout: string,
    stderr: string,
  ) => void)[] = [];
  vi.mocked(execFile).mockImplementation((...args: unknown[]) => {
    callbacks.push(args.at(-1) as (typeof callbacks)[number]);
    const child = new EventEmitter();
    children.push(child);
    return child as ReturnType<typeof execFile>;
  });
  const first = f.runHelper(held.home, held.bin, ["install"]);
  callbacks[0]!(null, "", "");
  await first;
  clock.mockReturnValue(200);
  const second = f.runHelper(held.home, held.bin, ["install"]);
  clock.mockReturnValue(230);
  children[1]!.emit("exit", 70, null);
  clock.mockReturnValue(250);
  let finishRemoval!: () => void;
  vi.mocked(rm).mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finishRemoval = resolve;
      }),
  );
  const cleanup = f.cleanup();
  const error = new Error("late failure");
  children[1]!.emit("close", 70, null);
  callbacks[1]!(error, "", "");
  await expect(second).rejects.toBe(error);
  clock.mockReturnValue(500);
  finishRemoval();
  try {
    const failure = await cleanup.catch((cause: unknown) => cause);
    expect((failure as AggregateError).errors).toEqual([
      new Error(
        `Retained installer fixture: ${held.root}; invocation #2: elapsed 50ms, exit observed 20ms ago, close not observed, execFile settlement pending`,
      ),
    ]);
    expect(rm).toHaveBeenCalledExactlyOnceWith(idle.root, {
      recursive: true,
      force: true,
    });
  } finally {
    clock.mockRestore();
  }
});

it("bounds concurrent diagnostics and records an observed close", async () => {
  const f = createAppImageInstallerFixture();
  const { home, bin } = await f.fixtureRoot();
  const children: EventEmitter[] = [];
  const callbacks: ((
    error: Error | null,
    stdout: string,
    stderr: string,
  ) => void)[] = [];
  vi.mocked(execFile).mockImplementation((...args: unknown[]) => {
    callbacks.push(args.at(-1) as (typeof callbacks)[number]);
    const child = new EventEmitter();
    children.push(child);
    return child as ReturnType<typeof execFile>;
  });
  const operations = Array.from({ length: 9 }, () =>
    f.runHelper(home, bin, []),
  );
  children[0]!.emit("close", 0, null);
  try {
    const failure = await f.cleanup().catch((error: unknown) => error);
    const message = ((failure as AggregateError).errors[0] as Error).message;
    expect(message).toContain("close observed, execFile settlement pending");
    expect(message).toContain("invocation #8:");
    expect(message).not.toContain("invocation #9:");
    expect(message).toContain("1 more pending");
  } finally {
    for (const callback of callbacks) callback(null, "", "");
    await Promise.all(operations);
  }
});

it("retains the fixture root when cleanup runs before helper settlement", async () => {
  const f = createAppImageInstallerFixture();
  const { root, home, bin } = await f.fixtureRoot();
  const settle = holdHelper();
  const pending = f.runHelper(home, bin, ["install", "synthetic.AppImage"]);
  try {
    await expect(f.cleanup()).rejects.toThrow("helper settlement incomplete");
    expect(rm).not.toHaveBeenCalled();
  } finally {
    settle();
    await pending;
  }
  // A later test's cleanup must not retire a root retained by the failed test.
  await f.cleanup();
  expect(rm).not.toHaveBeenCalledWith(root, expect.anything());
  await expect(
    f.runHelper(home, bin, ["install", "late.AppImage"]),
  ).rejects.toThrow("no longer active");
  expect(execFile).toHaveBeenCalledTimes(1);
});

it.each([false, true])(
  "removes a root after helper settlement (rejection: %s)",
  async (reject) => {
    const f = createAppImageInstallerFixture();
    const { root, home, bin } = await f.fixtureRoot();
    const settle = holdHelper();
    const error = Object.assign(new Error("injected restoration failure"), {
      code: 70,
    });
    const operation = f.runHelper(home, bin, ["install", "synthetic.AppImage"]);
    settle(reject ? error : null);
    if (reject) await expect(operation).rejects.toBe(error);
    else await operation;
    await f.cleanup();
    expect(rm).toHaveBeenCalledExactlyOnceWith(root, {
      recursive: true,
      force: true,
    });
    await f.cleanup();
    expect(rm).toHaveBeenCalledTimes(1);
  },
);

it("does not retain a root when helper launch throws synchronously", async () => {
  const f = createAppImageInstallerFixture();
  const { root, home, bin } = await f.fixtureRoot();
  const failure = new Error("synthetic launch refusal");
  vi.mocked(execFile).mockImplementation(() => {
    throw failure;
  });
  const operation = f.runHelper(home, bin, ["--help"]);
  const rejected = expect(operation).rejects.toBe(failure);
  await f.cleanup();
  await rejected;
  expect(rm).toHaveBeenCalledExactlyOnceWith(root, {
    recursive: true,
    force: true,
  });
});

it("retains a root until every helper has settled, not just the latest call", async () => {
  const f = createAppImageInstallerFixture();
  const { home, bin } = await f.fixtureRoot();
  const settle = holdHelper();
  const first = f.runHelper(home, bin, ["--help"]);
  const second = f.runHelper(home, bin, ["--version"]);
  settle(null, 1);
  await second;
  try {
    await expect(f.cleanup()).rejects.toThrow("helper settlement incomplete");
    expect(rm).not.toHaveBeenCalled();
  } finally {
    settle();
    await first;
  }
});

it("keeps a pending-at-cleanup root even if its helper settles during another root's removal", async () => {
  const f = createAppImageInstallerFixture();
  const idle = await f.fixtureRoot();
  vi.mocked(mkdtemp).mockResolvedValueOnce(path.resolve("synthetic-held-root"));
  const held = await f.fixtureRoot();
  const settle = holdHelper();
  const operation = f.runHelper(held.home, held.bin, ["--help"]);
  let finishRemoval!: () => void;
  vi.mocked(rm).mockImplementationOnce(
    () =>
      new Promise<void>((resolve) => {
        finishRemoval = resolve;
      }),
  );
  const cleanup = f.cleanup();
  settle();
  await operation;
  finishRemoval();
  await expect(cleanup).rejects.toThrow("helper settlement incomplete");
  expect(rm).toHaveBeenCalledExactlyOnceWith(idle.root, {
    recursive: true,
    force: true,
  });
});

it("cleans an unrelated settled root but keeps a failed test's pending root and diagnostic", async () => {
  const f = createAppImageInstallerFixture();
  const held = await f.fixtureRoot();
  vi.mocked(mkdtemp).mockResolvedValueOnce(
    path.resolve("synthetic-other-root"),
  );
  const idle = await f.fixtureRoot();
  const settle = holdHelper();
  const operation = f.runHelper(held.home, held.bin, [
    "install",
    "synthetic.AppImage",
  ]);
  try {
    const failure = await f.cleanup().catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(AggregateError);
    const errors = (failure as AggregateError).errors as unknown[];
    expect(errors).toHaveLength(1);
    expect(errors[0]).toBeInstanceOf(Error);
    const retained = errors[0] as Error;
    expect(retained.message).toMatch(
      /^Retained installer fixture: .*; invocation #1: elapsed \d+ms, exit not observed, close not observed, execFile settlement pending$/,
    );
    expect(retained.message).toContain(held.root);
    expect(rm).toHaveBeenCalledExactlyOnceWith(idle.root, {
      recursive: true,
      force: true,
    });
  } finally {
    const error = new Error("late helper failure");
    settle(error);
    await expect(operation).rejects.toBe(error);
  }
  vi.mocked(mkdtemp).mockResolvedValueOnce(
    path.resolve("synthetic-next-test-root"),
  );
  const next = await f.fixtureRoot();
  await f.cleanup();
  expect(rm).toHaveBeenLastCalledWith(next.root, {
    recursive: true,
    force: true,
  });
  expect(rm).not.toHaveBeenCalledWith(held.root, expect.anything());
});
