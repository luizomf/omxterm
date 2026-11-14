import { expect, it } from "vitest";
import { useAgentHarness } from "../fixtures/agent-access-harness";

// `send … --command` and `wait --command` (ADR 0054) through omxterm-ctl and
// the real endpoint.
const { ctl, mcp, setup } = useAgentHarness();

it("runs a command and prints its exit code, the CLI itself exiting 0", async () => {
  const { profile, pane, access, window, shown, port } = setup();
  access.toggle(window);
  await shown();
  port.shell("s2", 3);
  const sent = await ctl(
    profile,
    ["send", "s2", "--text", "make", "--enter", "--command"],
    pane,
  );
  expect(sent).toMatchObject({ code: 0, stdout: "command-end 3\n" });
  const json = await ctl(
    profile,
    ["send", "s2", "--text", "make", "--enter", "--command", "--json"],
    pane,
  );
  expect(JSON.parse(json.stdout)).toMatchObject({
    reason: "command-end",
    exitCode: 3,
  });

  const server = mcp(profile, pane);
  await server.request("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "test", version: "1" },
  });
  expect(
    await server.call("send", {
      pane: "s2",
      text: "make",
      enter: true,
      command: true,
    }),
  ).toEqual({ text: "command-end 3", isError: false });
});

it("says how to wait again when a command outlasts its timeout", async () => {
  const { profile, pane, access, window, shown, port } = setup();
  access.toggle(window);
  await shown();
  port.shell("s2");
  const sent = await ctl(
    profile,
    [
      "send",
      "s2",
      "--text",
      "make",
      "--enter",
      "--command",
      "--timeout",
      "300",
    ],
    pane,
  );
  expect(sent.code).toBe(124);
  expect(sent.stdout).toMatch(
    /^timeout \(still running; wait --command --after \d+\)\n$/u,
  );

  // Over MCP too, where a long command outlasts the 50 s default.
  const server = mcp(profile, pane);
  await server.request("initialize", {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "test", version: "1" },
  });
  const called = await server.call("send", {
    pane: "s2",
    text: "make",
    enter: true,
    command: true,
    timeout: 300,
  });
  expect(called.isError).toBe(false);
  expect(called.text).toMatch(
    /^timeout \(still running; wait --command --after \d+\)$/u,
  );
});

it("says where to wait from when the shell reports no commands", async () => {
  const { profile, pane, access, window, shown } = setup();
  access.toggle(window);
  await shown();
  const sent = await ctl(
    profile,
    ["send", "s2", "--text", "make", "--enter", "--command"],
    pane,
  );
  expect(sent.code).toBe(1);
  expect(sent.stderr).toContain("no-command-marks");
  expect(sent.stderr).toContain("--after 10");
});
