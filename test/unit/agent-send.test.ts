import { afterEach, expect, it, vi } from "vitest";
import {
  AgentApiError,
  createAgentCommands,
} from "../../src/main/agent-commands";
import type {
  AgentSessionObserver,
  AgentSessionPort,
} from "../../src/main/terminal-ipc-types";

// send's text, paste and keys (#1109, #1110); the rest of send's checks are
// with the other commands.
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

it("pastes a multi-line text where the program takes a paste, and types it elsewhere with Enter per line", async () => {
  vi.useFakeTimers();
  const window = fakeWindow();
  const bracketed = new Map([
    ["s1", true],
    ["s2", false],
  ]);
  const modes = vi.fn((sessionId: string) =>
    Promise.resolve({ bracketedPaste: bracketed.get(sessionId)! }),
  );
  const commands = createAgentCommands({
    tabs: tabs(),
    sessions: window.sessions,
    read: vi.fn(),
    encode: vi.fn(),
    modes,
  });
  const script = "read x\r\necho $x\nexit";
  const pasted = commands.run(
    "send",
    { pane: "s1", text: script, keys: ["Enter"] },
    caller(),
  );
  await vi.advanceTimersByTimeAsync(1000);
  await expect(pasted).resolves.toEqual({ receipt: "accepted", offset: 0 });
  const typed = commands.run("send", { pane: "s2", text: script }, caller());
  await vi.advanceTimersByTimeAsync(0);
  await expect(typed).resolves.toEqual({ receipt: "accepted", offset: 0 });
  // One line is typed without asking the window.
  await commands.run("send", { pane: "s1", text: "echo hi" }, caller());
  expect(modes.mock.calls.map(([sessionId]) => sessionId)).toEqual([
    "s1",
    "s2",
  ]);
  expect(window.writes).toEqual([
    ["s1", "\x1b[200~read x\r\necho $x\nexit\x1b[201~"],
    ["s1", "\r"],
    // Typed, each line break is the Enter key (#1126).
    ["s2", "read x\recho $x\rexit"],
    ["s1", "echo hi"],
  ]);
});

it("runs a text that ends in one line break, as Enter after it", async () => {
  vi.useFakeTimers();
  const window = fakeWindow();
  const modes = vi.fn((sessionId: string) =>
    Promise.resolve({ bracketedPaste: sessionId === "s1" }),
  );
  const commands = createAgentCommands({
    tabs: tabs(),
    sessions: window.sessions,
    read: vi.fn(),
    encode: vi.fn(),
    modes,
  });
  const send = async (pane: string, text: string, keys?: string[]) => {
    const sent = commands.run(
      "send",
      { pane, text, ...(keys ? { keys } : {}) },
      caller(),
    );
    await vi.advanceTimersByTimeAsync(1000);
    return sent;
  };
  await send("s1", "ls\n");
  // With Enter asked for too, still one Enter.
  await send("s1", "ls\r\n", ["Enter"]);
  await send("s1", "a\nb\n");
  await send("s2", "a\nb\r");
  await send("s1", "\n");
  // Only line breaks left inside the text asked the window.
  expect(modes.mock.calls.map(([sessionId]) => sessionId)).toEqual([
    "s1",
    "s2",
  ]);
  expect(window.writes).toEqual([
    ["s1", "ls"],
    ["s1", "\r"],
    ["s1", "ls"],
    ["s1", "\r"],
    ["s1", "\x1b[200~a\nb\x1b[201~"],
    ["s1", "\r"],
    ["s2", "a\rb"],
    ["s2", "\r"],
    ["s1", "\r"],
  ]);
});

it("writes nothing when a paste can't be framed or the window can't say", async () => {
  const window = fakeWindow();
  const commands = createAgentCommands({
    tabs: tabs(),
    sessions: window.sessions,
    read: vi.fn(),
    encode: vi.fn(),
    modes: vi
      .fn()
      .mockResolvedValueOnce({ bracketedPaste: true })
      .mockRejectedValueOnce(new AgentApiError("unavailable", "slow")),
  });
  const codes = [
    await failure(
      commands.run("send", { pane: "s1", text: "a\n\x1b[201~b" }, caller()),
    ),
    await failure(commands.run("send", { pane: "s1", text: "a\nb" }, caller())),
    // The paste's markers count toward the limit.
    await failure(
      commands.run(
        "send",
        { pane: "s1", text: `a\n${"x".repeat(64 * 1024 - 8)}` },
        caller(),
      ),
    ),
  ];
  expect(codes).toEqual(["invalid-request", "unavailable", "too-large"]);
  expect(window.writes).toEqual([]);
});

it("sends no keys once the grant ends, the agent goes or the pane ends during the gap", async () => {
  vi.useFakeTimers();
  const window = fakeWindow();
  const commands = createAgentCommands({
    tabs: tabs(),
    sessions: window.sessions,
    read: vi.fn(),
    encode: vi.fn(),
  });
  const send = (pane: string, signal = new AbortController().signal) =>
    commands.run("send", { pane, text: "hello", keys: ["Enter"] }, { signal });

  const agent = new AbortController();
  const gone = failure(send("s1", agent.signal));
  await vi.advanceTimersByTimeAsync(0);
  agent.abort(new AgentApiError("unavailable", "The agent went away."));
  expect(await gone).toBe("unavailable");

  const ended = send("s2");
  await vi.advanceTimersByTimeAsync(0);
  window.exit("s2", 0);
  await vi.advanceTimersByTimeAsync(1000);
  // The text was written; the keys weren't.
  await expect(ended).resolves.toEqual({ receipt: "unknown", offset: 0 });

  const revoked = failure(send("s1"));
  // Queued behind it, so it reaches its write after the stop.
  const queued = failure(
    commands.run("send", { pane: "s1", text: "next" }, caller()),
  );
  await vi.advanceTimersByTimeAsync(0);
  commands.dispose();
  await vi.advanceTimersByTimeAsync(1000);
  expect(await revoked).toBe("revoked");
  expect(await queued).toBe("revoked");
  expect(window.writes).toEqual([
    ["s1", "hello"],
    ["s2", "hello"],
    ["s1", "hello"],
  ]);
});

it("keeps a press to the same pane out of a send's gap", async () => {
  vi.useFakeTimers();
  const window = fakeWindow();
  const commands = createAgentCommands({
    tabs: tabs(),
    sessions: window.sessions,
    read: vi.fn(),
    encode: vi.fn(() => Promise.resolve("<Up>")),
  });
  const sent = commands.run(
    "send",
    { pane: "s1", text: "hello", keys: ["Enter"] },
    caller(),
  );
  await vi.advanceTimersByTimeAsync(0);
  const pressed = commands.run("press", { pane: "s1", keys: ["Up"] }, caller());
  // Another pane doesn't wait.
  await commands.run("send", { pane: "s2", keys: ["Tab"] }, caller());
  await vi.advanceTimersByTimeAsync(1000);
  await Promise.all([sent, pressed]);
  expect(window.writes).toEqual([
    ["s1", "hello"],
    ["s2", "\t"],
    ["s1", "\r"],
    ["s1", "<Up>"],
  ]);
});
