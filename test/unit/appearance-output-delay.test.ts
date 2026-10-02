import { expect, it } from "vitest";
import {
  createAppearanceOutputDelay,
  type AppearanceOutputScheduler,
} from "../fixtures/restty-appearance-output-delay";

function schedulerHarness() {
  let now = 0;
  let nextId = 0;
  const frames = new Map<number, FrameRequestCallback>();
  const timers = new Map<number, { at: number; callback: () => void }>();
  const scheduler: AppearanceOutputScheduler = {
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
    frames(at: number, timestamp = at) {
      now = at;
      for (const [id, callback] of [...frames]) {
        frames.delete(id);
        callback(timestamp);
      }
    },
    timers(at: number) {
      now = at;
      for (const [id, timer] of [...timers]) {
        if (timer.at > now) continue;
        timers.delete(id);
        timer.callback();
      }
    },
    pending: () => frames.size + timers.size,
  };
}

it.each(["initial-native", "output-timer", "resumed-native"] as const)(
  "cancels configured-font output at %s using its originally returned identity",
  (stage) => {
    const h = schedulerHarness();
    const delay = createAppearanceOutputDelay(h.scheduler);
    const delivered: number[] = [];
    delay.beginOutput(true);
    const id = delay.request((time) => delivered.push(time));
    if (stage !== "initial-native") h.frames(10);
    if (stage === "resumed-native") h.timers(300);
    delay.cancel(id);
    const pendingAfterCancel = h.pending();
    h.timers(1000);
    h.frames(1016.7);
    expect(delivered).toEqual([]);
    expect(pendingAfterCancel).toBe(0);
    expect(h.pending()).toBe(0);
  },
);

it("retains the configured-font interval and forwards actual RAF timestamps, with ordinary output immediate", () => {
  const h = schedulerHarness();
  const delay = createAppearanceOutputDelay(h.scheduler);
  const delivered: number[] = [];
  delay.beginOutput(true);
  delay.request((time) => delivered.push(time));
  h.frames(10, 9000);
  delay.request((time) => delivered.push(time));
  h.frames(299);
  h.timers(299.9);
  expect(delivered).toEqual([]);
  expect(h.pending()).toBe(2);
  h.timers(300);
  h.frames(316.7, 12345);
  expect(delivered).toEqual([12345, 12345]);
  expect(delay.deferredFrame).toBe(true);
  delay.beginOutput(false);
  delay.request((time) => delivered.push(time));
  h.frames(333.4);
  expect(delivered).toEqual([12345, 12345, 333.4]);
  expect(delay.deferredFrame).toBe(false);
  expect(h.pending()).toBe(0);
});

it("does not rearm an expired configured-font interval on late arrival", () => {
  const h = schedulerHarness();
  const delay = createAppearanceOutputDelay(h.scheduler);
  const delivered: number[] = [];
  delay.beginOutput(true);
  delay.request((time) => delivered.push(time));
  h.frames(350);
  expect(delivered).toEqual([350]);
  expect(delay.deferredFrame).toBe(false);
  expect(h.pending()).toBe(0);
});
