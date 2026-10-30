import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";
import { subscribeWindowOwnerLoss } from "../../src/main/window-owner-loss";

function setup() {
  const contents = new EventEmitter();
  const window = Object.assign(new EventEmitter(), { webContents: contents });
  const counts = () => [
    window.listenerCount("closed"),
    contents.listenerCount("destroyed"),
    contents.listenerCount("render-process-gone"),
  ];
  return { window, contents, counts };
}

describe("shared window owner loss", () => {
  it.each(["closed", "destroyed", "render-process-gone"])(
    "synchronously notifies in subscription order once on %s and detaches before dispatch",
    (event) => {
      const test = setup();
      const calls: number[] = [];
      const unsubscribes = [1, 2, 3].map((id) =>
        subscribeWindowOwnerLoss(test.window, () => {
          expect(test.counts()).toEqual([0, 0, 0]);
          calls.push(id);
        }),
      );
      expect(test.counts()).toEqual([1, 1, 1]);
      (event === "closed" ? test.window : test.contents).emit(event);
      expect(calls).toEqual([1, 2, 3]);
      test.window.emit("closed");
      test.contents.emit("destroyed");
      test.contents.emit("render-process-gone");
      unsubscribes.forEach((unsubscribe) => unsubscribe());
      expect(calls).toEqual([1, 2, 3]);
      expect(test.counts()).toEqual([0, 0, 0]);
    },
  );

  it("treats duplicate callbacks as independent subscriptions", () => {
    const test = setup();
    const callback = vi.fn();
    const first = subscribeWindowOwnerLoss(test.window, callback);
    subscribeWindowOwnerLoss(test.window, callback);
    subscribeWindowOwnerLoss(test.window, callback);
    first();
    first();
    expect(test.counts()).toEqual([1, 1, 1]);
    test.contents.emit("destroyed");
    expect(callback).toHaveBeenCalledTimes(2);
  });

  it("detaches on last unsubscribe and reattaches without recapturing contents", () => {
    const test = setup();
    const first = vi.fn();
    const unsubscribe = subscribeWindowOwnerLoss(test.window, first);
    unsubscribe();
    unsubscribe();
    expect(test.counts()).toEqual([0, 0, 0]);
    const getter = vi.fn(() => {
      throw new Error("Native getter unavailable");
    });
    Object.defineProperty(test.window, "webContents", { get: getter });
    const second = vi.fn();
    subscribeWindowOwnerLoss(test.window, second);
    expect(test.counts()).toEqual([1, 1, 1]);
    test.contents.emit("render-process-gone");
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledOnce();
    expect(getter).not.toHaveBeenCalled();
  });

  it("uses captured contents for loss and keeps a permanent lost latch", () => {
    const test = setup();
    const first = vi.fn();
    const unsubscribe = subscribeWindowOwnerLoss(test.window, first);
    const getter = vi.fn(() => {
      throw new Error("Object has been destroyed");
    });
    Object.defineProperty(test.window, "webContents", { get: getter });
    test.window.emit("closed");
    unsubscribe();
    const late = vi.fn();
    const unsubscribeLate = subscribeWindowOwnerLoss(test.window, late);
    expect(first).toHaveBeenCalledOnce();
    expect(late).toHaveBeenCalledOnce();
    unsubscribeLate();
    unsubscribeLate();
    expect(test.counts()).toEqual([0, 0, 0]);
    expect(getter).not.toHaveBeenCalled();
  });

  it("skips subscriptions removed during dispatch and handles reentrant loss and subscription", () => {
    const test = setup();
    const calls: string[] = [];
    let removeSecond = () => {};
    subscribeWindowOwnerLoss(test.window, () => {
      calls.push("first");
      removeSecond();
      test.contents.emit("destroyed");
      subscribeWindowOwnerLoss(test.window, () => calls.push("late"));
      calls.push("first-return");
    });
    removeSecond = subscribeWindowOwnerLoss(test.window, () =>
      calls.push("removed"),
    );
    subscribeWindowOwnerLoss(test.window, () => calls.push("last"));
    test.window.emit("closed");
    expect(calls).toEqual(["first", "late", "first-return", "last"]);
    expect(test.counts()).toEqual([0, 0, 0]);
  });

  it("runs remaining callbacks before synchronously throwing all callback errors", () => {
    const test = setup();
    const first = new Error("first");
    const second = new Error("second");
    const remaining = vi.fn();
    subscribeWindowOwnerLoss(test.window, () => {
      throw first;
    });
    subscribeWindowOwnerLoss(test.window, remaining);
    subscribeWindowOwnerLoss(test.window, () => {
      throw second;
    });
    let failure: unknown;
    try {
      test.contents.emit("destroyed");
    } catch (error) {
      failure = error;
    }
    expect(remaining).toHaveBeenCalledOnce();
    expect(failure).toBeInstanceOf(AggregateError);
    expect((failure as AggregateError).errors).toEqual([first, second]);
    expect(test.counts()).toEqual([0, 0, 0]);
    expect(() => test.window.emit("closed")).not.toThrow();
    const late = vi.fn();
    subscribeWindowOwnerLoss(test.window, late);
    expect(late).toHaveBeenCalledOnce();
  });

  it("does not notify or detach another window's subscribers", () => {
    const first = setup();
    const second = setup();
    const callback = vi.fn();
    subscribeWindowOwnerLoss(first.window, () => {});
    subscribeWindowOwnerLoss(second.window, callback);
    first.window.emit("closed");
    expect(callback).not.toHaveBeenCalled();
    expect(second.counts()).toEqual([1, 1, 1]);
    second.contents.emit("destroyed");
    expect(callback).toHaveBeenCalledOnce();
  });
});
