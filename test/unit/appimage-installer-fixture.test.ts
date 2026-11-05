import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import { beforeEach, expect, it, vi } from "vitest";
import { createAppImageInstallerFixture } from "../fixtures/appimage-installer-fixture";

vi.mock("node:child_process", () => ({ execFile: vi.fn() }));
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
    return {} as ReturnType<typeof execFile>;
  });
  return (error: Error | null = null, index = 0) => {
    expect(callbacks[index]).toBeTypeOf("function");
    callbacks[index]!(error, "", "");
  };
}

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
  await expect(f.runHelper(home, bin, ["--help"])).rejects.toBe(failure);
  await f.cleanup();
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
    expect((failure as AggregateError).errors).toEqual([
      new Error(`Retained installer fixture: ${held.root}`),
    ]);
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
