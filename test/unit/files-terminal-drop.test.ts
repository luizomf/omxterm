// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { claimFilesTerminalDrop } from "../../src/renderer/files-terminal-drop";
import { createFilesTerminalDragBridge } from "../../src/preload/files-terminal-drag-bridge";
import {
  FILES_ENTRY_DRAG_TYPE,
  FILES_TERMINAL_DRAG_TYPE,
  filesTerminalDragIpc,
} from "../../src/shared/files-terminal-drag";
const ticket = "12345678-1234-1234-1234-123456789abc";
function drop(
  types = [FILES_ENTRY_DRAG_TYPE, FILES_TERMINAL_DRAG_TYPE],
  files: File[] = [],
) {
  const event = new Event("drop", { cancelable: true }) as DragEvent;
  Object.defineProperty(event, "dataTransfer", {
    value: {
      types,
      files,
      getData: (type: string) =>
        type === FILES_TERMINAL_DRAG_TYPE ? ticket : "1",
    },
  });
  return event;
}
it("captures and synchronously claims before any handoff work; preserves the captured revision", async () => {
  const order: string[] = [];
  const ipc = {
    sendSync: vi.fn(() => {
      order.push("claim");
      return true;
    }),
    invoke: vi.fn(async () => {
      order.push("handoff");
      return { status: "accepted" };
    }),
  };
  const target = { revision: 7, completed: vi.fn() };
  const capture = vi.fn(() => {
    order.push("capture");
    return target;
  });
  const event = drop();
  expect(
    claimFilesTerminalDrop(event, createFilesTerminalDragBridge(ipc), capture),
  ).toBe(true);
  expect(order).toEqual(["capture", "claim"]);
  expect(event.defaultPrevented).toBe(true);
  // Model child dragend and mutable caller state before async redemption.
  target.revision = 8;
  order.push("dragend");
  await vi.waitFor(() =>
    expect(target.completed).toHaveBeenCalledWith({ status: "accepted" }),
  );
  expect(order).toEqual(["capture", "claim", "dragend", "handoff"]);
  expect(ipc.sendSync).toHaveBeenCalledExactlyOnceWith(
    filesTerminalDragIpc.claim,
    { ticket, entryToken: "1" },
  );
  expect(ipc.invoke).toHaveBeenCalledExactlyOnceWith(
    filesTerminalDragIpc.handoff,
    ticket,
    7,
  );
});
it.each([
  "text/plain",
  "text/uri-list",
  "Files",
  "application/x-omxterm-tab",
  "unknown",
])(
  "refuses mixed %s without claim, path decoding or target capture",
  (type) => {
    const bridge = { claim: vi.fn(() => true), handoff: vi.fn() };
    const capture = vi.fn();
    expect(
      claimFilesTerminalDrop(
        drop([FILES_ENTRY_DRAG_TYPE, FILES_TERMINAL_DRAG_TYPE, type]),
        bridge,
        capture,
      ),
    ).toBe(false);
    expect(capture).not.toHaveBeenCalled();
    expect(bridge.claim).not.toHaveBeenCalled();
  },
);
it("refuses native files and absent candidates or ineligible target before any handoff", () => {
  const bridge = { claim: vi.fn(() => true), handoff: vi.fn() };
  const capture = vi.fn();
  expect(
    claimFilesTerminalDrop(
      drop(undefined, [new File([], "synthetic")]),
      bridge,
      capture,
    ),
  ).toBe(false);
  expect(
    claimFilesTerminalDrop(drop([FILES_ENTRY_DRAG_TYPE]), bridge, capture),
  ).toBe(false);
  expect(capture).not.toHaveBeenCalled();
  expect(claimFilesTerminalDrop(drop(), bridge, capture)).toBe(false);
  expect(bridge.claim).not.toHaveBeenCalled();
});
it("hands every claim off so main settles it, without re-capturing a replacement", async () => {
  const target = { revision: 1, completed: vi.fn() };
  const capture = vi.fn(() => target);
  const bridge = {
    claim: vi.fn(() => true),
    handoff: vi.fn(async () => ({
      status: "refused" as const,
      reason: "terminal-unavailable",
    })),
  };
  expect(claimFilesTerminalDrop(drop(), bridge, capture)).toBe(true);
  await vi.waitFor(() =>
    expect(target.completed).toHaveBeenCalledWith({
      status: "refused",
      reason: "terminal-unavailable",
    }),
  );
  expect(bridge.handoff).toHaveBeenCalledExactlyOnceWith(ticket, 1);
  expect(capture).toHaveBeenCalledOnce();
});
it("fails closed on forged claims and bounds bridge outputs without native text leakage", async () => {
  const ipc = {
    sendSync: vi.fn(() => "true"),
    invoke: vi.fn(async () => ({ status: "accepted", path: "/private" })),
  };
  const bridge = createFilesTerminalDragBridge(ipc);
  expect(bridge.claim({ ticket: "/not-a-ticket", entryToken: "1" })).toBe(
    false,
  );
  expect(ipc.sendSync).not.toHaveBeenCalled();
  expect(bridge.claim({ ticket, entryToken: "1" })).toBe(false);
  expect(await bridge.handoff(ticket, -1)).toEqual({ status: "refused" });
  expect(ipc.invoke).not.toHaveBeenCalled();
  expect(await bridge.handoff(ticket, 1)).toEqual({ status: "unknown" });
});
