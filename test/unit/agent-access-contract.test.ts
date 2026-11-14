import { expect, it, vi } from "vitest";
import { createAgentBridge } from "../../src/preload/agent-bridge";
import {
  agentIpc,
  agentScreen,
  agentTail,
  isAgentAccessState,
  MAX_AGENT_PRESS_CHARS,
  MAX_AGENT_TAB_TITLE,
  MAX_AGENT_TABS,
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

it("reads every screen row, blank ones included, without trailing spaces", () => {
  expect(agentScreen("$ ls   \nfile\n\n  \n")).toEqual({
    text: "$ ls\nfile\n\n\n",
    truncated: false,
  });
  const long = agentScreen("x".repeat(MAX_AGENT_READ_CHARS + 5));
  expect(long.truncated).toBe(true);
  expect(long.text.length).toBe(MAX_AGENT_READ_CHARS);
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
  for (const payload of [
    { id, sessionId: "s1", source: "tail", lines: 0 },
    { id, sessionId: "s1", lines: 5 },
    { id, sessionId: "s1", source: "screen", lines: 5 },
    { id, sessionId: "s1", source: "command" },
    { id, sessionId: "s1", source: "tail", lines: 5 },
    { id, sessionId: "s1", source: "screen" },
  ])
    listeners.get(agentIpc.read)!({}, payload);
  expect(reads).toEqual([
    { id, sessionId: "s1", source: "tail", lines: 5 },
    { id, sessionId: "s1", source: "screen" },
  ]);

  bridge.shown();
  bridge.stop();
  bridge.readResult({ id, text: "hi", truncated: false });
  bridge.readResult({ id, text: "hi", truncated: false, alternate: true });
  expect(() =>
    bridge.readResult({
      id,
      text: "x".repeat(MAX_AGENT_READ_CHARS + 1),
      truncated: false,
    }),
  ).toThrow(TypeError);
  expect(() =>
    bridge.readResult({
      id,
      text: "hi",
      truncated: false,
      alternate: "yes" as unknown as boolean,
    }),
  ).toThrow(TypeError);
  expect(ipc.send.mock.calls).toEqual([
    [agentIpc.shown],
    [agentIpc.stop],
    [agentIpc.readResult, { id, text: "hi", truncated: false }],
    [
      agentIpc.readResult,
      { id, text: "hi", truncated: false, alternate: true },
    ],
  ]);
});

it("passes only valid presses and bounded encoded bytes", () => {
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
  const presses: unknown[] = [];
  bridge.onPress((request) => presses.push(request));
  const id = "00000000-0000-0000-0000-000000000004";
  const up = { key: "Up", ctrl: false, alt: false, shift: true };
  for (const keys of [
    [],
    [{ ...up, key: "ArrowUp" }],
    [{ ...up, meta: true }],
    [{ ...up, ctrl: "yes" }],
    Array(65).fill(up),
    [up],
  ])
    listeners.get(agentIpc.press)!({}, { id, sessionId: "s1", keys });
  expect(presses).toEqual([{ id, sessionId: "s1", keys: [up] }]);

  bridge.pressResult({ id, data: "\x1b[1;2A" });
  bridge.pressResult({ id, error: "unavailable" });
  expect(() =>
    bridge.pressResult({ id, data: "x".repeat(MAX_AGENT_PRESS_CHARS + 1) }),
  ).toThrow(TypeError);
  expect(ipc.send.mock.calls).toEqual([
    [agentIpc.pressResult, { id, data: "\x1b[1;2A" }],
    [agentIpc.pressResult, { id, error: "unavailable" }],
  ]);
});

it("passes only valid mode requests and answers", () => {
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
  const requests: unknown[] = [];
  bridge.onModes((request) => requests.push(request));
  const id = "00000000-0000-0000-0000-000000000008";
  for (const payload of [
    { id },
    { id, sessionId: "pane-1" },
    { id, sessionId: "s1", text: "x" },
    { id, sessionId: "s1" },
  ])
    listeners.get(agentIpc.modes)!({}, payload);
  expect(requests).toEqual([{ id, sessionId: "s1" }]);

  bridge.modesResult({ id, bracketedPaste: true });
  bridge.modesResult({ id, error: "unknown-pane" });
  for (const bad of [
    { id, bracketedPaste: "yes" },
    { id, bracketedPaste: true, extra: 1 },
    { id, error: "failed" },
  ])
    expect(() => bridge.modesResult(bad as never)).toThrow(TypeError);
  expect(ipc.send.mock.calls).toEqual([
    [agentIpc.modesResult, { id, bracketedPaste: true }],
    [agentIpc.modesResult, { id, error: "unknown-pane" }],
  ]);
});

it("passes only valid tab requests and bounded tab trees", () => {
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
  const requests: unknown[] = [];
  bridge.onTabs((request) => requests.push(request));
  const id = "00000000-0000-0000-0000-000000000006";
  for (const payload of [{}, { id: "x" }, { id, extra: 1 }, { id }])
    listeners.get(agentIpc.tabs)!({}, payload);
  expect(requests).toEqual([{ id }]);

  const tab = { tab: "t1", title: "zsh", selected: true, panes: ["s1"] };
  bridge.tabsResult({ id, tabs: [tab] });
  bridge.tabsResult({ id, error: "failed" });
  for (const bad of [
    { ...tab, tab: "1" },
    { ...tab, panes: ["pane-1"] },
    { ...tab, title: "x".repeat(MAX_AGENT_TAB_TITLE + 1) },
    { ...tab, selected: "yes" },
    { ...tab, extra: true },
  ])
    expect(() => bridge.tabsResult({ id, tabs: [bad] } as never)).toThrow(
      TypeError,
    );
  expect(() =>
    bridge.tabsResult({ id, tabs: Array(MAX_AGENT_TABS + 1).fill(tab) }),
  ).toThrow(TypeError);
  expect(ipc.send.mock.calls).toEqual([
    [agentIpc.tabsResult, { id, tabs: [tab] }],
    [agentIpc.tabsResult, { id, error: "failed" }],
  ]);
});

it("passes only the tab and pane commands a shortcut runs, never a popup's close", () => {
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
  const requests: unknown[] = [];
  bridge.onAction((request) => requests.push(request));
  const id = "00000000-0000-0000-0000-000000000008";
  for (const command of [
    { action: "open-extension", token: "00000000-0000-0000-0000-000000000001" },
    { action: "close-pane", target: { sessionId: "s1", menuId: 1 } },
    { action: "resolve-close", confirmed: true },
    { action: "split", direction: "left" },
    { action: "close-pane" },
    { action: "select", position: 2 },
  ])
    listeners.get(agentIpc.action)!({}, { id, sessionId: "s1", command });
  expect(requests).toEqual([
    { id, sessionId: "s1", command: { action: "close-pane" } },
    { id, sessionId: "s1", command: { action: "select", position: 2 } },
  ]);

  bridge.actionResult({ id });
  bridge.actionResult({ id, error: "unknown-pane" });
  expect(() => bridge.actionResult({ id, error: "failed" } as never)).toThrow(
    TypeError,
  );
  expect(ipc.send.mock.calls).toEqual([
    [agentIpc.actionResult, { id }],
    [agentIpc.actionResult, { id, error: "unknown-pane" }],
  ]);
});
