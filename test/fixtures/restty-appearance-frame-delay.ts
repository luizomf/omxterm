export interface AppearanceFrameScheduler {
  request(callback: FrameRequestCallback): number;
  cancel(id: number): void;
  now(): number;
  setTimer(callback: () => void, delay: number): number;
  clearTimer(id: number): void;
}

interface SelectionDelay {
  armedAt: number;
  arrivalMs: number;
  deferred: boolean;
  cancelled: boolean;
  waiters: { resolve(): void; reject(error: Error): void }[];
}

interface ScheduledFrame {
  id: number;
  callback: FrameRequestCallback;
  nativeId?: number;
  timerId?: number;
  selection?: SelectionDelay;
}

export function createAppearanceFrameDelay(
  scheduler: AppearanceFrameScheduler,
  lateFrameArrival: boolean,
) {
  let nextId = 0;
  let deferUntil = 0;
  let deferredFrame = false;
  let selection: SelectionDelay | undefined;
  const pending = new Map<number, ScheduledFrame>();
  const cancellationError = () =>
    new Error("Selection frame delay was cancelled");

  const schedule = (entry: ScheduledFrame, callback: FrameRequestCallback) => {
    if (pending.get(entry.id) !== entry) return;
    entry.nativeId = scheduler.request((time) => {
      delete entry.nativeId;
      if (pending.get(entry.id) === entry) callback(time);
    });
  };
  const after = (
    entry: ScheduledFrame,
    delay: number,
    callback: FrameRequestCallback,
  ) => {
    entry.timerId = scheduler.setTimer(() => {
      delete entry.timerId;
      schedule(entry, callback);
    }, delay);
  };
  const deliver = (entry: ScheduledFrame, time: number) => {
    pending.delete(entry.id);
    entry.callback(time);
  };
  const arrive = (entry: ScheduledFrame, time: number) => {
    const now = scheduler.now();
    const ownedSelection = entry.selection;
    if (ownedSelection) {
      const remainingArrival = ownedSelection.armedAt + 350 - now;
      if (lateFrameArrival && remainingArrival > 0) {
        after(entry, remainingArrival, (nextTime) => arrive(entry, nextTime));
        return;
      }
      ownedSelection.arrivalMs = lateFrameArrival
        ? now - ownedSelection.armedAt
        : 0;
      ownedSelection.deferred = true;
      deferredFrame = true;
      after(entry, 300, (nextTime) => deliver(entry, nextTime));
      for (const waiter of ownedSelection.waiters.splice(0)) waiter.resolve();
      return;
    }
    // Configured-font output retains its original wall-clock interval. Layout
    // waiters created after selection never acquire that selection's stimulus.
    const remaining = deferUntil - now;
    if (remaining > 0) {
      deferredFrame = true;
      after(entry, remaining, (nextTime) => deliver(entry, nextTime));
    } else deliver(entry, time);
  };

  return {
    request(callback: FrameRequestCallback) {
      const entry: ScheduledFrame = { id: ++nextId, callback };
      pending.set(entry.id, entry);
      schedule(entry, (time) => arrive(entry, time));
      return entry.id;
    },
    cancel(id: number) {
      const entry = pending.get(id);
      if (!entry) return;
      pending.delete(id);
      if (entry.nativeId !== undefined) scheduler.cancel(entry.nativeId);
      if (entry.timerId !== undefined) scheduler.clearTimer(entry.timerId);
      if (entry.selection) {
        entry.selection.cancelled = true;
        for (const waiter of entry.selection.waiters.splice(0))
          waiter.reject(cancellationError());
      }
    },
    beginSelection() {
      // Only the already queued live Surface callback is affected. Reserve its
      // logical identity before any per-callback arrival checks can retry.
      const entry = pending.values().next().value;
      if (!entry)
        throw new Error("Selection delay found no queued Surface frame");
      selection = {
        armedAt: scheduler.now(),
        arrivalMs: 0,
        deferred: false,
        cancelled: false,
        waiters: [],
      };
      entry.selection = selection;
    },
    beginOutput(defer: boolean) {
      deferredFrame = false;
      deferUntil = defer ? scheduler.now() + 300 : 0;
    },
    waitForSelectionDelay(): Promise<void> {
      if (!selection)
        return Promise.reject(new Error("Selection delay was not armed"));
      if (selection.cancelled) return Promise.reject(cancellationError());
      if (selection.deferred) return Promise.resolve();
      const current = selection;
      return new Promise((resolve, reject) =>
        current.waiters.push({ resolve, reject }),
      );
    },
    get deferredFrame() {
      return deferredFrame;
    },
    get lateFrameArrivalMs() {
      return selection?.arrivalMs ?? 0;
    },
  };
}
