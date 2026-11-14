import { afterEach, expect, it, vi } from "vitest";
import {
  AgentApiError,
  agentKeysGapMs,
  createAgentCommands,
  NO_COMMAND_MARKS_QUIET_MS,
} from "../../src/main/agent-commands";
import { createCommandMarks } from "../../src/main/command-marks";
import type {
  AgentSessionObserver,
  AgentSessionPort,
} from "../../src/main/terminal-ipc-types";

// `wait` with `commandEnd` (ADR 0054) on one pane, s1, whose output the test
// prints. Main reads the marks as the output arrives; the window shows it
// when the test says so.
afterEach(() => vi.useRealTimers());

const prompt = "\x1b]133;A\x07$ ";
const ran = (code: number, output = "") =>
  `\r\n\x1b]133;C\x07${output}\x1b]133;D;${code}\x07${prompt}`;

function pane() {
  let sent = 0;
  let acknowledged = 0;
  let live = true;
  let observer: AgentSessionObserver | undefined;
  const marks = createCommandMarks();
  const sessions: AgentSessionPort = {
    sessions: () =>
      live ? [{ sessionId: "s1", focused: true, cols: 80, rows: 24 }] : [],
    position: (id) =>
      id === "s1" && live ? { sent, acknowledged } : undefined,
    write: () => "accepted",
    observe(next) {
      observer = next;
      return () => (observer = undefined);
    },
    reportsCommands: marks.reports,
    commandEnd: marks.endAfter,
  };
  const commands = createAgentCommands({
    tabs: vi.fn(),
    sessions,
    read: vi.fn(async () => ({
      text: "",
      cols: 80,
      rows: 24,
      truncated: false,
    })),
    encode: vi.fn(async () => ""),
  });
  const show = () => {
    acknowledged = sent;
    observer?.acknowledged("s1");
  };
  return {
    // The program prints; the window shows it unless told otherwise.
    print(data: string, shown = true) {
      sent += Buffer.byteLength(data, "utf8");
      marks.observe("s1", data, sent);
      observer?.output("s1");
      if (shown) show();
    },
    show,
    position: () => sent,
    exit(code: number) {
      live = false;
      observer?.exited("s1", code);
    },
    async send(text: string) {
      const result = commands.run("send", { pane: "s1", text }, caller());
      await vi.advanceTimersByTimeAsync(agentKeysGapMs(text.length));
      return ((await result) as { offset: number }).offset;
    },
    wait(args: object) {
      const state: { value?: unknown; error?: unknown } = {};
      void commands.run("wait", { pane: "s1", ...args }, caller()).then(
        (value) => (state.value = value),
        (error: unknown) =>
          (state.error = error instanceof AgentApiError ? error.code : error),
      );
      return state;
    },
  };
}

const caller = () => ({ signal: new AbortController().signal });

it("answers the end of the command typed past after, with its exit code", async () => {
  vi.useFakeTimers();
  const p = pane();
  p.print(prompt);
  const after = await p.send("make test\r");
  const state = p.wait({ after, commandEnd: true, timeoutMs: 60_000 });
  p.print("make test\r\n\x1b]133;C\x07compiling\r\n");
  // A quiet stretch is not the end: idleness doesn't count by default.
  await vi.advanceTimersByTimeAsync(5000);
  expect(state.value).toBeUndefined();
  // Main has the mark; the answer waits until the window shows it.
  p.print("2 failed\r\n\x1b]133;D;2\x07" + prompt, false);
  const ended = p.position();
  await vi.advanceTimersByTimeAsync(100);
  expect(state.value).toBeUndefined();
  p.show();
  await vi.advanceTimersByTimeAsync(0);
  expect(state.value).toEqual({
    reason: "command-end",
    exitCode: 2,
    offset: ended,
  });
});

it("finds an end that came before the wait, never one from before after", async () => {
  vi.useFakeTimers();
  const p = pane();
  p.print(prompt + "true" + ran(0));
  const after = await p.send("false\r");
  // A fast command ends before the wait arrives.
  p.print("false" + ran(1));
  const state = p.wait({ after, commandEnd: true, timeoutMs: 1000 });
  await vi.advanceTimersByTimeAsync(0);
  expect(state.value).toMatchObject({ reason: "command-end", exitCode: 1 });

  const now = p.wait({ commandEnd: true, timeoutMs: 1000 });
  await vi.advanceTimersByTimeAsync(1000);
  expect(now.value).toMatchObject({ reason: "timeout" });
});

it("answers a wait again after a timeout, from now", async () => {
  vi.useFakeTimers();
  const p = pane();
  p.print(prompt);
  const after = await p.send("make\r");
  p.print("make\r\n\x1b]133;C\x07building\r\n");
  const first = p.wait({ after, commandEnd: true, timeoutMs: 1000 });
  await vi.advanceTimersByTimeAsync(1000);
  expect(first.value).toMatchObject({ reason: "timeout" });
  // Asked again with no after, the running command's end still answers.
  const again = p.wait({ commandEnd: true, timeoutMs: 1000 });
  await vi.advanceTimersByTimeAsync(0);
  p.print("\x1b]133;D;0\x07" + prompt);
  await vi.advanceTimersByTimeAsync(0);
  expect(again.value).toMatchObject({ reason: "command-end", exitCode: 0 });
});

it("leaves out the exit code a shell didn't report", async () => {
  vi.useFakeTimers();
  const p = pane();
  p.print(prompt);
  const after = await p.send("ls\r");
  p.print("ls\r\n\x1b]133;C\x07a b\r\n\x1b]133;D\x07" + prompt);
  const state = p.wait({ after, commandEnd: true, timeoutMs: 1000 });
  await vi.advanceTimersByTimeAsync(0);
  expect(state.value).toEqual({ reason: "command-end", offset: p.position() });
});

it("says so within a second when the shell reports no commands", async () => {
  vi.useFakeTimers();
  const p = pane();
  p.print("$ ");
  const after = await p.send("make\r");
  const state = p.wait({ after, commandEnd: true, timeoutMs: 60_000 });
  p.print("make\r\nbuilding\r\n");
  await vi.advanceTimersByTimeAsync(NO_COMMAND_MARKS_QUIET_MS - 100);
  expect(state.error).toBeUndefined();
  await vi.advanceTimersByTimeAsync(200);
  expect(state.error).toBe("no-command-marks");
});

it("answers exited when the pane ends first, and checks commandEnd", async () => {
  vi.useFakeTimers();
  const p = pane();
  p.print(prompt);
  const after = await p.send("vim\r");
  const state = p.wait({ after, commandEnd: true, timeoutMs: 60_000 });
  p.print("vim\r\n\x1b]133;C\x07");
  p.exit(0);
  await vi.advanceTimersByTimeAsync(0);
  expect(state.value).toMatchObject({ reason: "exited", exitCode: 0 });

  const bad = pane();
  const refused = bad.wait({ commandEnd: "yes", timeoutMs: 1000 });
  await vi.advanceTimersByTimeAsync(0);
  expect(refused.error).toBe("invalid-request");
});
