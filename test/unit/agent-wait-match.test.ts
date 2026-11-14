import { afterEach, expect, it, vi } from "vitest";
import {
  AgentApiError,
  agentKeysGapMs,
  createAgentCommands,
} from "../../src/main/agent-commands";
import type {
  AgentSessionObserver,
  AgentSessionPort,
} from "../../src/main/terminal-ipc-types";

// `wait` with `match` (ADR 0052) against one pane, s1, whose screen the test
// sets. A read answers the screen as it is when asked; a write lands on it at
// once (typed: echoed), as a fast terminal and program would.
afterEach(() => vi.useRealTimers());

function pane(initial: string) {
  let sent = 0;
  let live = true;
  let observer: AgentSessionObserver | undefined;
  const screen = { text: initial, alternate: false, cols: 80, rows: 24 };
  const state = {
    onWrite: (data: string) => {
      screen.text += data.replace(/\r/gu, "\n");
    },
  };
  const sessions: AgentSessionPort = {
    sessions: () =>
      live ? [{ sessionId: "s1", focused: true, cols: 80, rows: 24 }] : [],
    position: (id) =>
      id === "s1" && live ? { sent, acknowledged: sent } : undefined,
    write(_id, data) {
      state.onWrite(data);
      return "accepted";
    },
    observe(next) {
      observer = next;
      return () => (observer = undefined);
    },
  };
  const read = vi.fn(
    async (_id: string, _read: object, _signal: AbortSignal) => ({
      ...screen,
      truncated: false,
    }),
  );
  const commands = createAgentCommands({
    tabs: vi.fn(),
    sessions,
    read,
    encode: vi.fn(async () => "\x1b[6~"),
  });
  return {
    commands,
    read,
    state,
    // The program prints: the screen changes and the window shows it.
    print(text = screen.text, changes: Partial<typeof screen> = {}) {
      Object.assign(screen, { text }, changes);
      sent += 10;
      observer?.output("s1");
      observer?.acknowledged("s1");
    },
    exit(code: number) {
      live = false;
      observer?.exited("s1", code);
    },
    // A final \r is an Enter written after send's gap.
    async send(text: string) {
      const sent = commands.run("send", { pane: "s1", text }, signal());
      if (text.endsWith("\r"))
        await vi.advanceTimersByTimeAsync(agentKeysGapMs(text.length));
      return ((await sent) as { offset: number }).offset;
    },
    wait(args: object, caller = signal()) {
      const state: { value?: unknown } = {};
      const result = commands.run("wait", { pane: "s1", ...args }, caller);
      void result.then(
        (value) => (state.value = value),
        () => undefined,
      );
      return { result, state };
    },
  };
}

const signal = (controller = new AbortController()) => ({
  signal: controller.signal,
});
const failure = (promise: Promise<unknown>) =>
  promise.then(
    () => undefined,
    (error: unknown) => (error instanceof AgentApiError ? error.code : error),
  );

it("matches new text past a send, never an old copy or the echo", async () => {
  vi.useFakeTimers();
  const p = pane("$ npm test\nTests passed\n$ ");
  const after = await p.send("npm test\r");
  p.print();
  const { state } = p.wait({ after, match: "Tests passed", timeoutMs: 10_000 });
  await vi.advanceTimersByTimeAsync(2000);
  expect(state.value).toBeUndefined();
  // The old copy scrolls off, so a new one counts though the total is one.
  p.print("$ npm test\nrunning");
  await vi.advanceTimersByTimeAsync(100);
  expect(state.value).toBeUndefined();
  p.print("$ npm test\nrunning\nTests passed");
  await vi.advanceTimersByTimeAsync(100);
  expect(state.value).toEqual({ reason: "match", offset: 30 });
});

it("reads the screen before it writes, for send and for press", async () => {
  vi.useFakeTimers();
  const p = pane("$ ");
  // The program answers as the Enter arrives.
  p.state.onWrite = (data) => {
    if (data === "\r") p.print("$ make\ndone");
  };
  const sent = await p.send("make\r");
  const typed = p.wait({ after: sent, match: "done", timeoutMs: 1000 });
  await vi.advanceTimersByTimeAsync(1000);
  expect(typed.state.value).toEqual({ reason: "match", offset: 10 });
  p.state.onWrite = () => p.print("done\ndone");
  const pressed = (await p.commands.run(
    "press",
    { pane: "s1", keys: ["PageDown"] },
    signal(),
  )) as { offset: number };
  const keyed = p.wait({
    after: pressed.offset,
    match: "done",
    timeoutMs: 1000,
  });
  await vi.advanceTimersByTimeAsync(1000);
  expect(keyed.state.value).toEqual({ reason: "match", offset: 20 });
});

it("takes the count from the first look when the screen at after is unknown", async () => {
  vi.useFakeTimers();
  const p = pane("done\n$ ");
  // The send's own read fails, so there is no screen for its offset.
  p.read.mockRejectedValueOnce(new AgentApiError("unavailable", "slow"));
  const after = await p.send("make\r");
  p.print();
  const failed = p.wait({ after, match: "done", timeoutMs: 10_000 });
  await vi.advanceTimersByTimeAsync(100);
  expect(failed.state.value).toBeUndefined();
  p.print("done\n$ make\ndone");
  await vi.advanceTimersByTimeAsync(100);
  expect(failed.state.value).toEqual({ reason: "match", offset: 20 });

  // No send returned 5: the copies already there don't count either.
  const unknown = p.wait({ after: 5, match: "done", timeoutMs: 500 });
  p.print();
  await vi.advanceTimersByTimeAsync(500);
  expect(unknown.state.value).toEqual({ reason: "timeout", offset: 30 });
});

it("counts each screen apart, so a screen that comes back isn't new", async () => {
  vi.useFakeTimers();
  // The main screen shows an old result; a commit editor is open on top.
  const p = pane("2 files changed\n$ git commit");
  p.print("# Please enter the commit message", { alternate: true });
  const after = await p.send(":wq\r");
  const editor = p.wait({ after, match: "files changed", timeoutMs: 10_000 });
  // The editor quits and the main screen comes back as it was.
  p.print("2 files changed\n$ git commit", { alternate: false });
  await vi.advanceTimersByTimeAsync(100);
  expect(editor.state.value).toBeUndefined();
  p.print("2 files changed\n$ git commit\n1 files changed");
  await vi.advanceTimersByTimeAsync(100);
  expect(editor.state.value).toEqual({ reason: "match", offset: 30 });

  // A full-screen program started since `after` draws on an empty screen.
  const before = await p.send("less notes\r");
  const pager = p.wait({
    after: before,
    match: "files changed",
    timeoutMs: 1000,
  });
  p.print("1 files changed\n:", { alternate: true });
  await vi.advanceTimersByTimeAsync(100);
  expect(pager.state.value).toEqual({ reason: "match", offset: 40 });
});

it("starts the count again when the pane is resized", async () => {
  vi.useFakeTimers();
  const p = pane("ok-ok\n$ ");
  const after = await p.send("x\r");
  const { state } = p.wait({ after, match: "ok", timeoutMs: 10_000 });
  // Rows reflow at the new width, and the same text reads differently.
  p.print("ok-\nok\n$ x\nok", { cols: 3 });
  await vi.advanceTimersByTimeAsync(100);
  expect(state.value).toBeUndefined();
  p.print("ok-\nok\n$ x\nok\nok");
  await vi.advanceTimersByTimeAsync(100);
  expect(state.value).toEqual({ reason: "match", offset: 20 });
});

it("waits for a match until it times out or the program ends", async () => {
  vi.useFakeTimers();
  const p = pane("$ ");
  const timeout = p.wait({ match: "never", timeoutMs: 1000 });
  await vi.advanceTimersByTimeAsync(0);
  p.print("$ sleep 1");
  // With only match, a quiet pane isn't an answer.
  await vi.advanceTimersByTimeAsync(1000);
  expect(timeout.state.value).toEqual({ reason: "timeout", offset: 10 });

  const exited = p.wait({ match: "never", timeoutMs: 5000 });
  await vi.advanceTimersByTimeAsync(0);
  p.exit(1);
  await expect(exited.result).resolves.toEqual({
    reason: "exited",
    offset: 10,
    exitCode: 1,
  });
});

it("answers whichever of match and idle comes first", async () => {
  vi.useFakeTimers();
  const p = pane("$ ");
  const idle = p.wait({ match: "ok", idleMs: 500, timeoutMs: 10_000 });
  await vi.advanceTimersByTimeAsync(0);
  p.print("$ spin");
  await vi.advanceTimersByTimeAsync(600);
  expect(idle.state.value).toEqual({ reason: "idle", offset: 10 });

  const match = p.wait({ match: "ok", idleMs: 5000, timeoutMs: 10_000 });
  await vi.advanceTimersByTimeAsync(0);
  p.print("$ spin\nok");
  await vi.advanceTimersByTimeAsync(100);
  expect(match.state.value).toEqual({ reason: "match", offset: 20 });
});

it("stops looking when the grant ends, even with a look due", async () => {
  vi.useFakeTimers();
  const p = pane("$ ");
  const controller = new AbortController();
  const { result } = p.wait(
    { match: "ok", timeoutMs: 60_000 },
    signal(controller),
  );
  await vi.advanceTimersByTimeAsync(0);
  p.print("$ a");
  await vi.advanceTimersByTimeAsync(0);
  // Output again within the look gap: the next look waits for a timer.
  p.print("$ a\nb");
  await vi.advanceTimersByTimeAsync(0);
  const looks = p.read.mock.calls.length;
  controller.abort(new AgentApiError("revoked", "stopped"));
  expect(await failure(result)).toBe("revoked");
  await vi.advanceTimersByTimeAsync(1000);
  expect(p.read).toHaveBeenCalledTimes(looks);

  // Ending the grant also drops the screens kept for sends.
  await p.send("x\r");
  const remembered = p.read.mock.lastCall![2];
  p.commands.dispose();
  expect(remembered.aborted).toBe(true);
});

it("ends a match wait with the window's failure to read the screen", async () => {
  vi.useFakeTimers();
  const p = pane("$ ");
  const { result } = p.wait({ match: "ok", timeoutMs: 60_000 });
  await vi.advanceTimersByTimeAsync(0);
  p.read.mockRejectedValueOnce(new AgentApiError("unavailable", "slow"));
  p.print("$ a");
  expect(await failure(result)).toBe("unavailable");
});
