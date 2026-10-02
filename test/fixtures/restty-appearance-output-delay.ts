export interface AppearanceOutputScheduler {
  request(callback: FrameRequestCallback): number;
  cancel(id: number): void;
  now(): number;
  setTimer(callback: () => void, delay: number): number;
  clearTimer(id: number): void;
}

interface PendingOutputFrame {
  nativeId?: number;
  timerId?: number;
}

export function createAppearanceOutputDelay(
  scheduler: AppearanceOutputScheduler,
) {
  let deferUntil = 0;
  let deferredFrame = false;
  const pending = new Map<number, PendingOutputFrame>();
  return {
    request(callback: FrameRequestCallback) {
      const entry: PendingOutputFrame = {};
      const deliver = (time: number) => {
        delete entry.nativeId;
        if (pending.delete(id)) callback(time);
      };
      const id = scheduler.request((time) => {
        delete entry.nativeId;
        if (!pending.has(id)) return;
        const remaining = deferUntil - scheduler.now();
        if (remaining > 0) {
          deferredFrame = true;
          entry.timerId = scheduler.setTimer(() => {
            delete entry.timerId;
            if (pending.has(id)) entry.nativeId = scheduler.request(deliver);
          }, remaining);
        } else deliver(time);
      });
      entry.nativeId = id;
      // The originally returned native ID remains the logical owner even when
      // the interval replaces its continuation with a timer and another RAF.
      pending.set(id, entry);
      return id;
    },
    cancel(id: number) {
      const entry = pending.get(id);
      if (!entry) {
        scheduler.cancel(id);
        return;
      }
      pending.delete(id);
      if (entry.nativeId !== undefined) scheduler.cancel(entry.nativeId);
      if (entry.timerId !== undefined) scheduler.clearTimer(entry.timerId);
    },
    beginOutput(defer: boolean) {
      deferredFrame = false;
      deferUntil = defer ? scheduler.now() + 300 : 0;
    },
    get deferredFrame() {
      return deferredFrame;
    },
  };
}
