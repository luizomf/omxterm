import { readFile } from "node:fs/promises";
import { runInNewContext } from "node:vm";
import { expect, it, vi } from "vitest";
const ticket = "12345678-1234-1234-1234-123456789abc";
it("uses the actual main-frame child preload for bounded synchronous registration and retained-token end", async () => {
  const source = await readFile(
    new URL("../../src/preload/extension-view.cjs", import.meta.url),
    "utf8",
  );
  const handlers = new Map<string, (event: unknown, value: unknown) => void>();
  const ipc = {
    on: (name: string, handler: (event: unknown, value: unknown) => void) =>
      handlers.set(name, handler),
    sendSync: vi.fn(() => ticket),
    send: vi.fn(),
  };
  const exposeInMainWorld = vi.fn();
  const execute = (isMainFrame: boolean) => {
    runInNewContext(source, {
      process: { isMainFrame },
      require: () => ({
        contextBridge: { exposeInMainWorld },
        ipcRenderer: ipc,
      }),
    });
  };
  execute(false);
  expect(exposeInMainWorld).not.toHaveBeenCalled();
  execute(true);
  const bridge = exposeInMainWorld.mock.calls[0]![1] as {
    beginFilesTerminalDrag(value: unknown): string | null;
    endFilesTerminalDrag(value: unknown): void;
  };
  const entry = { path: "/synthetic", kind: "file", entryToken: "1" };
  expect(bridge.beginFilesTerminalDrag(entry)).toBeNull();
  expect(ipc.sendSync).not.toHaveBeenCalled();
  handlers.get("extension-view:visibility")!({}, true);
  for (const value of [
    null,
    { ...entry, path: "a".repeat(32769) },
    { ...entry, kind: "other" },
    { ...entry, entryToken: "bad" },
    { ...entry, extra: true },
  ])
    expect(bridge.beginFilesTerminalDrag(value)).toBeNull();
  expect(ipc.sendSync).not.toHaveBeenCalled();
  expect(bridge.beginFilesTerminalDrag(entry)).toBe(ticket);
  expect(ipc.sendSync).toHaveBeenCalledExactlyOnceWith(
    "files-terminal-drag:start",
    entry,
  );
  ipc.sendSync.mockReturnValue("/never-export-a-path");
  expect(bridge.beginFilesTerminalDrag(entry)).toBeNull();
  bridge.endFilesTerminalDrag("/not-a-ticket");
  expect(ipc.send).not.toHaveBeenCalled();
  bridge.endFilesTerminalDrag(ticket);
  expect(ipc.send).toHaveBeenCalledExactlyOnceWith(
    "files-terminal-drag:end",
    ticket,
  );
});
