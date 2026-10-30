interface LossEmitter {
  on(event: string, listener: () => void): unknown;
  removeListener(event: string, listener: () => void): unknown;
}
interface OwnerWindow extends LossEmitter {
  readonly webContents: LossEmitter;
}
type Subscription = { active: boolean; notify(): void };

class OwnerLoss {
  readonly #contents: LossEmitter;
  readonly #subscriptions = new Set<Subscription>();
  #lost = false;
  #listening = false;

  constructor(private readonly window: OwnerWindow) {
    // Native BrowserWindow getters can throw after destruction.
    this.#contents = window.webContents;
  }

  #detach() {
    if (!this.#listening) return;
    this.#listening = false;
    this.window.removeListener("closed", this.#lose);
    this.#contents.removeListener("destroyed", this.#lose);
    this.#contents.removeListener("render-process-gone", this.#lose);
  }

  #lose = () => {
    if (this.#lost) return;
    this.#lost = true;
    this.#detach();
    const pending = [...this.#subscriptions];
    this.#subscriptions.clear();
    const errors: unknown[] = [];
    for (const subscription of pending) {
      if (!subscription.active) continue;
      subscription.active = false;
      try {
        subscription.notify();
      } catch (error) {
        errors.push(error);
      }
    }
    // Revocation cannot be vetoed by another consumer, but errors stay visible.
    if (errors.length)
      throw new AggregateError(errors, "Window owner loss failed");
  };

  subscribe(notify: () => void): () => void {
    if (this.#lost) {
      notify();
      return () => {};
    }
    const subscription: Subscription = { active: true, notify };
    this.#subscriptions.add(subscription);
    if (!this.#listening) {
      this.#listening = true;
      this.window.on("closed", this.#lose);
      this.#contents.on("destroyed", this.#lose);
      this.#contents.on("render-process-gone", this.#lose);
    }
    return () => {
      if (!subscription.active) return;
      subscription.active = false;
      this.#subscriptions.delete(subscription);
      if (this.#subscriptions.size === 0) this.#detach();
    };
  }
}

const owners = new WeakMap<OwnerWindow, OwnerLoss>();

/** One native loss triple per window. Loss is synchronous, ordered and final.
 * Navigation remains caller-owned. Finish initialization before subscribing:
 * an already-lost owner immediately notifies a late subscriber. */
export function subscribeWindowOwnerLoss(
  window: OwnerWindow,
  onLost: () => void,
): () => void {
  let owner = owners.get(window);
  if (!owner) {
    owner = new OwnerLoss(window);
    owners.set(window, owner);
  }
  return owner.subscribe(onLost);
}
