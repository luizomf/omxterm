interface ClosedEmitter {
  once(event: "closed", listener: () => void): unknown;
}

const callbacks = new WeakMap<ClosedEmitter, Array<() => void>>();

/** Runs `onClosed` when the window closes. Every owner of a window shares one
 * native `closed` listener, so adding owners never approaches Node's default
 * listener limit. Callbacks run in registration order; one failing does not
 * skip the others, and the errors are rethrown together afterwards. */
export function onWindowClosed(
  window: ClosedEmitter,
  onClosed: () => void,
): void {
  let pending = callbacks.get(window);
  if (!pending) {
    const list: Array<() => void> = [];
    pending = list;
    callbacks.set(window, list);
    window.once("closed", () => {
      const errors: unknown[] = [];
      for (const callback of list.splice(0)) {
        try {
          callback();
        } catch (error) {
          errors.push(error);
        }
      }
      if (errors.length)
        throw new AggregateError(errors, "Window close handlers failed");
    });
  }
  pending.push(onClosed);
}
