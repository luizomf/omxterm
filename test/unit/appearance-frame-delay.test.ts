import { describe, expect, it } from "vitest";
import {
  createAppearanceFrameDelay,
  type AppearanceFrameScheduler,
} from "../fixtures/restty-appearance-frame-delay";

// Drive the same scheduling Interface used by the native fixture. Callback
// delivery, timers and cancellation are real helper operations, not receipt mocks.
function schedulerHarness() {
  let now = 0;
  let nextId = 0;
  const frames = new Map<number, FrameRequestCallback>();
  const timers = new Map<number, { at: number; callback: () => void }>();
  const scheduler: AppearanceFrameScheduler = {
    now: () => now,
    request(callback) {
      const id = ++nextId;
      frames.set(id, callback);
      return id;
    },
    cancel(id) {
      frames.delete(id);
    },
    setTimer(callback, delay) {
      const id = ++nextId;
      timers.set(id, { at: now + delay, callback });
      return id;
    },
    clearTimer(id) {
      timers.delete(id);
    },
  };
  return {
    scheduler,
    frame(at: number) {
      now = at;
      const entry = frames.entries().next().value;
      if (!entry) throw new Error("Expected an actual queued frame");
      frames.delete(entry[0]);
      entry[1](at);
    },
    timers(at: number) {
      now = at;
      for (const [id, timer] of [...timers]) {
        if (timer.at > now) continue;
        timers.delete(id);
        timer.callback();
      }
    },
    drain() {
      for (let pass = 0; pass < 8; pass++) {
        this.timers(now + 1000);
        const frameCount = frames.size;
        for (let frame = 0; frame < frameCount; frame++) this.frame(now + 16.7);
      }
    },
    pending: () => frames.size + timers.size,
  };
}

describe("appearance delayed-frame ownership", () => {
  it("reserves the queued Surface callback across exact-threshold retries, not the later layout waiter", async () => {
    const h = schedulerHarness();
    const delay = createAppearanceFrameDelay(h.scheduler, true);
    const delivered: [string, number][] = [];
    delay.request((time) => delivered.push(["surface", time]));
    delay.beginSelection();
    let ready = false;
    const receipt = delay.waitForSelectionDelay().then(() => {
      ready = true;
    });
    delay.request((time) => delivered.push(["layout-waiter", time]));
    h.frame(349.9);
    h.frame(350.1);
    await Promise.resolve();
    expect(ready).toBe(false);
    h.timers(350.2);
    h.frame(366.7);
    await receipt;
    expect(ready).toBe(true);
    expect(delivered).toEqual([["layout-waiter", 350.1]]);
    expect(delay.lateFrameArrivalMs).toBe(366.7);
    h.timers(666.7);
    h.frame(683.4);
    expect(delivered).toEqual([
      ["layout-waiter", 350.1],
      ["surface", 683.4],
    ]);
    expect(h.pending()).toBe(0);
  });

  it.each([
    "initial-native",
    "arrival-timer",
    "arrival-native",
    "selection-timer",
    "selection-native",
  ] as const)(
    "cancels the same returned identity at %s without delivering or retaining a continuation",
    (stage) => {
      const h = schedulerHarness();
      const delay = createAppearanceFrameDelay(h.scheduler, true);
      const delivered: number[] = [];
      const id = delay.request((time) => delivered.push(time));
      delay.beginSelection();
      if (stage !== "initial-native") h.frame(10);
      if (
        ["arrival-native", "selection-timer", "selection-native"].includes(
          stage,
        )
      )
        h.timers(350);
      if (["selection-timer", "selection-native"].includes(stage))
        h.frame(366.7);
      if (stage === "selection-native") h.timers(666.7);
      delay.cancel(id);
      h.drain();
      expect(delivered).toEqual([]);
      expect(h.pending()).toBe(0);
    },
  );

  it.each(["output-timer", "output-native"])(
    "preserves cancellation during inherited configured-font %s",
    (stage) => {
      const h = schedulerHarness();
      const delay = createAppearanceFrameDelay(h.scheduler, false);
      const delivered: number[] = [];
      delay.beginOutput(true);
      const id = delay.request((time) => delivered.push(time));
      h.frame(10);
      if (stage === "output-native") h.timers(300);
      delay.cancel(id);
      h.drain();
      expect(delivered).toEqual([]);
      expect(h.pending()).toBe(0);
    },
  );

  it("rejects an owned selection waiter on cancellation rather than acknowledging another frame", async () => {
    const h = schedulerHarness();
    const delay = createAppearanceFrameDelay(h.scheduler, true);
    const id = delay.request(() => {
      throw new Error("Cancelled Surface ran");
    });
    delay.beginSelection();
    h.frame(10);
    const rejected = expect(delay.waitForSelectionDelay()).rejects.toThrow(
      "Selection frame delay was cancelled",
    );
    delay.cancel(id);
    await rejected;
    h.drain();
    expect(h.pending()).toBe(0);
    await expect(delay.waitForSelectionDelay()).rejects.toThrow(
      "Selection frame delay was cancelled",
    );
  });

  it("requires an actually queued affected Surface callback", () => {
    const h = schedulerHarness();
    const delay = createAppearanceFrameDelay(h.scheduler, true);
    expect(() => delay.beginSelection()).toThrow(
      "Selection delay found no queued Surface frame",
    );
  });

  it("keeps the configured-font interval, while ordinary callbacks remain immediate", () => {
    const h = schedulerHarness();
    const delay = createAppearanceFrameDelay(h.scheduler, false);
    const delivered: number[] = [];
    delay.beginOutput(true);
    delay.request((time) => delivered.push(time));
    h.frame(10);
    expect(delivered).toEqual([]);
    h.timers(299.9);
    expect(h.pending()).toBe(1);
    h.timers(300);
    h.frame(316.7);
    expect(delivered).toEqual([316.7]);
    expect(delay.deferredFrame).toBe(true);
    delay.beginOutput(false);
    delay.request((time) => delivered.push(time));
    h.frame(333.4);
    expect(delivered).toEqual([316.7, 333.4]);
    expect(delay.deferredFrame).toBe(false);
  });
});
