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
  const unsubscribe = vi.fn();
  const bridge = {
    present: vi.fn<HostedContentBridge["present"]>(async () => true),
    close: vi.fn<HostedContentBridge["close"]>(async () => {}),
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
  return { owner, bridge, slot, unsubscribe, fail: () => failure() };
}

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
  h.owner.openOverlay(open);
  h.owner.select(undefined, () => {}, {});
  await settle();
  hide.resolve(true);
  await settle();
  expect(open).not.toHaveBeenCalled();
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
