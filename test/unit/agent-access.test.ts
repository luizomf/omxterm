import { execFile } from "node:child_process";
import { EventEmitter } from "node:events";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { build } from "esbuild";
import { afterAll, afterEach, beforeAll, expect, it, vi } from "vitest";
import { agentSocketPath, startAgentAccess } from "../../src/main/agent-access";
import type { AgentSessionPort } from "../../src/main/terminal-ipc-types";
import { agentIpc, type AgentReadRequest } from "../../src/shared/agent-access";
import { createIpcHarness } from "../fixtures/terminal-ipc-harness";

let client: string;
const scratch = mkdtempSync(path.join(os.tmpdir(), "oa-"));
beforeAll(async () => {
  // The real client, bundled the way the app ships it.
  client = path.join(scratch, "omxterm-ctl.cjs");
  await build({
    entryPoints: [
      path.resolve(import.meta.dirname, "../../src/agent-ctl/omxterm-ctl.ts"),
    ],
    bundle: true,
    platform: "node",
    format: "cjs",
    outfile: client,
    logLevel: "silent",
  });
});
afterAll(() => rmSync(scratch, { recursive: true, force: true }));

// Unix sockets; the Windows named pipe is a later slice (ADR 0052).
const posix = it.skipIf(process.platform === "win32");

const cleanups: (() => void)[] = [];
afterEach(() => {
  for (const cleanup of cleanups.splice(0)) cleanup();
});

function ctl(profile: string, args: string[], pane?: string) {
  return new Promise<{ code: number; stdout: string; stderr: string }>(
    (resolve) =>
      execFile(
        process.execPath,
        [client, ...args],
        {
          env: {
            PATH: process.env.PATH,
            OMXTERM_PROFILE: profile,
            OMXTERM_PANE: pane,
          },
          encoding: "utf8",
        },
        (error, stdout, stderr) =>
          resolve({ code: Number(error?.code ?? 0), stdout, stderr }),
      ),
  );
}

function sessions(): AgentSessionPort & { writes: [string, string][] } {
  const writes: [string, string][] = [];
  return {
    writes,
    sessions: () => [
      { sessionId: "s1", focused: true, cols: 80, rows: 24 },
      { sessionId: "s2", focused: false, cols: 80, rows: 24 },
    ],
    position: (id) =>
      id === "s1" || id === "s2" ? { sent: 10, acknowledged: 10 } : undefined,
    write(id, data) {
      writes.push([id, data]);
      return "accepted";
    },
    observe: () => () => {},
  };
}

function setup(platform: NodeJS.Platform = process.platform) {
  const profile = mkdtempSync(path.join(scratch, "p"));
  const ipc = createIpcHarness();
  const contents = Object.assign(new EventEmitter(), {
    mainFrame: {},
    isDestroyed: () => false,
    send: vi.fn<(channel: string, payload: unknown) => void>(),
  });
  const window = Object.assign(new EventEmitter(), {
    webContents: contents,
    isDestroyed: () => false,
  });
  const event = { sender: contents, senderFrame: contents.mainFrame };
  const changed = vi.fn();
  const write = vi.fn();
  const access = startAgentAccess({
    ipc: ipc.ipcMain,
    trusted: (candidate) => candidate.sender === contents,
    profile,
    platform,
    operationalEvents: { write },
    changed,
  });
  cleanups.push(() => access.dispose());
  const port = sessions();
  access.register(window, 1, port);
  const states = () =>
    contents.send.mock.calls
      .filter(([channel]) => channel === agentIpc.state)
      .map(([, state]) => state);
  // The window answers reads like the renderer would.
  contents.send.mockImplementation((channel: string, payload: unknown) => {
    if (channel !== agentIpc.read) return;
    const request = payload as AgentReadRequest;
    setImmediate(() =>
      ipc.listeners.get(agentIpc.readResult)!(event, {
        id: request.id,
        text: `text of ${request.sessionId}`,
        truncated: false,
      }),
    );
  });
  const shown = async () => {
    ipc.listeners.get(agentIpc.shown)!(event);
    await vi.waitFor(() =>
      expect(states().at(-1)).toEqual({ state: "granted" }),
    );
  };
  const grants = () => {
    try {
      return readdirSync(path.join(profile, "agent-api", "grants"));
    } catch {
      return [];
    }
  };
  const pane = `${access.instance}:1:s1`;
  return {
    profile,
    pane,
    ipc,
    event,
    window,
    contents,
    access,
    port,
    states,
    shown,
    grants,
    changed,
    write,
  };
}

posix(
  "grants only after the window shows its marks, then a pane's client drives it",
  async () => {
    const { profile, pane, access, window, states, shown, grants, port } =
      setup();
    expect((await ctl(profile, ["status"], pane)).code).toBe(3);

    access.toggle(window);
    expect(states()).toEqual([{ state: "pending" }]);
    // No mark on screen yet: nothing listens and no credential exists.
    expect(existsSync(agentSocketPath(profile))).toBe(false);
    expect(grants()).toEqual([]);

    await shown();
    expect(access.granted(window)).toBe(true);
    const grantFile = path.join(profile, "agent-api", "grants", "1.json");
    expect(statSync(grantFile).mode & 0o777).toBe(0o600);
    const credential = JSON.parse(readFileSync(grantFile, "utf8")) as object;
    expect(Object.keys(credential)).toEqual([
      "version",
      "instance",
      "window",
      "endpoint",
      "token",
    ]);

    const status = await ctl(profile, ["status"], pane);
    expect(status).toMatchObject({ code: 0 });
    const list = await ctl(profile, ["list", "--json"], pane);
    const { panes } = JSON.parse(list.stdout) as { panes: { self: boolean }[] };
    expect(panes.map((pane) => pane.self)).toEqual([true, false]);
    await ctl(profile, ["send", "s2", "--text", "ls -la", "--enter"], pane);
    expect(port.writes).toEqual([["s2", "ls -la\r"]]);
    expect((await ctl(profile, ["read", "s2"], pane)).stdout).toBe(
      "text of s2\n",
    );
    expect((await ctl(profile, ["read", "2:s2"], pane)).code).toBe(2);
  },
);

posix(
  "ends on a mark click, removing the socket and the credential",
  async () => {
    const {
      profile,
      pane,
      access,
      window,
      ipc,
      event,
      states,
      shown,
      grants,
      changed,
    } = setup();
    access.toggle(window);
    await shown();
    ipc.listeners.get(agentIpc.stop)!(event);
    expect(states().at(-1)).toEqual({ state: "off" });
    expect(access.granted(window)).toBe(false);
    expect(existsSync(agentSocketPath(profile))).toBe(false);
    expect(grants()).toEqual([]);
    expect(changed).toHaveBeenCalled();
    expect((await ctl(profile, ["status"], pane)).code).toBe(3);
  },
);

posix(
  "can't be granted by the renderer, and ends on reload or window loss",
  async () => {
    const { access, window, contents, ipc, event, states, shown } = setup();
    // A confirmation nobody asked for grants nothing.
    ipc.listeners.get(agentIpc.shown)!(event);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(states()).toEqual([]);
    expect(access.granted(window)).toBe(false);

    access.toggle(window);
    await shown();
    contents.emit(
      "did-start-navigation",
      {},
      "file:///index.html",
      false,
      true,
    );
    expect(access.granted(window)).toBe(false);

    access.toggle(window);
    await shown();
    window.emit("closed");
    expect(access.granted(window)).toBe(false);
  },
);

posix("refuses where it can't keep its side and says why", async () => {
  const windows = setup("win32");
  windows.access.toggle(windows.window);
  expect(windows.states()).toEqual([{ state: "off", refused: "unsupported" }]);
  // The menu's check mark resyncs after a refusal, too.
  expect(windows.changed).toHaveBeenCalled();

  const first = setup();
  first.access.toggle(first.window);
  await first.shown();
  // A second process on the same profile, like a source run beside the app.
  const second = setup();
  const secondIpc = createIpcHarness();
  const crowded = startAgentAccess({
    ipc: secondIpc.ipcMain,
    trusted: () => true,
    profile: first.profile,
    platform: process.platform,
  });
  cleanups.push(() => crowded.dispose());
  crowded.register(second.window, 1, sessions());
  crowded.toggle(second.window);
  secondIpc.listeners.get(agentIpc.shown)!(second.event);
  await vi.waitFor(() =>
    expect(second.states().at(-1)).toEqual({ state: "off", refused: "in-use" }),
  );
  expect(crowded.granted(second.window)).toBe(false);
  expect(first.access.granted(first.window)).toBe(true);
  expect(first.grants()).toEqual(["1.json"]);

  const deep = setup();
  const longProfile = path.join(deep.profile, "x".repeat(120));
  const tooLong = startAgentAccess({
    ipc: createIpcHarness().ipcMain,
    trusted: () => true,
    profile: longProfile,
    platform: process.platform,
  });
  cleanups.push(() => tooLong.dispose());
  tooLong.register(deep.window, 1, sessions());
  tooLong.toggle(deep.window);
  expect(deep.states().at(-1)).toEqual({
    state: "off",
    refused: "path-too-long",
  });
});

posix(
  "removes a crashed run's leftovers but never a live process's",
  async () => {
    const live = setup();
    live.access.toggle(live.window);
    await live.shown();
    const other = startAgentAccess({
      ipc: createIpcHarness().ipcMain,
      trusted: () => false,
      profile: live.profile,
      platform: process.platform,
    });
    await other.removeLeftovers();
    expect(live.grants()).toEqual(["1.json"]);
    other.dispose();

    const crashed = setup();
    const grantsDirectory = path.join(crashed.profile, "agent-api", "grants");
    mkdirSync(grantsDirectory, { recursive: true });
    writeFileSync(path.join(grantsDirectory, "9.json"), "{}", { mode: 0o600 });
    writeFileSync(path.join(grantsDirectory, "notes.txt"), "keep");
    await crashed.access.removeLeftovers();
    expect(crashed.grants()).toEqual(["notes.txt"]);
  },
);

posix(
  "keeps a pane's agent on its own process when another shares the profile",
  async () => {
    // Process A grants its window 1.
    const a = setup();
    a.access.toggle(a.window);
    await a.shown();
    // Process B, a source run on the same profile, also has a window 1 and s1.
    const b = startAgentAccess({
      ipc: createIpcHarness().ipcMain,
      trusted: () => true,
      profile: a.profile,
      platform: process.platform,
    });
    cleanups.push(() => b.dispose());
    expect(b.instance).not.toBe(a.access.instance);
    const fromB = `${b.instance}:1:s1`;
    expect(await ctl(a.profile, ["status"], fromB)).toMatchObject({ code: 3 });
    expect(
      (
        await ctl(
          a.profile,
          ["send", "s2", "--text", "rm -rf ~", "--enter"],
          fromB,
        )
      ).code,
    ).toBe(3);
    // Naming A's window explicitly from B's pane changes nothing.
    expect(
      (
        await ctl(
          a.profile,
          ["send", "s2", "--window", "1", "--text", "x"],
          fromB,
        )
      ).code,
    ).toBe(3);
    expect(a.port.writes).toEqual([]);
    // A's own pane still drives it.
    expect((await ctl(a.profile, ["status"], a.pane)).code).toBe(0);
  },
);

posix("admits once when the window confirms twice", async () => {
  const { profile, pane, access, window, ipc, event, states, grants } = setup();
  access.toggle(window);
  const shown = ipc.listeners.get(agentIpc.shown)!;
  shown(event);
  shown(event);
  await vi.waitFor(() => expect(states().at(-1)).toEqual({ state: "granted" }));
  await new Promise((resolve) => setTimeout(resolve, 50));
  expect(states()).toEqual([{ state: "pending" }, { state: "granted" }]);
  expect(grants()).toEqual(["1.json"]);
  expect((await ctl(profile, ["status"], pane)).code).toBe(0);
});

posix("sends nothing to a crashed window while ending its grant", async () => {
  const { access, window, contents, shown } = setup();
  access.toggle(window);
  await shown();
  const sent = contents.send.mock.calls.length;
  Object.assign(contents, { isCrashed: () => true });
  contents.emit("render-process-gone");
  expect(access.granted(window)).toBe(false);
  expect(contents.send.mock.calls).toHaveLength(sent);
});
