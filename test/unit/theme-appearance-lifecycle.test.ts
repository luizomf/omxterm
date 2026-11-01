import { expect, it, vi } from "vitest";
import { createThemeCompletion } from "../fixtures/theme-appearance-lifecycle";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
function fixture() {
  const retirement = deferred<boolean>();
  const exits = deferred<void>();
  const close = vi.fn(() => true);
  const closeWindows = vi.fn();
  const publish = vi.fn();
  const quit = vi.fn();
  const exit = vi.fn();
  const report = vi.fn();
  const completion = createThemeCompletion({
    requestClose: close,
    retire: () => retirement.promise,
    closeWindows,
    joinSessions: () => exits.promise,
    publish,
    quit,
    exit,
    report,
  });
  return {
    completion,
    retirement,
    exits,
    close,
    closeWindows,
    publish,
    quit,
    exit,
    report,
  };
}

it("joins resource retirement and actual PTY exits before reporting success", async () => {
  const f = fixture();
  const operation = f.completion.complete(0, { verified: true });
  expect(f.completion.started()).toBe(true);
  expect(f.close).toHaveBeenCalledOnce();
  f.exits.resolve();
  await Promise.resolve();
  expect(f.publish).not.toHaveBeenCalled();
  expect(f.quit).not.toHaveBeenCalled();
  f.retirement.resolve(true);
  await operation;
  expect(f.closeWindows).toHaveBeenCalledOnce();
  expect(f.publish).toHaveBeenCalledExactlyOnceWith({ verified: true });
  expect(f.quit).toHaveBeenCalledOnce();
  expect(f.exit).not.toHaveBeenCalled();
});

it.each([1, 130, 143])(
  "joins cancellation or a later failure (%s) and never publishes success",
  async (code) => {
    const f = fixture();
    const operation = f.completion.complete(0, { verified: true });
    expect(f.completion.complete(code)).toBe(operation);
    f.retirement.resolve(true);
    await Promise.resolve();
    expect(f.exit).not.toHaveBeenCalled();
    f.exits.resolve();
    await operation;
    expect(f.close).toHaveBeenCalledOnce();
    expect(f.publish).not.toHaveBeenCalled();
    expect(f.quit).not.toHaveBeenCalled();
    expect(f.exit).toHaveBeenCalledExactlyOnceWith(code);
  },
);

it("still joins every PTY after a close request reports failure", async () => {
  const f = fixture();
  f.close.mockReturnValue(false);
  const operation = f.completion.complete(0, { verified: true });
  f.retirement.resolve(true);
  await Promise.resolve();
  expect(f.exit).not.toHaveBeenCalled();
  f.exits.resolve();
  await operation;
  expect(f.exit).toHaveBeenCalledExactlyOnceWith(1);
  expect(f.publish).not.toHaveBeenCalled();
  expect(f.quit).not.toHaveBeenCalled();
});

it("publishes its completion latch before a reentrant close callback", async () => {
  const retired = deferred<boolean>();
  const exited = deferred<void>();
  const quit = vi.fn();
  const exit = vi.fn();
  let reentrant!: Promise<void>;
  const completion = createThemeCompletion({
    requestClose() {
      reentrant = completion.complete(1);
      return true;
    },
    retire: () => retired.promise,
    closeWindows() {},
    joinSessions: () => exited.promise,
    publish() {},
    quit,
    exit,
    report() {},
  });
  const original = completion.complete(0, { verified: true });
  expect(reentrant).toBe(original);
  retired.resolve(true);
  exited.resolve();
  await original;
  expect(quit).not.toHaveBeenCalled();
  expect(exit).toHaveBeenCalledExactlyOnceWith(1);
});

it("retains the owner when retirement rejects rather than treating it as settlement", async () => {
  const f = fixture();
  const error = new Error("uncertain retirement");
  void f.completion.complete(1);
  f.exits.resolve();
  f.retirement.reject(error);
  await vi.waitFor(() =>
    expect(f.report).toHaveBeenCalledExactlyOnceWith(error),
  );
  expect(f.closeWindows).not.toHaveBeenCalled();
  expect(f.exit).not.toHaveBeenCalled();
  expect(f.quit).not.toHaveBeenCalled();
});

it("retains the owner and publishes nothing when resource retirement is uncertain", async () => {
  const f = fixture();
  void f.completion.complete(0, { verified: true });
  f.exits.resolve();
  f.retirement.resolve(false);
  await vi.waitFor(() => expect(f.report).toHaveBeenCalledOnce());
  expect(f.closeWindows).not.toHaveBeenCalled();
  expect(f.publish).not.toHaveBeenCalled();
  expect(f.quit).not.toHaveBeenCalled();
  expect(f.exit).not.toHaveBeenCalled();
});
