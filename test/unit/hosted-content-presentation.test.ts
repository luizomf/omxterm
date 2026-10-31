// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import type { HostedContentBridge } from "../../src/shared/extension-view";
import { createHostedContentPresentation } from "../../src/renderer/hosted-content-presentation";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
const settle = async () => {
  await Promise.resolve();
  await Promise.resolve();
};
const owners: ReturnType<typeof createHostedContentPresentation>[] = [];
afterEach(() => {
  for (const owner of owners.splice(0)) owner.dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});
function fixture() {
  const parent = document.createElement("main");
  document.body.append(parent);
  let failure!: () => void;
  let retired!: (id: string) => void;
  const unsubscribe = vi.fn();
  const bridge = {
    present: vi.fn<HostedContentBridge["present"]>(async () => true),
    close: vi.fn<HostedContentBridge["close"]>(async () => {}),
    onRetired(listener: (id: string) => void) {
      retired = listener;
      return vi.fn();
    },
    onFailure(listener: () => void) {
      failure = listener;
      return unsubscribe;
    },
  };
  const owner = createHostedContentPresentation(parent, bridge);
  owners.push(owner);
  const slot = (id: string) => {
    const element = document.createElement("div");
    parent.append(element);
    return { id, slot: element, removed: false };
  };
  return {
    owner,
    bridge,
    slot,
    unsubscribe,
    fail: () => failure(),
    retire: (id: string) => retired(id),
  };
}

it("retains logical activity through overlay hiding and distinguishes restored focus from search focus", async () => {
  const h = fixture();
  const target = h.slot("panel");
  h.owner.select(target, () => {}, target);
  await settle();
  expect(h.bridge.present.mock.lastCall?.[0]).toMatchObject({
    id: "panel",
    activeId: "panel",
    focus: true,
  });
  h.owner.openOverlay(() => h.owner.setBlocked(true));
  await settle();
  expect(h.bridge.present.mock.lastCall?.[0]).toMatchObject({
    id: null,
    activeId: "panel",
    focus: false,
  });
  h.owner.setBlocked(false);
  h.owner.restoreFocus();
  await settle();
  expect(h.bridge.present.mock.lastCall?.[0]).toMatchObject({
    id: "panel",
    activeId: "panel",
    focus: "restore",
  });
  h.owner.focus();
  await settle();
  expect(h.bridge.present.mock.lastCall?.[0].focus).toBe(true);
  h.owner.select(undefined, () => {}, {});
  await settle();
  expect(h.bridge.present.mock.lastCall?.[0]).toMatchObject({
    id: null,
    activeId: null,
  });
  h.owner.dispose();
  expect(h.bridge.present.mock.lastCall?.[0]).toMatchObject({
    id: null,
    activeId: null,
  });
});

it("orders tab-independent slots and DOM activation through one revision stream", async () => {
  const h = fixture();
  const first = h.slot("first");
  const second = h.slot("second");
  const activate = vi.fn();
  h.owner.select(first, activate, first);
  await settle();
  expect(activate).toHaveBeenCalledOnce();
  const hide = deferred<boolean>();
  h.bridge.present.mockImplementationOnce(() => hide.promise);
  const stale = vi.fn();
  h.owner.select(undefined, stale, {});
  expect(stale).not.toHaveBeenCalled();
  h.owner.select(second, activate, second);
  await settle();
  hide.resolve(true);
  await settle();
  expect(stale).not.toHaveBeenCalled();
  expect(h.bridge.present.mock.lastCall?.[0]).toMatchObject({
    id: "second",
    focus: true,
  });
  const revisions = h.bridge.present.mock.calls.map(
    ([request]) => request.revision,
  );
  expect(revisions).toEqual([1, 2, 3, 4]);
});

it("refreshes position-only moves without observer notification or focus intent", async () => {
  let frame!: FrameRequestCallback;
  const request = vi
    .spyOn(window, "requestAnimationFrame")
    .mockImplementation((callback) => {
      frame = callback;
      return 1;
    });
  const h = fixture();
  const target = h.slot("panel");
  let x = 700;
  vi.spyOn(target.slot, "getBoundingClientRect").mockImplementation(
    () => ({ x, y: 80, width: 280, height: 500 }) as DOMRect,
  );
  h.owner.select(target, () => {}, target);
  await settle();
  x = 12;
  h.owner.layout();
  h.owner.layout();
  expect(request).toHaveBeenCalledOnce();
  frame(0);
  await settle();
  expect(h.bridge.present.mock.lastCall?.[0]).toMatchObject({
    id: "panel",
    activeId: "panel",
    focus: false,
    bounds: { x: 12, y: 80, width: 280, height: 500 },
  });
});

it("flushes an x-only refresh after a retained selection acknowledgement", async () => {
  const frames: FrameRequestCallback[] = [];
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frames.push(callback);
    return frames.length;
  });
  const h = fixture();
  const target = h.slot("panel");
  let x = 700;
  vi.spyOn(target.slot, "getBoundingClientRect").mockImplementation(
    () => ({ x, y: 80, width: 280, height: 500 }) as DOMRect,
  );
  h.owner.select(target, () => {}, target);
  await settle();
  const ack = deferred<boolean>();
  h.bridge.present.mockImplementationOnce(() => ack.promise);
  h.owner.select(target, () => {}, target, "core");
  x = 12;
  h.owner.layout();
  frames.shift()!(0);
  expect(h.bridge.present).toHaveBeenCalledTimes(2);
  ack.resolve(true);
  await settle();
  expect(frames).toHaveLength(1);
  frames.shift()!(0);
  await settle();
  expect(h.bridge.present).toHaveBeenCalledTimes(3);
  expect(h.bridge.present.mock.lastCall?.[0]).toMatchObject({
    id: "panel",
    activeId: "panel",
    focus: false,
    bounds: { x: 12, y: 80, width: 280, height: 500 },
  });
});

it.each([
  "blocked",
  "overlay",
  "retired",
  "disposed",
  "failed",
  "transition",
] as const)("does not reshow a position refresh while %s", async (state) => {
  let frame!: FrameRequestCallback;
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    frame = callback;
    return 1;
  });
  const h = fixture();
  const target = h.slot("panel");
  h.owner.select(target, () => {}, target);
  await settle();
  h.owner.layout();
  if (state === "blocked") h.owner.setBlocked(true);
  if (state === "overlay") {
    h.bridge.present.mockImplementationOnce(() => deferred<boolean>().promise);
    h.owner.openOverlay(() => {});
  }
  if (state === "retired") target.removed = true;
  if (state === "disposed") h.owner.dispose();
  if (state === "failed") h.fail();
  if (state === "transition") {
    h.bridge.present.mockImplementationOnce(() => deferred<boolean>().promise);
    h.owner.select(h.slot("replacement"), () => {}, {});
  }
  const calls = h.bridge.present.mock.calls.length;
  frame(0);
  await settle();
  expect(h.bridge.present).toHaveBeenCalledTimes(calls);
});

it("observes the selected allocation and coalesces geometry without stealing focus", async () => {
  const observe = vi.fn();
  const unobserve = vi.fn();
  const disconnect = vi.fn();
  let resize!: () => void;
  vi.stubGlobal(
    "ResizeObserver",
    class {
      constructor(callback: () => void) {
        resize = callback;
      }
      observe = observe;
      unobserve = unobserve;
      disconnect = disconnect;
    },
  );
  let frame!: FrameRequestCallback;
  const requestFrame = vi
    .spyOn(window, "requestAnimationFrame")
    .mockImplementation((callback) => {
      frame = callback;
      return 1;
    });
  const h = fixture();
  const target = h.slot("panel");
  vi.spyOn(target.slot, "getBoundingClientRect").mockReturnValue({
    x: 4,
    y: 80,
    width: 280,
    height: 500,
  } as DOMRect);
  h.owner.select(target, () => {}, target);
  await settle();
  expect(observe).toHaveBeenCalledWith(target.slot);
  resize();
  window.dispatchEvent(new Event("resize"));
  expect(requestFrame).toHaveBeenCalledOnce();
  frame(0);
  await settle();
  expect(h.bridge.present.mock.lastCall?.[0]).toMatchObject({
    id: "panel",
    activeId: "panel",
    focus: false,
    bounds: { x: 4, y: 80, width: 280, height: 500 },
  });
  h.owner.select(undefined, () => {}, {});
  await settle();
  expect(unobserve).toHaveBeenCalledWith(target.slot);
  h.owner.dispose();
  expect(disconnect).toHaveBeenCalledOnce();
});

it("awaits native hide for overlays and does not restore a replacement selection", async () => {
  const h = fixture();
  const first = h.slot("first");
  const second = h.slot("second");
  h.owner.select(first, () => {}, first);
  await settle();
  const hide = deferred<boolean>();
  h.bridge.present.mockImplementationOnce(() => hide.promise);
  const open = vi.fn(() => h.owner.setBlocked(true));
  h.owner.openOverlay(open);
  h.owner.focus();
  expect(open).not.toHaveBeenCalled();
  hide.resolve(true);
  await settle();
  expect(open).toHaveBeenCalledOnce();
  h.owner.select(second, () => {}, second);
  h.owner.setBlocked(false);
  h.owner.focus();
  await settle();
  expect(
    h.bridge.present.mock.calls.some(([request]) => request.id === "second"),
  ).toBe(false);
  h.owner.select(second, () => {}, second);
  await settle();
  expect(h.bridge.present.mock.lastCall?.[0].id).toBe("second");
});

it("ignores an overlay hide continuation after its selection changes", async () => {
  const h = fixture();
  const target = h.slot("panel");
  h.owner.select(target, () => {}, target);
  await settle();
  const hide = deferred<boolean>();
  h.bridge.present.mockImplementationOnce(() => hide.promise);
  const open = vi.fn();
  const refused = vi.fn();
  h.owner.openOverlay(open, refused);
  h.owner.select(undefined, () => {}, {});
  await settle();
  hide.resolve(true);
  await settle();
  expect(open).not.toHaveBeenCalled();
  expect(refused).toHaveBeenCalledOnce();
});

it.each(["refused", "rejected", "notification"] as const)(
  "fails closed after %s native hiding",
  async (outcome) => {
    const h = fixture();
    const target = h.slot("panel");
    h.owner.select(target, () => {}, target);
    await settle();
    const open = vi.fn();
    if (outcome === "notification") h.fail();
    else {
      h.bridge.present.mockImplementationOnce(async () => {
        if (outcome === "rejected") throw new Error("synthetic");
        return false;
      });
      h.owner.openOverlay(open);
      await settle();
      expect(open).not.toHaveBeenCalled();
    }
    const count = h.bridge.present.mock.calls.length;
    h.owner.focus();
    expect(h.bridge.present).toHaveBeenCalledTimes(count);
    expect(document.querySelector('[role="status"]')?.textContent).toContain(
      "could not",
    );
  },
);

it.each(["before", "after"] as const)(
  "reconciles rejected geometry only after exact retirement and a hide ACK (%s rejection settlement)",
  async (notification) => {
    const h = fixture();
    const target = h.slot("old");
    h.owner.select(target, () => {}, target);
    await settle();
    let reject!: (error: Error) => void;
    h.bridge.present.mockImplementationOnce(
      () =>
        new Promise<boolean>((_resolve, no) => {
          reject = no;
        }),
    );
    h.owner.focus();
    if (notification === "before") h.retire(target.id);
    reject(new Error("Unknown hosted content"));
    await settle();
    const refused = vi.fn();
    h.owner.openOverlay(vi.fn(), refused);
    expect(refused).toHaveBeenCalledOnce();
    h.retire("unrelated");
    const hidden = deferred<boolean>();
    h.bridge.present.mockImplementationOnce(() => hidden.promise);
    h.owner.select(undefined, () => {}, {});
    await settle();
    expect(document.querySelector('[role="status"]')?.textContent).toContain(
      "could not",
    );
    hidden.resolve(true);
    await settle();
    // A successful hide without the matching receipt cannot clear failure.
    if (notification === "after") {
      expect(document.querySelector('[role="status"]')?.textContent).toContain(
        "could not",
      );
      h.retire(target.id);
    }
    expect(document.querySelector('[role="status"]')?.textContent).toBe("");
    const next = h.slot("next");
    h.owner.select(next, () => {}, next);
    await settle();
    expect(h.bridge.present.mock.lastCall?.[0].id).toBe("next");
    const open = vi.fn();
    h.owner.openOverlay(open);
    await settle();
    expect(open).toHaveBeenCalledOnce();
  },
);

it("does not let a scoped rejection overwrite an epoch failure or another rejected identity", async () => {
  const h = fixture();
  const first = h.slot("first");
  const second = h.slot("second");
  h.owner.select(first, () => {}, first);
  await settle();
  h.bridge.present.mockRejectedValueOnce(new Error("first unavailable"));
  h.owner.focus();
  await settle();
  h.bridge.present.mockRejectedValueOnce(new Error("second unavailable"));
  h.owner.select(second, () => {}, second);
  await settle();
  h.retire(second.id);
  h.owner.select(undefined, () => {}, {});
  await settle();
  expect(document.querySelector('[role="status"]')?.textContent).toContain(
    "could not",
  );
  h.fail();
  h.retire(first.id);
  h.owner.select(undefined, () => {}, {});
  await settle();
  expect(document.querySelector('[role="status"]')?.textContent).toContain(
    "could not",
  );
});

it.each([
  "false-hide",
  "epoch-failure",
  "close-failure",
  "identity-free-rejection",
] as const)(
  "does not reconcile %s after retirement and a later hide ACK",
  async (failure) => {
    const h = fixture();
    const target = h.slot("old");
    h.owner.select(target, () => {}, target);
    await settle();
    if (failure === "close-failure") {
      h.bridge.close.mockRejectedValueOnce(new Error("unknown close outcome"));
      h.owner.close(target.id, vi.fn());
    } else if (failure === "epoch-failure") h.fail();
    else {
      h.bridge.present.mockImplementationOnce(async () => {
        if (failure === "identity-free-rejection")
          throw new Error("transport lost");
        return false;
      });
      if (failure === "false-hide") h.owner.openOverlay(vi.fn());
      else h.owner.select(undefined, () => {}, {});
    }
    await settle();
    h.retire(target.id);
    h.owner.select(undefined, () => {}, {});
    await settle();
    const open = vi.fn();
    h.owner.openOverlay(open);
    expect(open).not.toHaveBeenCalled();
    expect(document.querySelector('[role="status"]')?.textContent).toContain(
      "could not",
    );
  },
);

it.each([true, "focus-unavailable", false] as const)(
  "returns native focus through the shared presenter only after successful acknowledgement (%s)",
  async (result) => {
    const h = fixture();
    const target = h.slot("panel");
    h.owner.select(target, () => {}, target);
    await settle();
    const pending = deferred<boolean | "focus-unavailable">();
    h.bridge.present.mockImplementationOnce(() => pending.promise);
    const activate = vi.fn();
    h.owner.focusCore(activate);
    expect(activate).not.toHaveBeenCalled();
    expect(h.bridge.present.mock.lastCall?.[0]).toMatchObject({
      id: "panel",
      focus: "core",
    });
    pending.resolve(result);
    await settle();
    expect(activate).toHaveBeenCalledTimes(result === true ? 1 : 0);
  },
);

it("settles refused overlays and discards core focus after selection replacement", async () => {
  const h = fixture();
  const target = h.slot("panel");
  h.owner.select(target, () => {}, target);
  await settle();
  const pending = deferred<boolean>();
  h.bridge.present.mockImplementationOnce(() => pending.promise);
  const activate = vi.fn();
  h.owner.focusCore(activate);
  h.owner.select(undefined, () => {}, {});
  pending.resolve(true);
  await settle();
  expect(activate).not.toHaveBeenCalled();
  h.fail();
  const open = vi.fn();
  const refused = vi.fn();
  h.owner.openOverlay(open, refused);
  expect(open).not.toHaveBeenCalled();
  expect(refused).toHaveBeenCalledOnce();
});

it("retires once and suppresses late selection, close and overlay callbacks", async () => {
  const h = fixture();
  const target = h.slot("panel");
  h.owner.select(target, () => {}, target);
  await settle();
  const hide = deferred<boolean>();
  h.bridge.present.mockImplementationOnce(() => hide.promise);
  const activate = vi.fn();
  h.owner.select(undefined, activate, {});
  const closed = deferred<void>();
  h.bridge.close.mockImplementationOnce(() => closed.promise);
  const remove = vi.fn();
  h.owner.close(target.id, remove);
  h.owner.dispose();
  h.owner.dispose();
  hide.resolve(true);
  closed.resolve();
  await settle();
  const count = h.bridge.present.mock.calls.length;
  h.owner.select(target, activate, target);
  h.owner.openOverlay(activate);
  h.owner.setBlocked(true);
  h.owner.focus();
  expect(activate).not.toHaveBeenCalled();
  expect(remove).not.toHaveBeenCalled();
  expect(h.unsubscribe).toHaveBeenCalledOnce();
  expect(h.bridge.present).toHaveBeenCalledTimes(count);
  expect(h.bridge.present.mock.lastCall?.[0].id).toBeNull();
  expect(document.querySelector('[role="status"]')).toBeNull();
});
