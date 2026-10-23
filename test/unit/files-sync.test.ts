import { describe, expect, it, vi } from "vitest";
import {
  createTerminalSync,
  pathFromUri,
  type PaneState,
} from "../../src/renderer/files/files-sync";
import type { FilesSource } from "../../src/renderer/files/files-source";

const source = (kind: "local" | "remote", platform = "linux") =>
  ({ kind, platform, separator: "/" }) as FilesSource;

function setup(pane: PaneState | null, uri?: string) {
  const keys: string[] = [];
  const commands: string[] = [];
  const state = { pane, uri };
  const sync = createTerminalSync({
    focusedPane: async () => state.pane,
    reportedUri: () => state.uri,
    sendKeys: (value) => keys.push(value),
    runCommand: (command) => commands.push(command),
  });
  return { sync, keys, commands, state };
}

describe("Files panel and terminal sync", () => {
  it("changes an idle local shell's directory, clearing the line first", async () => {
    const { sync, keys, commands } = setup({
      directory: "/home/me",
      busy: false,
    });
    expect(await sync.push(source("local"), "/home/me/it's here")).toBe("sent");
    expect(keys).toEqual(["\u0005\u0015"]);
    expect(commands).toEqual([" cd -- '/home/me/it'\\''s here'"]);
  });

  it("types nothing into a busy pane or where the shell already is", async () => {
    const busy = setup({ directory: "/a", busy: true });
    expect(await busy.sync.push(source("local"), "/b")).toBe("busy");
    const same = setup({ directory: "/b", busy: false });
    expect(await same.sync.push(source("local"), "/b")).toBe("same");
    expect([...busy.commands, ...same.commands]).toEqual([]);
  });

  it("uses Set-Location for PowerShell", async () => {
    const { sync, keys, commands } = setup({ directory: "C:\\", busy: false });
    await sync.push(source("local", "win32"), "C:\\Users");
    expect(keys).toEqual(["\u001b"]);
    expect(commands).toEqual(["Set-Location -LiteralPath 'C:\\Users'"]);
  });

  it("waits for the shell after a push before following it again", async () => {
    const { sync, state } = setup({ directory: "/a", busy: false });
    await sync.push(source("local"), "/b");
    expect(await sync.pull(source("local"))).toBeUndefined();
    state.pane = { directory: "/b", busy: false };
    expect(await sync.pull(source("local"))).toBe("/b");
    state.pane = { directory: "/c", busy: false };
    expect(await sync.pull(source("local"))).toBe("/c");
  });

  it("gives up waiting after a few seconds", async () => {
    vi.useFakeTimers();
    try {
      const { sync } = setup({ directory: "/a", busy: false });
      await sync.push(source("local"), "/b");
      vi.advanceTimersByTime(5_000);
      expect(await sync.pull(source("local"))).toBe("/a");
    } finally {
      vi.useRealTimers();
    }
  });

  it("follows a remote shell only through its OSC 7 reports", async () => {
    const { sync, state, commands } = setup(null, "file://server/srv/www");
    expect(await sync.pull(source("remote"))).toBe("/srv/www");
    expect(await sync.push(source("remote"), "/srv/www")).toBe("same");
    await sync.push(source("remote"), "/srv/a b");
    expect(commands).toEqual([" cd -- '/srv/a b'"]);
    state.uri = "file://server/srv/a%20b";
    expect(await sync.pull(source("remote"))).toBe("/srv/a b");
    expect(pathFromUri("https://x/y")).toBeUndefined();
    expect(pathFromUri(undefined)).toBeUndefined();
  });
});
