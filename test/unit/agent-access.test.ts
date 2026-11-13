import { execFile, spawn } from "node:child_process";
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
import { agentNotGrantedSentence } from "../../src/shared/agent-api";
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
    loader: { ".md": "text" },
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

// `omxterm-ctl mcp` over real stdio: send lines, await answers by id.
function mcp(profile: string, pane?: string) {
  const child = spawn(process.execPath, [client, "mcp"], {
    env: {
      PATH: process.env.PATH,
      OMXTERM_PROFILE: profile,
      OMXTERM_PANE: pane,
    },
    stdio: ["pipe", "pipe", "inherit"],
  });
  cleanups.push(() => child.kill());
  const answers = new Map<
    unknown,
    (message: Record<string, unknown>) => void
  >();
  const lines: Record<string, unknown>[] = [];
  let buffer = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk: string) => {
    buffer += chunk;
    for (let end; (end = buffer.indexOf("\n")) >= 0;) {
      const message = JSON.parse(buffer.slice(0, end)) as Record<
        string,
        unknown
      >;
      buffer = buffer.slice(end + 1);
      lines.push(message);
      answers.get(message.id)?.(message);
    }
  });
  let nextId = 0;
  const notify = (method: string, params?: object) =>
    child.stdin.write(
      `${JSON.stringify({ jsonrpc: "2.0", method, params })}\n`,
    );
  const request = (method: string, params?: object) => {
    const id = nextId++;
    const answer = new Promise<Record<string, unknown>>((resolve) =>
      answers.set(id, resolve),
    );
    child.stdin.write(
      `${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`,
    );
    return answer;
  };
  const call = async (name: string, args: object = {}, meta?: object) => {
    const { result } = await request("tools/call", {
      name,
      arguments: args,
      ...(meta ? { _meta: meta } : {}),
    });
    const { content, isError } = result as {
      content: { type: string; text: string }[];
      isError: boolean;
    };
    expect(content).toHaveLength(1);
    return { text: content[0]!.text, isError };
  };
  const exited = new Promise<number | null>((resolve) =>
    child.on("exit", resolve),
  );
  return { child, request, notify, call, lines, exited };
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

it("prints the agent guide, which is the shipped SKILL.md", async () => {
  const guide = await ctl(scratch, ["guide"]);
  const skill = readFileSync(
    path.resolve(import.meta.dirname, "../../src/agent-ctl/SKILL.md"),
    "utf8",
  );
  expect(guide.code).toBe(0);
  expect(guide.stdout.trim()).not.toBe("");
  expect(guide.stdout).toBe(skill);
  // A skill-aware agent can install it as is.
  const frontmatter = /^---\n([\s\S]*?)\n---\n/u.exec(skill)?.[1] ?? "";
  expect(frontmatter).toMatch(/^name: omxterm$/mu);
  expect(frontmatter).toMatch(/^description: \S/mu);
});

posix(
  "serves MCP on stdio and starts working when the window is allowed",
  async () => {
    const { profile, pane, access, window, shown, port } = setup();
    const server = mcp(profile, pane);
    // An initialize-era client, as Codex is.
    const { result: initialized } = await server.request("initialize", {
      protocolVersion: "2025-06-18",
      capabilities: {},
      clientInfo: { name: "test", version: "1" },
    });
    expect(initialized).toMatchObject({
      protocolVersion: "2025-06-18",
      capabilities: { tools: {} },
      serverInfo: { name: "omxterm" },
    });
    server.notify("notifications/initialized");
    const { result: listed } = await server.request("tools/list");
    expect(
      (listed as { tools: { name: string }[] }).tools.map((tool) => tool.name),
    ).toEqual(["status", "list", "send", "read", "wait"]);

    // Listed, but not granted yet: the status sentence, as a tool error.
    expect(await server.call("list")).toEqual({
      text: agentNotGrantedSentence(),
      isError: true,
    });

    access.toggle(window);
    await shown();
    expect(await server.call("status")).toMatchObject({ isError: false });
    expect(await server.call("list")).toEqual({
      text: "s1\t80x24\tfocused\tself\ns2\t80x24",
      isError: false,
    });
    const sent = await server.call("send", {
      pane: "s2",
      text: "ls -la",
      enter: true,
    });
    expect(sent.isError).toBe(false);
    expect(JSON.parse(sent.text)).toEqual({ receipt: "accepted", offset: 10 });
    expect(port.writes).toEqual([["s2", "ls -la\r"]]);
    expect(await server.call("read", { pane: "s2" })).toEqual({
      text: "text of s2",
      isError: false,
    });
    // A wait that runs out is an answer, not an error.
    expect(await server.call("wait", { pane: "s2", timeout: 50 })).toEqual({
      text: "timeout",
      isError: false,
    });
    expect(await server.call("read", { pane: 2 })).toMatchObject({
      isError: true,
    });
    expect(await server.request("tools/call", { name: "split" })).toMatchObject(
      { error: { code: -32602 } },
    );

    server.child.stdin.end();
    expect(await server.exited).toBe(0);
    // Nothing but protocol lines reached stdout.
    expect(server.lines.every((line) => line.jsonrpc === "2.0")).toBe(true);
  },
);

posix("serves per-request MCP clients without a handshake", async () => {
  const { profile, pane, access, window, shown } = setup();
  access.toggle(window);
  await shown();
  const server = mcp(profile, pane);
  const meta = {
    "io.modelcontextprotocol/protocolVersion": "2026-07-28",
    "io.modelcontextprotocol/clientCapabilities": {},
  };
  const { result: discovered } = await server.request("server/discover", {
    _meta: meta,
  });
  expect(discovered).toMatchObject({
    resultType: "complete",
    capabilities: { tools: {} },
  });
  expect(
    (discovered as { supportedVersions: string[] }).supportedVersions,
  ).toContain("2026-07-28");
  const { result: listed } = await server.request("tools/list", {
    _meta: meta,
  });
  expect(listed).toMatchObject({ resultType: "complete" });
  expect((listed as { tools: unknown[] }).tools).toHaveLength(5);
  expect(await server.call("status", {}, meta)).toMatchObject({
    isError: false,
  });
  expect(
    await server.request("tools/list", {
      _meta: {
        ...meta,
        "io.modelcontextprotocol/protocolVersion": "1900-01-01",
      },
    }),
  ).toMatchObject({
    error: { code: -32022, data: { requested: "1900-01-01" } },
  });
});

posix("drops a cancelled call and leaves when stdin closes", async () => {
  const { profile, pane, access, window, shown } = setup();
  access.toggle(window);
  await shown();
  const server = mcp(profile, pane);
  const pause = (ms: number) =>
    new Promise((resolve) => setTimeout(resolve, ms));
  // Without the cancel, this wait would answer "timeout" after 500 ms.
  void server.request("tools/call", {
    name: "wait",
    arguments: { pane: "s2", timeout: 500 },
  });
  await pause(200);
  server.notify("notifications/cancelled", { requestId: 0 });
  await pause(600);
  expect(server.lines).toEqual([]);

  // A long wait doesn't keep the server alive once its client is gone.
  void server.request("tools/call", {
    name: "wait",
    arguments: { pane: "s2", timeout: 60_000 },
  });
  await pause(200);
  server.child.stdin.end();
  expect(await server.exited).toBe(0);
  expect(server.lines).toEqual([]);
});
