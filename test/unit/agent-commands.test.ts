import { afterEach, expect, it, vi } from "vitest";
import {
  AgentApiError,
  createAgentCommands,
} from "../../src/main/agent-commands";
import type {
  AgentSessionObserver,
  AgentSessionPort,
} from "../../src/main/terminal-ipc-types";

afterEach(() => vi.useRealTimers());

// One window with live sessions s1 and s2, driven like the controller would.
function fakeWindow() {
  const positions = new Map([
    ["s1", { sent: 0, acknowledged: 0 }],
    ["s2", { sent: 0, acknowledged: 0 }],
  ]);
  const writes: [string, string][] = [];
  let observer: AgentSessionObserver | undefined;
  const sessions: AgentSessionPort = {
    sessions: () =>
      [...positions.keys()].map((sessionId) => ({
        sessionId: sessionId as `s${number}`,
        focused: sessionId === "s1",
        cols: 80,
        rows: 24,
      })),
    position: (id) => positions.get(id),
    write(id, data) {
      if (!positions.has(id)) return "rejected";
      writes.push([id, data]);
      return "accepted";
    },
    observe(next) {
      observer = next;
      return () => (observer = undefined);
    },
  };
  return {
    sessions,
    writes,
    output(id: string, bytes: number, acknowledged = true) {
      const position = positions.get(id)!;
      position.sent += bytes;
      observer?.output(id as `s${number}`);
      if (acknowledged) this.acknowledge(id);
    },
    acknowledge(id: string) {
      const position = positions.get(id)!;
      position.acknowledged = position.sent;
      observer?.acknowledged(id as `s${number}`);
    },
    exit(id: string, code: number) {
      positions.delete(id);
      observer?.exited(id as `s${number}`, code);
    },
    observed: () => observer !== undefined,
  };
}

// The window's tabs: s1 and s2 side by side in the selected tab, s3 hidden.
const windowTabs = [
  { tab: "t1", title: "zsh", selected: true, panes: ["s1", "s2"] },
  { tab: "t2", title: "vim", selected: false, panes: ["s3"] },
] as const;
const tabs = () => vi.fn(() => Promise.resolve(windowTabs));

const caller = (pane?: string) => ({
  signal: new AbortController().signal,
  ...(pane ? { pane } : {}),
});
const failure = (promise: Promise<unknown>) =>
  promise.then(
    () => undefined,
    (error: unknown) => (error instanceof AgentApiError ? error.code : error),
  );

it("lists the window's tabs with their panes and marks the caller's own", async () => {
  const window = fakeWindow();
  const commands = createAgentCommands({
    sessions: window.sessions,
    read: vi.fn(),
    encode: vi.fn(),
    tabs: tabs(),
  });
  const grid = { cols: 80, rows: 24, live: true };
  await expect(commands.run("list", undefined, caller("s2"))).resolves.toEqual({
    tabs: [
      {
        tab: "t1",
        title: "zsh",
        selected: true,
        panes: [
          { pane: "s1", focused: true, self: false, ...grid },
          { pane: "s2", focused: false, self: true, ...grid },
        ],
      },
      {
        tab: "t2",
        title: "vim",
        selected: false,
        // The window lists it, but its program has ended.
        panes: [{ pane: "s3", focused: false, self: false, live: false }],
      },
    ],
  });
  expect(await failure(commands.run("list", { all: true }, caller()))).toBe(
    "invalid-request",
  );
});

it("lists a tab title as plain text and passes the window's failure on", async () => {
  const window = fakeWindow();
  const asked = vi
    .fn()
    .mockResolvedValueOnce([
      { tab: "t1", title: "a\x1b[2J\nb\u202ec", selected: true, panes: [] },
    ])
    .mockRejectedValueOnce(new AgentApiError("unavailable", "slow"));
  const commands = createAgentCommands({
    sessions: window.sessions,
    read: vi.fn(),
    encode: vi.fn(),
    tabs: asked,
  });
  const listed = (await commands.run("list", undefined, caller())) as {
    tabs: { title: string }[];
  };
  expect(listed.tabs[0]!.title).toBe("a [2J b c");
  expect(await failure(commands.run("list", undefined, caller()))).toBe(
    "unavailable",
  );
});

it("types text and mode-independent keys in one write and returns the offset", async () => {
  const window = fakeWindow();
  window.output("s1", 40);
  const commands = createAgentCommands({
    tabs: tabs(),
    sessions: window.sessions,
    read: vi.fn(),
    encode: vi.fn(),
  });
  await expect(
    commands.run(
      "send",
      { pane: "s1", text: "npm test", keys: ["Enter", "ctrl+c", "Tab"] },
      caller(),
    ),
  ).resolves.toEqual({ receipt: "accepted", offset: 40 });
  expect(window.writes).toEqual([["s1", "npm test\r\x03\t"]]);

  const refusals = await Promise.all([
    failure(commands.run("send", { pane: "s1", keys: ["Up"] }, caller())),
    failure(commands.run("send", { pane: "s1", keys: ["F1"] }, caller())),
    failure(commands.run("send", { pane: "s1" }, caller())),
    failure(commands.run("send", { pane: "s1", text: "" }, caller())),
    failure(
      commands.run("send", { pane: "s1", text: "é".repeat(40_000) }, caller()),
    ),
    failure(commands.run("send", { pane: "s7", text: "x" }, caller())),
    failure(commands.run("send", { pane: "1", text: "x" }, caller())),
    failure(
      commands.run("send", { pane: "s1", text: "x", extra: 1 }, caller()),
    ),
  ]);
  expect(refusals).toEqual([
    "unsupported-key",
    "unsupported-key",
    "invalid-request",
    "invalid-request",
    "too-large",
    "unknown-pane",
    "invalid-request",
    "invalid-request",
  ]);
  expect(window.writes).toHaveLength(1);
});

it("waits for output past the offset to go quiet, and reports time-outs", async () => {
  vi.useFakeTimers();
  const window = fakeWindow();
  const commands = createAgentCommands({
    tabs: tabs(),
    sessions: window.sessions,
    read: vi.fn(),
    encode: vi.fn(),
  });
  const idle = commands.run(
    "wait",
    { pane: "s1", idleMs: 500, timeoutMs: 10_000 },
    caller(),
  );
  let settled: unknown;
  void idle.then((value) => (settled = value));
  // Silence alone isn't idle: nothing new has arrived yet.
  await vi.advanceTimersByTimeAsync(2000);
  expect(settled).toBeUndefined();
  window.output("s1", 10);
  await vi.advanceTimersByTimeAsync(300);
  window.output("s1", 5, false);
  await vi.advanceTimersByTimeAsync(600);
  // Quiet, but the window hasn't consumed the last chunk.
  expect(settled).toBeUndefined();
  window.acknowledge("s1");
  await vi.advanceTimersByTimeAsync(0);
  expect(settled).toEqual({ reason: "idle", offset: 15 });

  const timeout = commands.run(
    "wait",
    { pane: "s1", after: 15, timeoutMs: 1000 },
    caller(),
  );
  await vi.advanceTimersByTimeAsync(1000);
  await expect(timeout).resolves.toEqual({ reason: "timeout", offset: 15 });
});

it("answers exited with the code, during a wait and after it", async () => {
  vi.useFakeTimers();
  const window = fakeWindow();
  const commands = createAgentCommands({
    tabs: tabs(),
    sessions: window.sessions,
    read: vi.fn(),
    encode: vi.fn(),
  });
  const waiting = commands.run(
    "wait",
    { pane: "s2", timeoutMs: 5000 },
    caller(),
  );
  await vi.advanceTimersByTimeAsync(0);
  window.output("s2", 3);
  window.exit("s2", 42);
  await expect(waiting).resolves.toEqual({
    reason: "exited",
    offset: 3,
    exitCode: 42,
  });
  await expect(
    commands.run("wait", { pane: "s2", timeoutMs: 5000 }, caller()),
  ).resolves.toEqual({ reason: "exited", offset: 3, exitCode: 42 });
  expect(
    await failure(commands.run("send", { pane: "s2", text: "x" }, caller())),
  ).toBe("not-live");
});

it("refuses what later versions add and out-of-range limits", async () => {
  const window = fakeWindow();
  const commands = createAgentCommands({
    tabs: tabs(),
    sessions: window.sessions,
    read: vi.fn(),
    encode: vi.fn(),
  });
  const codes = await Promise.all(
    [
      { pane: "s1", timeoutMs: 1000, match: "done" },
      { pane: "s1" },
      { pane: "s1", timeoutMs: 600_001 },
      { pane: "s1", timeoutMs: 1000, idleMs: 50 },
      { pane: "s1", timeoutMs: 1000, after: 99 },
    ].map((args) => failure(commands.run("wait", args, caller()))),
  );
  expect(codes).toEqual(Array(5).fill("invalid-request"));
  const reads = await Promise.all(
    [
      { pane: "s1", source: "command" },
      { pane: "s1", source: "screen", lines: 5 },
      { pane: "s1", lines: 10_001 },
    ].map((args) => failure(commands.run("read", args, caller()))),
  );
  expect(reads).toEqual(Array(3).fill("invalid-request"));
});

it("reads after the window caught up and reports the consumed offset", async () => {
  vi.useFakeTimers();
  const window = fakeWindow();
  const read = vi.fn(async () => ({
    text: "$ echo hi\nhi",
    truncated: false,
    cols: 80,
    rows: 24,
  }));
  const commands = createAgentCommands({
    tabs: tabs(),
    sessions: window.sessions,
    read,
    encode: vi.fn(),
  });
  window.output("s1", 12, false);
  const result = commands.run("read", { pane: "s1", lines: 2 }, caller());
  await vi.advanceTimersByTimeAsync(100);
  expect(read).not.toHaveBeenCalled();
  window.acknowledge("s1");
  await expect(result).resolves.toEqual({
    text: "$ echo hi\nhi",
    cols: 80,
    rows: 24,
    offset: 12,
    truncated: false,
  });
  expect(read).toHaveBeenCalledWith(
    "s1",
    { source: "tail", lines: 2 },
    expect.any(AbortSignal),
  );
  await expect(
    commands.run("read", { pane: "s1", source: "screen" }, caller()),
  ).resolves.toMatchObject({ offset: 12 });
  expect(read).toHaveBeenLastCalledWith(
    "s1",
    { source: "screen" },
    expect.any(AbortSignal),
  );
  await commands.run("read", { pane: "s1", source: "tail" }, caller());
  expect(read).toHaveBeenLastCalledWith(
    "s1",
    { source: "tail", lines: 200 },
    expect.any(AbortSignal),
  );
});

it("ends a pending wait when the caller goes away and stops observing on dispose", async () => {
  const window = fakeWindow();
  const commands = createAgentCommands({
    tabs: tabs(),
    sessions: window.sessions,
    read: vi.fn(),
    encode: vi.fn(),
  });
  const controller = new AbortController();
  const waiting = commands.run(
    "wait",
    { pane: "s1", timeoutMs: 60_000 },
    { signal: controller.signal },
  );
  await Promise.resolve();
  controller.abort(new AgentApiError("revoked", "stopped"));
  expect(await failure(waiting)).toBe("revoked");
  commands.dispose();
  expect(window.observed()).toBe(false);
});

it("presses named keys with the window's bytes for the pane, after it caught up", async () => {
  vi.useFakeTimers();
  const window = fakeWindow();
  // Stands in for the Surface: the bytes depend on the chord, not on main.
  const encode = vi.fn(
    async (_id: string, keys: readonly { key: string; ctrl: boolean }[]) =>
      keys.map((key) => `<${key.ctrl ? "C-" : ""}${key.key}>`).join(""),
  );
  const commands = createAgentCommands({
    tabs: tabs(),
    sessions: window.sessions,
    read: vi.fn(),
    encode,
  });
  window.output("s2", 30, false);
  const pressed = commands.run(
    "press",
    { pane: "s2", keys: ["up", "Ctrl+Shift+F5", "SPACE"] },
    caller(),
  );
  await vi.advanceTimersByTimeAsync(100);
  expect(encode).not.toHaveBeenCalled();
  window.acknowledge("s2");
  await expect(pressed).resolves.toEqual({ receipt: "accepted", offset: 30 });
  expect(encode).toHaveBeenCalledWith(
    "s2",
    [
      { key: "Up", ctrl: false, alt: false, shift: false },
      { key: "F5", ctrl: true, alt: false, shift: true },
      { key: "Space", ctrl: false, alt: false, shift: false },
    ],
    expect.any(AbortSignal),
  );
  expect(window.writes).toEqual([["s2", "<Up><C-F5><Space>"]]);
});

it("refuses keys press can't name and never writes for them", async () => {
  const window = fakeWindow();
  const encode = vi.fn(async () => "x");
  const commands = createAgentCommands({
    tabs: tabs(),
    sessions: window.sessions,
    read: vi.fn(),
    encode,
  });
  const codes = await Promise.all(
    [
      { pane: "s1", keys: ["a"] },
      { pane: "s1", keys: ["Cmd+Up"] },
      { pane: "s1", keys: ["F13"] },
      { pane: "s1", keys: ["Ctrl+Ctrl+Up"] },
      { pane: "s1", keys: ["Up+Ctrl"] },
      { pane: "s1", keys: [] },
      { pane: "s1", keys: Array(65).fill("Up") },
      { pane: "s1", keys: "Up" },
      { pane: "s1" },
      { pane: "s9", keys: ["Up"] },
    ].map((args) => failure(commands.run("press", args, caller()))),
  );
  expect(codes).toEqual([
    "unsupported-key",
    "unsupported-key",
    "unsupported-key",
    "unsupported-key",
    "unsupported-key",
    "invalid-request",
    "invalid-request",
    "invalid-request",
    "invalid-request",
    "unknown-pane",
  ]);
  expect(encode).not.toHaveBeenCalled();
  expect(window.writes).toEqual([]);
});

it("writes nothing when the grant ends while the window encodes", async () => {
  const window = fakeWindow();
  let answer!: (bytes: string) => void;
  const commands = createAgentCommands({
    tabs: tabs(),
    sessions: window.sessions,
    read: vi.fn(),
    encode: () => new Promise<string>((resolve) => (answer = resolve)),
  });
  const pressed = commands.run("press", { pane: "s1", keys: ["Up"] }, caller());
  await vi.waitFor(() => expect(answer).toBeDefined());
  commands.dispose();
  answer("\x1b[A");
  expect(await failure(pressed)).toBe("revoked");
  expect(window.writes).toEqual([]);
});

it("refuses Ctrl+Space on macOS, where the user's press sends nothing", async () => {
  const run = (platform: string, key: string) => {
    const window = fakeWindow();
    const commands = createAgentCommands({
      tabs: tabs(),
      sessions: window.sessions,
      read: vi.fn(),
      encode: async () => "x",
      platform,
    });
    return failure(
      commands.run("press", { pane: "s1", keys: [key] }, caller()),
    );
  };
  expect(await run("darwin", "Ctrl+Space")).toBe("unsupported-key");
  expect(await run("darwin", "Ctrl+Alt+Space")).toBe("unsupported-key");
  expect(await run("darwin", "Alt+Space")).toBeUndefined();
  expect(await run("linux", "Ctrl+Space")).toBeUndefined();
});
