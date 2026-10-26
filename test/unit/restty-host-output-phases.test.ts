import type { BrowserWindow } from "electron";
import { writeSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { afterEach, expect, it, vi } from "vitest";
import {
  createLocalTerminalSession,
  type SpawnPty,
} from "../../src/main/local-terminal-session";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import type {
  IpcListener,
  IpcMainPort,
} from "../../src/main/terminal-ipc-types";
import { createOutputStressHarness } from "../fixtures/restty-host-output-stress";
import { outputCheckpointProducer } from "../fixtures/restty-output-checkpoint";
import {
  prepareOutputRefit,
  outputRefitProducer,
} from "../fixtures/restty-output-refit";
import { createFixtureMetricReplyRouter } from "../fixtures/restty-host-metric-replies";

vi.mock("node:fs", { spy: true });
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

async function exerciseOutput(
  mode:
    | "acknowledged"
    | "withheld"
    | "counter-only"
    | "refit-fragmented"
    | "refit-no-r"
    | "refit-no-end"
    | "refit-no-exit"
    | "refit-resize-failure"
    | "refit-write-failure",
) {
  vi.useFakeTimers();
  const lines: string[] = [];
  vi.mocked(writeSync).mockImplementation((_fd, value) => {
    lines.push(String(value));
    return 0;
  });
  const refit = mode.startsWith("refit-");
  const checkpoints = mode === "acknowledged" ? 16 : 1;
  const harness = createOutputStressHarness({
    sessionIndex: 0,
    checkpoints,
    controlledRefit: refit,
  });
  const continuation: string[] = [];
  const calls = { copies: 0, exitRequests: 0 };
  const sizes = [{ cols: 80, rows: 24 }];
  let resizeCalls = 0;
  let acknowledge!: IpcListener;
  const port = harness.ipcPort({
    on(_channel, listener) {
      acknowledge = listener;
    },
  } as IpcMainPort);
  let sourceBytes = 0,
    acceptedEnd = 0,
    transcript = "",
    queued = "";
  let exiting = false;
  let exitCode: number | undefined;
  let onData!: (data: string) => void;
  let onExit!: (exit: { exitCode: number; signal: number }) => void;
  let input!: (data: Buffer) => void;
  const flush = () => {
    const text = queued;
    queued = "";
    if (text) onData(text);
  };
  const terminal = createLocalTerminalSession(
    () =>
      ({
        onData(listener: typeof onData) {
          onData = listener;
          return { dispose() {} };
        },
        onExit(listener: typeof onExit) {
          onExit = listener;
          return { dispose() {} };
        },
        write(text: string) {
          if (text === "r" && mode === "refit-write-failure")
            throw new Error("controlled continuation write failed");
          exiting = text === "x";
          if (exiting) calls.exitRequests++;
          const suppress =
            (text === "r" && mode === "refit-no-r") ||
            (exiting && mode === "refit-no-exit");
          input(
            Buffer.from(
              (refit ? "\u001b[?1;2c\u001b[12;34R\u001b[6;16;8t" : "") +
                (suppress ? "" : text),
            ),
          );
          if (refit && text === "r") {
            if (mode === "refit-no-end") queued = queued.slice(0, -24);
            for (let at = 0; at < queued.length; at += 47)
              continuation.push(queued.slice(at, at + 47));
            queued = ""; // Only release controlled continuation after write returns.
          }
          if (exiting && exitCode !== undefined)
            queued += "\u001b[?1004l\u001b[?9001l";
          flush();
          if (exitCode !== undefined) onExit({ exitCode, signal: 0 });
        },
        pause() {},
        resume() {},
        kill() {},
        resize() {
          if (++resizeCalls === 3 && mode === "refit-resize-failure")
            throw new Error("controlled resize failure");
        },
      }) as unknown as ReturnType<SpawnPty>,
    {
      shell: "controlled",
      platform: "linux",
      homeDirectory: "/synthetic",
      applicationVersionProvider: { getVersion: () => "0.0.0" },
      environment: {},
      onOutput(text) {
        sourceBytes += Buffer.byteLength(text);
        transcript += text;
        harness.observeOutput(0, text);
        if (!exiting || mode !== "withheld")
          acknowledge({} as never, { sessionId: "s1", end: sourceBytes });
      },
      onExit: (exit) => harness.observeExit(0, exit),
      onResizeFailure: (reason) => harness.observeResizeFailure(0, reason),
    },
  );
  port.on(terminalIpc.outputAck, (_event, payload) => {
    const end = (payload as { end: number }).end;
    if (exiting && mode === "counter-only") return;
    expect(terminal.acknowledgeOutput!(end - acceptedEnd)).toBe(true);
    acceptedEnd = end;
  });
  const { terminal: routedTerminal } = createFixtureMetricReplyRouter(
    terminal,
    () => {},
    {
      inputs: [],
      resizes: sizes,
      onResize: (status) => harness.observeResize(0, status),
    },
  );
  runInNewContext(
    refit
      ? outputRefitProducer(checkpoints)
      : outputCheckpointProducer(checkpoints),
    {
      process: {
        stdin: {
          isTTY: false,
          on(_event: string, listener: typeof input) {
            input = listener;
          },
          resume() {},
        },
        stdout: {
          write(text: string, done?: () => void) {
            queued += text;
            done?.();
            return true;
          },
        },
        exit(code: number) {
          exitCode = code;
        },
      },
    },
  );
  flush();
  let maxWidth = "";
  const surface = {
    getBoundingClientRect: () => ({ width: 800 }),
    style: {
      get maxWidth() {
        return maxWidth;
      },
      set maxWidth(value: string) {
        maxWidth = value;
        routedTerminal.resize({ cols: value ? 60 : 80, rows: 24 });
      },
    },
  };
  const window = {
    getBounds: () => ({ width: 900, height: 600, x: 0, y: 0 }),
    setBounds() {
      sizes.push({ cols: 82, rows: 24 });
    },
    webContents: {
      async executeJavaScript(script: string) {
        if (script.includes("scrollbackLines")) return 10000;
        if (script.includes("usedJSHeapSize")) return 123;
        if (script.includes("surface"))
          return runInNewContext(script, {
            document: { querySelector: () => surface },
          }) as unknown;
        return undefined; // Adapt the existing renderer stall, not its ordering.
      },
      send(_channel: string, action: string) {
        if (action === "copy") {
          calls.copies++;
          harness.observeClipboard(transcript);
        }
      },
    },
  };
  const exercise = harness.exercise({
    window: window as unknown as BrowserWindow,
    terminals: [routedTerminal],
    resizes: [sizes],
    launchKinds: ["explicit-command"],
    existingSession: true,
    async waitFor(predicate, label) {
      if (await predicate()) return;
      while (continuation.length) {
        await Promise.resolve();
        onData(continuation.shift()!);
        if (await predicate()) return;
      }
      throw new Error(`Not ready: ${label}`);
    },
  });
  void exercise.catch(() => {});
  await vi.advanceTimersByTimeAsync(500);
  return { exercise, lines, calls };
}

it.each(["withheld", "counter-only"] as const)(
  "rejects an exit trailer with %s ACK even after all copies and pre-exit settlement",
  async (mode) => {
    const { exercise } = await exerciseOutput(mode);
    await expect(exercise).rejects.toThrow(
      mode === "withheld"
        ? "Output ACK cumulative end differs"
        : "Output actual pending bytes remain",
    );
  },
);

it("records each actual source/ACK/copy checkpoint without replacing the output oracle", async () => {
  const { exercise, lines } = await exerciseOutput("acknowledged");
  const result = await exercise;
  expect(result.source.bytes).toBe(2_097_998);
  expect(result.source.envelopeBytes).toBe(46);
  expect(result.flow.pendingBytes).toBe(0);
  expect(result.destination.checkpoints).toHaveLength(16);
  expect(result.destination.records).toBe(65536);
  const records = lines.map(
    (line) =>
      JSON.parse(line.slice("__OMXTERM_RESTTY_HOST_PHASE__".length)) as {
        phase: string;
        status: string;
        checkpoint?: number;
      },
  );
  expect(
    records
      .filter((r) => r.phase.startsWith("checkpoint-"))
      .map((r) => [r.phase, r.status, r.checkpoint]),
  ).toEqual(
    Array.from({ length: 16 }, (_, checkpoint) => [
      ["checkpoint-source", "begin", checkpoint],
      ["checkpoint-source", "complete", checkpoint],
      ["checkpoint-ack", "begin", checkpoint],
      ["checkpoint-ack", "complete", checkpoint],
      ["checkpoint-copy", "begin", checkpoint],
      ["checkpoint-copy", "complete", checkpoint],
    ]).flat(),
  );
  expect(records.at(-1)).toMatchObject({
    phase: "output-producer-exit",
    status: "complete",
  });
  expect(lines.every((line) => line.length < 256)).toBe(true);
});

it("records first delayed continuation after the actual refit producer write returns, without losing exact framing or ACKs", async () => {
  const { exercise, lines, calls } = await exerciseOutput("refit-fragmented");
  const result = await exercise;
  expect(result.source).toMatchObject({
    framedBytes: 131_122,
    envelopeBytes: 46,
    finalized: true,
  });
  expect(result.controlledRefit!.prefixAcknowledgement).toMatchObject({
    pendingBytes: 0,
    cumulativeAck: result.controlledRefit!.prefixAcknowledgement.sourceBytes,
  });
  expect(result.flow.pendingBytes).toBe(0);
  expect(calls).toEqual({ copies: 1, exitRequests: 1 });
  const entered = lines.findIndex((line) =>
    line.includes('"phase":"refit-continuation-write","status":"begin"'),
  );
  const returned = lines.findIndex((line) =>
    line.includes('"phase":"refit-continuation-write","status":"complete"'),
  );
  const firstOutput = lines.findIndex((line) =>
    line.includes('"phase":"continuation-output"'),
  );
  expect(entered).toBeGreaterThanOrEqual(0);
  expect(returned).toBeGreaterThan(entered);
  expect(firstOutput).toBeGreaterThan(returned);
  expect(
    lines.filter((line) => line.includes('"phase":"continuation-output"')),
  ).toHaveLength(1);
  const metadata = JSON.parse(
    lines[firstOutput]!.slice("__OMXTERM_OUTPUT_REFIT_PROGRESS__".length),
  ) as Record<string, number>;
  const prefix = result.controlledRefit!.prefixAcknowledgement.sourceBytes;
  expect(metadata).toMatchObject({
    sourceBytes: prefix + 47,
    cumulativeAck: prefix,
    checkpoints: 0,
    pendingBytes: 47,
    pauseCount: 1,
    resumeCount: 1,
  });
  expect(
    lines.filter((line) => line.includes('"phase":"refit-resize-call"')),
  ).toHaveLength(2);
});

it.each(["refit-no-r", "refit-no-end", "refit-no-exit"] as const)(
  "does not substitute copy/exit success for %s at the composed producer/harness seam",
  async (mode) => {
    const { exercise, calls, lines } = await exerciseOutput(mode);
    await expect(exercise).rejects.toThrow(
      mode === "refit-no-exit"
        ? "output producer clean exit"
        : "source checkpoint 0",
    );
    expect(calls).toEqual(
      mode === "refit-no-exit"
        ? { copies: 1, exitRequests: 1 }
        : { copies: 0, exitRequests: 0 },
    );
    expect(
      lines.filter((line) => line.includes('"phase":"continuation-failure"')),
    ).toHaveLength(1);
  },
);

it("retains entered-without-returned continuation and one failure snapshot when the write throws", async () => {
  const { exercise, calls, lines } = await exerciseOutput(
    "refit-write-failure",
  );
  await expect(exercise).rejects.toThrow(
    "controlled continuation write failed",
  );
  expect(calls).toEqual({ copies: 0, exitRequests: 0 });
  expect(
    lines.filter((line) => line.includes('"phase":"refit-continuation-write"')),
  ).toHaveLength(1);
  expect(
    lines.find((line) => line.includes('"phase":"refit-continuation-write"')),
  ).toContain('"status":"begin"');
  expect(
    lines.filter((line) => line.includes('"phase":"continuation-failure"')),
  ).toHaveLength(1);
});

it("distinguishes a returned resize request from contained native resize failure without allowing continuation", async () => {
  const { exercise, calls, lines } = await exerciseOutput(
    "refit-resize-failure",
  );
  await expect(exercise).rejects.toThrow("Output refit native resize failed");
  expect(calls).toEqual({ copies: 0, exitRequests: 0 });
  const first = lines.findIndex((line) =>
    line.includes('"phase":"refit-resize-call","status":"begin"'),
  );
  expect(lines[first + 1]).toContain('"resizeFailure":"native-failure"');
  expect(lines[first + 2]).toContain(
    '"phase":"refit-resize-call","status":"complete"',
  );
  expect(
    lines.filter((line) => line.includes('"phase":"resize-failure"')),
  ).toHaveLength(1);
  expect(lines.some((line) => line.includes("controlled resize failure"))).toBe(
    false,
  );
});

it("records calibration, exact-prefix acknowledgement and requested native-grid refit in order", async () => {
  const lines: string[] = [];
  vi.mocked(writeSync).mockImplementation((_fd, value) => {
    lines.push(String(value));
    return 0;
  });
  const sizes = [{ cols: 80, rows: 24 }];
  let maxWidth = "";
  const surface = {
    getBoundingClientRect: () => ({ width: 800 }),
    style: {
      get maxWidth() {
        return maxWidth;
      },
      set maxWidth(value: string) {
        maxWidth = value;
        sizes.push({ cols: value ? 60 : 80, rows: 24 });
      },
    },
  };
  const window = {
    webContents: {
      async executeJavaScript(script: string) {
        return runInNewContext(script, {
          document: { querySelector: () => surface },
        }) as unknown;
      },
    },
  };
  let sourceBytes = 53;
  const refit = await prepareOutputRefit({
    window: window as unknown as BrowserWindow,
    sizes,
    readProgress: () => ({
      sourceBytes,
      cumulativeAck: sourceBytes,
      pendingBytes: 0,
      checkpoints: 0,
      pauseCount: 1,
      resumeCount: 1,
    }),
    async waitFor(predicate, label) {
      if (!(await predicate())) throw new Error(`Not ready: ${label}`);
    },
  });
  sourceBytes += refit.prefixUnits;
  const acknowledgement = await refit.refit();
  await refit.restore();
  expect(acknowledgement).toMatchObject({
    baselineBytes: 53,
    sourceBytes,
    cumulativeAck: sourceBytes,
    pendingBytes: 0,
  });
  expect(sizes.at(-1)).toEqual({ cols: 80, rows: 24 });
  const records = lines
    .filter((line) => line.startsWith("__OMXTERM_RESTTY_HOST_PHASE__"))
    .map(
      (line) =>
        JSON.parse(line.slice("__OMXTERM_RESTTY_HOST_PHASE__".length)) as {
          phase: string;
          status: string;
        },
    );
  expect(records.map((r) => [r.phase, r.status])).toEqual([
    ["refit-layout", "begin"],
    ["refit-layout", "complete"],
    ["refit-calibration", "begin"],
    ["refit-calibration", "complete"],
    ["refit-restoration", "begin"],
    ["refit-restoration", "complete"],
    ["refit-baseline-ack", "begin"],
    ["refit-baseline-ack", "complete"],
    ["refit-prefix-ack", "begin"],
    ["refit-prefix-ack", "complete"],
    ["refit-native-grid", "begin"],
    ["refit-native-grid", "complete"],
  ]);
});
