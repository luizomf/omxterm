import { expect, it } from "vitest";
import { agentIpc, type AgentReadRequest } from "../../src/shared/agent-access";
import { useAgentHarness } from "../fixtures/agent-access-harness";

// `--text -` and `--match -` (ADR 0052): text no shell or launcher reads.
const { ctl, mcp, setup } = useAgentHarness();

async function granted() {
  const harness = setup();
  harness.access.toggle(harness.window);
  await harness.shown();
  return harness;
}

it("types stdin's text exactly, as UTF-8, without its final line break", async () => {
  const { profile, pane, port } = await granted();
  const text = 'git commit -m "fix & test" | tail < in > out ^ %PATH% é 🚀';
  // Windows PowerShell can put two byte order marks first and ends with CRLF.
  const sent = await ctl(
    profile,
    ["send", "s2", "--text", "-", "--enter"],
    pane,
    `﻿﻿${text}\r\n`,
  );
  expect(sent.code).toBe(0);
  // Only the last line break goes; the others are the text's own.
  await ctl(profile, ["send", "s2", "--text", "-"], pane, "a\nb\n\n");
  // s2's program takes pastes, so the two lines arrive as one.
  expect(port.writes).toEqual([
    ["s2", text],
    ["s2", "\r"],
    ["s2", "\x1b[200~a\nb\n\x1b[201~"],
  ]);
});

it("waits for a match read from stdin", async () => {
  const { profile, pane, port, contents, ipc, event } = await granted();
  // Each look shows one more copy of what was typed.
  let looks = 0;
  const answer = contents.send.getMockImplementation()!;
  contents.send.mockImplementation((channel: string, payload: unknown) => {
    if (channel !== agentIpc.read) return answer(channel, payload);
    const request = payload as AgentReadRequest;
    setImmediate(() =>
      ipc.listeners.get(agentIpc.readResult)!(event, {
        id: request.id,
        text: port.writes
          .map(([, data]) => data)
          .join("")
          .repeat(++looks),
        truncated: false,
      }),
    );
  });
  const waited = await ctl(
    profile,
    ["send", "s2", "--text", "50% & done", "--match", "-"],
    pane,
    "50% & done\n",
  );
  expect(waited).toMatchObject({ code: 0, stdout: "match\n" });
});

it("refuses stdin that isn't UTF-8, or read twice, and types nothing", async () => {
  const { profile, pane, port } = await granted();
  const invalid = await ctl(
    profile,
    ["send", "s2", "--text", "-"],
    pane,
    Buffer.from([0x61, 0xff, 0x62]),
  );
  expect(invalid).toMatchObject({
    code: 2,
    stderr: "The text on stdin isn't UTF-8.\n",
  });
  const twice = await ctl(
    profile,
    ["send", "s2", "--text", "-", "--match", "-"],
    pane,
    "x",
  );
  expect(twice.code).toBe(2);
  expect(port.writes).toEqual([]);
});

it("leaves an MCP text of - as typed", async () => {
  const { profile, pane, port } = await granted();
  const server = mcp(profile, pane);
  await server.request("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "test", version: "1" },
  });
  server.notify("notifications/initialized");
  expect(await server.call("send", { pane: "s2", text: "-" })).toMatchObject({
    isError: false,
  });
  expect(port.writes).toEqual([["s2", "-"]]);
});
