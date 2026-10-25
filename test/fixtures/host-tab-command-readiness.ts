import type { TerminalBridge } from "../../src/shared/terminal-bridge";

// Fixture-only observation of the actual host callback registration. An arrival
// observer uses the original bridge, never this one-shot host subscription.
export function observeHostTabCommands(
  subscribe: TerminalBridge["onTabCommand"],
) {
  let active = false;
  let retired = false;
  let resolve!: () => void;
  let reject!: (error: unknown) => void;
  const registered = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  // Retirement may precede a waiter; keep the original rejection observable.
  void registered.catch(() => {});
  const closed = () =>
    new Error("Fixture host tab-command subscription is unavailable");
  const dispose = () => {
    retired = true;
    active = false;
    reject(closed());
  };
  return {
    get ready() {
      return active && !retired;
    },
    wait() {
      return registered.then(() => {
        if (!active || retired) throw closed();
      });
    },
    subscribe(listener: Parameters<TerminalBridge["onTabCommand"]>[0]) {
      if (active || retired) throw closed();
      let remove: () => void;
      try {
        remove = subscribe(listener);
      } catch (error) {
        retired = true;
        reject(error);
        throw error;
      }
      if (retired) {
        remove();
        throw closed();
      }
      active = true;
      resolve();
      let removed = false;
      return () => {
        if (removed) return;
        removed = true;
        dispose();
        remove();
      };
    },
    dispose,
  };
}
