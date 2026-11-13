import { readFile } from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, it } from "vitest";
import {
  CURRENT_OPERATIONAL_LOG_FILE,
  createOperationalEventLog,
} from "../../src/main/operational-events";

it("records a grant's envelope and command outcomes, never payloads", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-agent-events-"));
  const log = createOperationalEventLog({
    environment: { XDG_STATE_HOME: root },
    homeDirectory: root,
  });
  log.setLevel("info");
  expect(
    log.write({
      name: "agent.grant",
      windowId: 2,
      action: "started",
      reason: "user",
    }),
  ).toBe(true);
  // Commands are debug detail.
  const command = {
    name: "agent.command",
    windowId: 2,
    command: "send",
    outcome: "ok",
    durationMs: 3,
  } as const;
  expect(log.write(command)).toBe(false);
  log.setLevel("debug");
  expect(log.write(command)).toBe(true);
  for (const leak of [
    { ...command, text: "PRIVATE_AGENT_CANARY" },
    { ...command, command: "PRIVATE_AGENT_CANARY" },
    { ...command, outcome: "PRIVATE_AGENT_CANARY" },
    { name: "agent.grant", windowId: 2, action: "started", reason: "in-use" },
    {
      name: "agent.grant",
      windowId: 2,
      action: "ended",
      reason: "user",
      token: "PRIVATE_AGENT_CANARY",
    },
  ])
    expect(log.write(leak as never)).toBe(false);
  expect(
    log.write({
      name: "agent.grant",
      windowId: 2,
      action: "refused",
      reason: "in-use",
    }),
  ).toBe(true);
  const text = await readFile(
    path.join(root, "omxterm", "logs", CURRENT_OPERATIONAL_LOG_FILE),
    "utf8",
  );
  const records = text
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as { name: string; level: string });
  expect(records.map((record) => [record.name, record.level])).toEqual([
    ["agent.grant", "info"],
    ["agent.command", "debug"],
    ["agent.grant", "info"],
  ]);
  expect(text).not.toContain("PRIVATE_AGENT_CANARY");
});
