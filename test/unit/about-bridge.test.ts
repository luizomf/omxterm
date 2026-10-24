import { EventEmitter } from "node:events";
import { expect, it, vi } from "vitest";
import { createAboutBridge } from "../../src/preload/about-bridge";
import { aboutIpc } from "../../src/shared/about";

it("validates metadata and links and retains only one early open until subscription", async () => {
  const events = new EventEmitter();
  const invoke = vi.fn(async () => ({
    name: "OMXTerm",
    version: "1.2.3",
    copyright: "MIT",
  }));
  const bridge = createAboutBridge({
    on: events.on.bind(events),
    removeListener: events.removeListener.bind(events),
    invoke,
  });
  events.emit(aboutIpc.open, {}, "invalid");
  events.emit(aboutIpc.open, {});
  events.emit(aboutIpc.open, {});
  const opened = vi.fn();
  const remove = bridge.onOpen(opened);
  expect(opened).toHaveBeenCalledOnce();
  expect(await bridge.info()).toMatchObject({ version: "1.2.3" });
  await bridge.openLink("contributors");
  expect(invoke).toHaveBeenLastCalledWith(aboutIpc.openLink, "contributors");
  // @ts-expect-error exercise untyped renderer request
  await expect(bridge.openLink("https://example.org")).rejects.toThrow();
  invoke.mockResolvedValueOnce({
    name: "OMXTerm",
    version: "",
    copyright: "MIT",
  });
  await expect(bridge.info()).rejects.toThrow("Invalid About response");
  remove();
  events.emit(aboutIpc.open, {});
  expect(opened).toHaveBeenCalledOnce();
  expect(events.listenerCount(aboutIpc.open)).toBe(0);
});
