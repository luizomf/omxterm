import { EventEmitter } from "node:events";
import type { BrowserWindow } from "electron";
import { afterEach, expect, it, vi } from "vitest";
import {
  createFilesTerminalDrag,
  FILES_DRAG_LIFETIME_MS,
} from "../../src/main/files-terminal-drag";
import type { FilesDragResult } from "../../src/shared/files-terminal-drag";
const entry = {
  path:
    process.platform === "win32"
      ? "C:\\synthetic\\a 'quoted' file"
      : "/synthetic/a 'quoted' file",
  kind: "file",
  entryToken: "1",
};
function fixture() {
  const window = Object.assign(new EventEmitter(), {
    webContents: { isDestroyed: () => false },
    isDestroyed: () => false,
    isVisible: vi.fn(() => true),
    isMinimized: vi.fn(() => false),
    isFocused: vi.fn(() => true),
  });
  const transport = createFilesTerminalDrag(window as unknown as BrowserWindow);
  const context = { id: "view-a", isCurrentVisible: vi.fn(() => true) };
  const abort = new AbortController();
  const consume = vi.fn(async (): Promise<FilesDragResult> => ({
    status: "accepted",
  }));
  const report = vi.fn();
  const start = (value: unknown = entry) =>
    transport.start(value, context, abort.signal, consume, report);
  const claim = (ticket: unknown) =>
    transport.claim({ ticket, entryToken: "1" });
  return { transport, window, context, abort, consume, start, claim, report };
}
afterEach(() => vi.useRealTimers());
it("reports bounded local refusal and completion only to the still-visible source", async () => {
  const f = fixture();
  expect(f.start({ ...entry, path: "/synthetic/line\nbreak" })).toBeNull();
  expect(f.report).toHaveBeenCalledExactlyOnceWith({
    status: "refused",
    reason: "unsafe-path",
  });
  f.report.mockClear();
  const ticket = f.start();
  f.claim(ticket);
  f.transport.end("view-a", ticket);
  await f.transport.handoff(ticket, 7);
  expect(f.report).toHaveBeenCalledExactlyOnceWith({ status: "accepted" });
  f.report.mockClear();
  const other = f.start();
  f.claim(other);
  f.context.isCurrentVisible.mockReturnValue(false);
  await f.transport.handoff(other, 7);
  expect(f.report).not.toHaveBeenCalled();
});

it("claims the exact gesture once before dragend, then hands its literal capture off once", async () => {
  const f = fixture();
  const ticket = f.start();
  expect(ticket).toMatch(/^[0-9a-f-]{36}$/);
  expect(ticket).not.toContain(entry.path);
  expect(await f.transport.handoff(ticket, 3)).toEqual({ status: "refused" });
  expect(f.transport.claim({ ticket, entryToken: "2" })).toBe(false);
  expect(f.claim(ticket)).toBe(true);
  expect(f.claim(ticket)).toBe(false);
  f.transport.end("view-a", ticket);
  expect(await f.transport.handoff(ticket, 3)).toEqual({ status: "accepted" });
  expect(f.consume).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({ entry, revision: 3 }),
  );
  expect(await f.transport.handoff(ticket, 3)).toEqual({ status: "refused" });
});
it("revokes unclaimed dragend only for the exact source/ticket and replaces abandoned gestures", () => {
  const f = fixture();
  const old = f.start();
  const fresh = f.start();
  expect(f.claim(old)).toBe(false);
  f.transport.end("foreign", fresh);
  f.transport.end("view-a", old);
  f.transport.end("view-a", fresh);
  expect(f.claim(fresh)).toBe(false);
  expect(f.consume).not.toHaveBeenCalled();
});
it.each(["visibility", "minimized", "window", "abort", "revoke", "timeout"])(
  "refuses a claimed %s loss without hide/reveal revival",
  async (loss) => {
    vi.useFakeTimers();
    const f = fixture();
    const ticket = f.start();
    expect(f.claim(ticket)).toBe(true);
    if (loss === "visibility")
      f.context.isCurrentVisible.mockReturnValue(false);
    if (loss === "minimized") f.window.isMinimized.mockReturnValue(true);
    if (loss === "window") f.window.isFocused.mockReturnValue(false);
    if (loss === "abort") f.abort.abort();
    if (loss === "revoke") f.transport.revoke("view-a");
    if (loss === "timeout") vi.advanceTimersByTime(FILES_DRAG_LIFETIME_MS);
    expect(await f.transport.handoff(ticket, 0)).toEqual({ status: "refused" });
    f.context.isCurrentVisible.mockReturnValue(true);
    f.window.isMinimized.mockReturnValue(false);
    f.window.isFocused.mockReturnValue(true);
    expect(f.claim(ticket)).toBe(false);
    expect(f.consume).not.toHaveBeenCalled();
  },
);
it("keeps revocation effective during asynchronous protected admission", async () => {
  const f = fixture();
  let finish!: (value: FilesDragResult) => void;
  f.consume.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const ticket = f.start();
  f.claim(ticket);
  const result = f.transport.handoff(ticket, 2);
  const input = f.consume.mock.calls[0] as unknown as [
    { signal: AbortSignal; source: { isCurrentVisible(): boolean } },
  ];
  expect(input[0].source.isCurrentVisible()).toBe(true);
  f.transport.revoke();
  expect(input[0].signal.aborted).toBe(true);
  expect(input[0].source.isCurrentVisible()).toBe(false);
  finish({ status: "refused" });
  expect(await result).toEqual({ status: "unknown" });
});
it("bounds a nonsettling consumer by the gesture deadline without retrying it", async () => {
  vi.useFakeTimers();
  const f = fixture();
  f.consume.mockImplementation(() => new Promise(() => {}));
  const ticket = f.start();
  f.claim(ticket);
  const pending = f.transport.handoff(ticket, 1);
  vi.advanceTimersByTime(FILES_DRAG_LIFETIME_MS);
  expect(await pending).toEqual({ status: "unknown" });
  expect(f.consume).toHaveBeenCalledOnce();
  expect(await f.transport.handoff(ticket, 1)).toEqual({ status: "refused" });
});
it.each([
  null,
  {},
  { ...entry, extra: true },
  { ...entry, path: "relative" },
  { ...entry, path: "/bad\nname" },
  { ...entry, path: "/bad\u001b[201~" },
  { ...entry, path: "/bad\u009b201~" },
  { ...entry, path: "/" + "a".repeat(32768) },
  { ...entry, kind: "device" },
  { ...entry, entryToken: "x" },
])("refuses malformed/unsafe source %#", (value) => {
  const f = fixture();
  expect(f.start(value)).toBeNull();
});
it("consumes malformed redemption and distinguishes unknown consumer outcome without retry", async () => {
  const f = fixture();
  const ticket = f.start();
  f.claim(ticket);
  expect(await f.transport.handoff(ticket, -1)).toEqual({ status: "refused" });
  expect(await f.transport.handoff(ticket, 1)).toEqual({ status: "refused" });
  const second = f.start();
  f.claim(second);
  f.consume.mockRejectedValue(new Error("private text"));
  expect(await f.transport.handoff(second, 1)).toEqual({ status: "unknown" });
  expect(await f.transport.handoff(second, 1)).toEqual({ status: "refused" });
  expect(f.consume).toHaveBeenCalledOnce();
});
