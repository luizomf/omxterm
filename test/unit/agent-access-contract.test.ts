import { expect, it, vi } from "vitest";
import { createAgentBridge } from "../../src/preload/agent-bridge";
import {
  agentIpc,
  agentTail,
  isAgentAccessState,
} from "../../src/shared/agent-access";
import { MAX_AGENT_READ_CHARS } from "../../src/shared/agent-api";

it("reads a tail without the blank rows below the cursor or trailing spaces", () => {
  const screen = "one   \ntwo\n$ echo hi  \nhi\n$ \n\n\n   \n";
  expect(agentTail(screen, 2)).toEqual({ text: "hi\n$", truncated: false });
  expect(agentTail(screen, 200).text).toBe("one\ntwo\n$ echo hi\nhi\n$");
  expect(agentTail("\n\n", 5)).toEqual({ text: "", truncated: false });
  const long = agentTail(`${"😀".repeat(MAX_AGENT_READ_CHARS)}`, 1);
  expect(long.truncated).toBe(true);
  expect(long.text.length).toBeLessThanOrEqual(MAX_AGENT_READ_CHARS);
  expect(long.text.codePointAt(0)).toBe(0x1f600);
});

it("lets the window confirm, stop and answer, but passes only valid messages", () => {
  const listeners = new Map<
    string,
    (event: unknown, payload: unknown) => void
  >();
  const ipc = {
    send: vi.fn(),
    on: vi.fn(
      (channel: string, listener: (event: unknown, payload: unknown) => void) =>
        listeners.set(channel, listener),
    ),
    removeListener: vi.fn(),
  };
  const bridge = createAgentBridge(ipc as never);
  const states: unknown[] = [];
  bridge.onState((state) => states.push(state));
  for (const payload of [
    { state: "granted" },
    { state: "granted", token: "x" },
    { state: "off", refused: "because" },
    { state: "off", refused: "in-use" },
  ])
    listeners.get(agentIpc.state)!({}, payload);
  expect(states).toEqual([
    { state: "granted" },
    { state: "off", refused: "in-use" },
  ]);
  expect(isAgentAccessState({ state: "pending" })).toBe(true);

  const reads: unknown[] = [];
  bridge.onRead((request) => reads.push(request));
  const id = "00000000-0000-0000-0000-000000000002";
  listeners.get(agentIpc.read)!({}, { id, sessionId: "s1", lines: 0 });
  listeners.get(agentIpc.read)!({}, { id, sessionId: "s1", lines: 5 });
  expect(reads).toEqual([{ id, sessionId: "s1", lines: 5 }]);

  bridge.shown();
  bridge.stop();
  bridge.readResult({ id, text: "hi", truncated: false });
  expect(() =>
    bridge.readResult({
      id,
      text: "x".repeat(MAX_AGENT_READ_CHARS + 1),
      truncated: false,
    }),
  ).toThrow(TypeError);
  expect(ipc.send.mock.calls).toEqual([
    [agentIpc.shown],
    [agentIpc.stop],
    [agentIpc.readResult, { id, text: "hi", truncated: false }],
  ]);
});
