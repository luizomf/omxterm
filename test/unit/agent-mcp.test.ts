import { readFileSync } from "node:fs";
import path from "node:path";
import { expect, it, vi } from "vitest";
import { SELF_UNKNOWN } from "../../src/agent-ctl/commands";
import { agentNotGrantedSentence } from "../../src/shared/agent-api";
import { useAgentHarness } from "../fixtures/agent-access-harness";

// omxterm-ctl's guide and MCP server (ADR 0052, slice 2) against the real
// endpoint.
const { scratch, ctl, mcp, setup } = useAgentHarness();

it("prints the agent guide, which is the shipped SKILL.md", async () => {
  const guide = await ctl(scratch, ["guide"]);
  const skill = readFileSync(
    path.resolve(import.meta.dirname, "../../src/agent-ctl/SKILL.md"),
    "utf8",
  );
  expect(guide.code).toBe(0);
  expect(guide.stdout.trim()).not.toBe("");
  expect(guide.stdout).toBe(skill);
});

it("serves MCP on stdio and starts working when the window is allowed", async () => {
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
  ).toEqual(["status", "list", "send", "press", "keys", "read", "wait"]);

  // Listed, but not granted yet: the status sentence, as a tool error.
  expect(await server.call("list")).toEqual({
    text: agentNotGrantedSentence(),
    isError: true,
  });

  access.toggle(window);
  await shown();
  expect(await server.call("status")).toMatchObject({ isError: false });
  expect(await server.call("list")).toEqual({
    text: "t1\tzsh\tselected\n  s1\t80x24\tfocused\tself\nt2\tvim\n  s2\t80x24",
    isError: false,
  });
  const sent = await server.call("send", {
    pane: "s2",
    text: "ls -la",
    enter: true,
  });
  expect(sent.isError).toBe(false);
  expect(JSON.parse(sent.text)).toEqual({ receipt: "accepted", offset: 10 });
  expect(port.writes).toEqual([
    ["s2", "ls -la"],
    ["s2", "\r"],
  ]);
  expect(await server.call("read", { pane: "s2" })).toEqual({
    text: "tail of s2",
    isError: false,
  });
  expect(await server.call("read", { pane: "s2", screen: true })).toEqual({
    text: "screen of s2",
    isError: false,
  });
  const pressed = await server.call("press", {
    pane: "s2",
    keys: ["Down", "Ctrl+Up"],
  });
  expect(pressed.isError).toBe(false);
  expect(JSON.parse(pressed.text)).toMatchObject({ receipt: "accepted" });
  expect(port.writes.at(-1)).toEqual(["s2", "<Down><C-Up>"]);
  expect(await server.call("press", { pane: "s2" })).toMatchObject({
    isError: true,
  });
  expect(
    await server.call("send", {
      pane: "s2",
      text: "make",
      enter: true,
      wait: true,
      idle: 100,
    }),
  ).toEqual({ text: "idle", isError: false });
  expect(port.writes.slice(-2)).toEqual([
    ["s2", "make"],
    ["s2", "\r"],
  ]);
  // A pane can't smuggle in an option such as another profile.
  const writes = port.writes.length;
  expect(
    await server.call("send", { pane: "--profile", text: "s2" }),
  ).toMatchObject({ isError: true });
  expect(port.writes).toHaveLength(writes);
  // A wait that runs out is an answer, not an error.
  expect(await server.call("wait", { pane: "s2", timeout: 100 })).toEqual({
    text: "timeout",
    isError: false,
  });
  expect(
    await server.call("wait", { pane: "s2", match: "done", timeout: 100 }),
  ).toEqual({ text: "timeout", isError: false });
  expect(
    await server.call("wait", { pane: "s2", match: "", timeout: 100 }),
  ).toMatchObject({ isError: true });
  // Seconds typed as milliseconds are refused, with the likely value.
  const early = await server.call("wait", { pane: "s2", timeout: 30 });
  expect(early.isError).toBe(true);
  expect(early.text).toContain("30000");
  expect(await server.call("read", { pane: 2 })).toMatchObject({
    isError: true,
  });
  expect(await server.request("tools/call", { name: "split" })).toMatchObject({
    error: { code: -32602 },
  });

  server.child.stdin.end();
  expect(await server.exited).toBe(0);
  // Nothing but protocol lines reached stdout.
  expect(server.lines.every((line) => line.jsonrpc === "2.0")).toBe(true);
});

it("serves per-request MCP clients without a handshake", async () => {
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
  expect((listed as { tools: unknown[] }).tools).toHaveLength(7);
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

it("drops a cancelled call and leaves when stdin closes", async () => {
  const { profile, pane, access, window, shown, port } = setup();
  access.toggle(window);
  await shown();
  const server = mcp(profile, pane);
  // Cancelled in the same write, before the call can reach the window.
  server.child.stdin.write(
    [
      {
        jsonrpc: "2.0",
        id: "early",
        method: "tools/call",
        params: { name: "send", arguments: { pane: "s2", text: "first" } },
      },
      {
        jsonrpc: "2.0",
        method: "notifications/cancelled",
        params: { requestId: "early" },
      },
    ]
      .map((message) => `${JSON.stringify(message)}\n`)
      .join(""),
  );
  expect(
    await server.call("send", { pane: "s2", text: "second" }),
  ).toMatchObject({ isError: false });

  // A long wait doesn't keep the server alive once its client is gone.
  const asked = port.position.mock.calls.length;
  void server.request("tools/call", {
    name: "wait",
    arguments: { pane: "s2", timeout: 60_000 },
  });
  await vi.waitFor(() =>
    expect(port.position.mock.calls.length).toBeGreaterThan(asked),
  );
  server.child.stdin.end();
  expect(await server.exited).toBe(0);
  expect(port.writes).toEqual([["s2", "second"]]);
  expect(server.lines.map((line) => line.id)).toEqual([0]);
});

it("says when it can't tell which pane is the caller's", async () => {
  const { profile, pane, access, window, shown } = setup();
  access.toggle(window);
  await shown();
  // An agent whose client hides the pane's variables, as Codex does.
  const server = mcp(profile);
  const status = await server.call("status");
  expect(status.isError).toBe(false);
  expect(status.text).toContain(SELF_UNKNOWN);
  expect((await server.call("list")).text.split("\n").at(-1)).toBe(
    SELF_UNKNOWN,
  );

  const outside = JSON.parse(
    (await ctl(profile, ["list", "--json", "--profile", profile])).stdout,
  ) as { note?: string };
  expect(outside.note).toBe(SELF_UNKNOWN);
  // Naming the pane's own profile keeps its pane.
  const inside = JSON.parse(
    (await ctl(profile, ["list", "--json", "--profile", profile], pane)).stdout,
  ) as { note?: string; tabs: { panes: { self: boolean }[] }[] };
  expect(inside.note).toBeUndefined();
  expect(
    inside.tabs.flatMap((tab) => tab.panes.map((entry) => entry.self)),
  ).toEqual([true, false]);
});
