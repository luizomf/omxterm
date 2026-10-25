import type { TerminalClipboardAction } from "../../src/shared/terminal-contract";

export type OverlayAction =
  | {
      readonly channel: "clipboard";
      readonly ordinal: number;
      readonly kind: TerminalClipboardAction;
    }
  | {
      readonly channel: "toggle";
      readonly ordinal: number;
      readonly kind: "toggle";
    };
export interface OverlayConsumptionSnapshot {
  readonly owner: string;
  readonly state: "pending" | "active" | "disposed" | "failed";
  readonly receipts: readonly OverlayAction[];
}
const limit = 128;

// Decorate the subscriptions passed to the real mounted host, not a second
// listener observing preload delivery. Completion means normal callback return,
// never an ignored-action verdict or settlement of accepted asynchronous input.
export function createOverlayActionConsumption(owner: string) {
  const receipts: OverlayAction[] = [];
  const ordinals = { clipboard: 0, toggle: 0 };
  const subscribed = new Set<string>();
  let disposed = false;
  let failed = false;
  function decorate<Args extends unknown[]>(
    channel: OverlayAction["channel"],
    subscribe: (listener: (...args: Args) => void) => () => void,
    kind: (...args: Args) => OverlayAction["kind"],
  ) {
    return (listener: (...args: Args) => void) => {
      if (disposed || subscribed.has(channel))
        throw new Error("Overlay subscription lifetime changed");
      subscribed.add(channel);
      let active = true;
      let remove: () => void;
      try {
        remove = subscribe((...args) => {
          if (!active) return;
          const ordinal = ++ordinals[channel];
          try {
            listener(...args);
          } catch (error) {
            failed = true;
            throw error;
          }
          if (!active) return;
          if (receipts.length >= limit) {
            failed = true;
            throw new Error("Overlay consumption capacity exceeded");
          }
          receipts.push({
            channel,
            ordinal,
            kind: kind(...args),
          } as OverlayAction);
        });
      } catch (error) {
        failed = true;
        throw error;
      }
      return () => {
        if (!active) return;
        active = false;
        disposed = true;
        remove();
      };
    };
  }
  return {
    clipboard: (
      subscribe: (
        listener: (action: TerminalClipboardAction) => void,
      ) => () => void,
    ) =>
      decorate<[TerminalClipboardAction]>(
        "clipboard",
        subscribe,
        (action) => action,
      ),
    toggle: (subscribe: (listener: () => void) => () => void) =>
      decorate<[]>("toggle", subscribe, () => "toggle"),
    snapshot(): OverlayConsumptionSnapshot {
      return {
        owner,
        state: failed
          ? "failed"
          : disposed
            ? "disposed"
            : subscribed.size === 2
              ? "active"
              : "pending",
        receipts: receipts.map((receipt) => ({ ...receipt })),
      };
    },
  };
}

export function overlayActionsConsumed(
  snapshot: OverlayConsumptionSnapshot,
  owner: string,
  expected: readonly OverlayAction[],
): boolean {
  if (!expected.length) throw new Error("No overlay action expected");
  if (snapshot.owner !== owner)
    throw new Error("Overlay receipt window changed");
  if (snapshot.state === "disposed" || snapshot.state === "failed")
    throw new Error(`Overlay consumption ${snapshot.state}`);
  if (snapshot.receipts.length > limit)
    throw new Error("Overlay receipt capacity exceeded");
  const last = { clipboard: 0, toggle: 0 };
  for (const receipt of snapshot.receipts) {
    if (
      !(receipt.channel in last) ||
      receipt.ordinal !== last[receipt.channel] + 1 ||
      (receipt.channel === "toggle"
        ? receipt.kind !== "toggle"
        : !["copy", "paste", "select-all"].includes(receipt.kind))
    )
      throw new Error("Invalid or duplicate overlay receipt");
    last[receipt.channel] = receipt.ordinal;
  }
  if (snapshot.state !== "active") return false;
  return expected.every((action) => {
    if (!Number.isSafeInteger(action.ordinal) || action.ordinal <= 0)
      throw new Error("Invalid expected overlay ordinal");
    const receipt = snapshot.receipts.find(
      (item) =>
        item.channel === action.channel && item.ordinal === action.ordinal,
    );
    if (!receipt) return false;
    if (receipt.kind !== action.kind)
      throw new Error("Overlay receipt action changed");
    return true;
  });
}
