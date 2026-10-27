import type { BrowserWindow } from "electron";
import { writeSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, vi } from "vitest";
import {
  createLocalTerminalSession,
  type SpawnPty,
} from "../../src/main/local-terminal-session";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import { createTerminalOutputFlow } from "../../src/main/terminal-output-flow";
import type {
  IpcListener,
  IpcMainPort,
} from "../../src/main/terminal-ipc-types";
import { createOutputStressHarness } from "./restty-host-output-stress";
import {
  outputCheckpointProducer,
  outputRecord,
} from "./restty-output-checkpoint";
import { createFixtureMetricReplyRouter } from "./restty-host-metric-replies";

export interface CopyAckControl {
  copy: "drop" | "reorder" | "unmodified";
  ack: "delayed" | "withheld" | "counter-only";
  chunks: readonly [string, string];
  missingMetrics?: boolean;
  afterDecisionChunk?: string;
}

function mutateCopiedCheckpoint(text: string, control: CopyAckControl["copy"]) {
  if (control === "drop") return text.replace(outputRecord(100), "");
  if (control === "reorder")
    return text.replace(
      outputRecord(100) + outputRecord(101),
      outputRecord(101) + outputRecord(100),
    );
  return text;
}

// Execute the ordinary D2 producer/session/router with controlled external ports.
// Copy uses the transcript here, not a real Surface selection or native PTY.
export async function exerciseOutput(
  mode:
    | "acknowledged"
    | "withheld"
    | "counter-only"
    | "no-end"
    | "no-exit"
    | "resize-failure"
    | "write-failure"
    | CopyAckControl,
  failureAt: "initial" | "resize" | "memory" | "exit" = "resize",
) {
  vi.useFakeTimers();
  const lines: string[] = [];
  vi.mocked(writeSync).mockImplementation((_fd, value) => {
    lines.push(String(value));
    return 0;
  });
  const copyControl = typeof mode === "object" ? mode : undefined;
  const checkpoints =
    mode === "acknowledged" ? 16 : mode === "write-failure" ? 2 : 1;
  const harness = createOutputStressHarness({ sessionIndex: 0, checkpoints });
  const calls = { copies: 0, exitRequests: 0 };
  const kill = vi.fn();
  const flow = createTerminalOutputFlow();
  let copying = false;
  let observedAckEnd = 0;
  let rejectedAtPredicate: unknown;
  const sizes = [{ cols: 80, rows: 24 }];
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
  let exiting = false,
    failResize = false;
  let exitCode: number | undefined;
  let onData!: (data: string) => void;
  let onExit!: (exit: { exitCode: number; signal: number }) => void;
  let input!: (data: Buffer) => void;
  const resizeFailure = () => {
    failResize = true;
    routedTerminal.resize({ cols: 82, rows: 24 });
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
          if (text === "n" && mode === "write-failure") {
            resizeFailure();
            throw new Error("controlled checkpoint write failed");
          }
          exiting = text === "x";
          if (exiting) calls.exitRequests++;
          if (!exiting || mode !== "no-exit") input(Buffer.from(text));
          if (text === "g" && mode === "no-end") queued = queued.slice(0, -1);
          if (exiting && exitCode !== undefined)
            queued += "\u001b[?1004l\u001b[?9001l";
          const output = queued;
          queued = "";
          if (output) onData(output);
          if (
            exitCode !== undefined &&
            !(mode === "resize-failure" && failureAt === "exit")
          )
            onExit({ exitCode, signal: 0 });
        },
        pause() {},
        resume() {},
        kill,
        resize() {
          if (failResize) throw new Error("PRIVATE_NATIVE_CANARY");
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
        const end = flow.record(text);
        expect(end).toBe(sourceBytes);
        if (copyControl && copying) {
          if (copyControl.ack !== "withheld")
            setTimeout(
              () => acknowledge({} as never, { sessionId: "s1", end }),
              20,
            );
        } else if (!exiting || mode !== "withheld")
          acknowledge({} as never, { sessionId: "s1", end });
      },
      onExit: (exit) => harness.observeExit(0, exit),
      onResizeFailure: (reason) => harness.observeResizeFailure(0, reason),
    },
  );
  flow.bind(terminal);
  port.on(terminalIpc.outputAck, (_event, payload) => {
    const end = (payload as { end: number }).end;
    observedAckEnd = end;
    if (
      (exiting && mode === "counter-only") ||
      (copying && copyControl?.ack === "counter-only")
    )
      return;
    expect(flow.acknowledge(end)).toBe(true);
    acceptedEnd = end;
  });
  const { terminal: routedTerminal } = createFixtureMetricReplyRouter(
    terminal,
    () => {},
    { inputs: [], resizes: sizes },
  );
  runInNewContext(outputCheckpointProducer(checkpoints), {
    process: {
      stdin: {
        isTTY: false,
        on(_event: string, listener: typeof input) {
          input = listener;
        },
        resume() {},
      },
      stdout: {
        write(text: string) {
          queued += text;
          return true;
        },
      },
      exit(code: number) {
        exitCode = code;
      },
    },
  });
  const ready = queued;
  queued = "";
  onData(ready);
  if (mode === "resize-failure" && failureAt === "initial") resizeFailure();
  const window = {
    getBounds: () => ({ width: 900, height: 600, x: 0, y: 0 }),
    setBounds() {
      if (mode === "resize-failure" && failureAt === "resize") resizeFailure();
      else routedTerminal.resize({ cols: 82, rows: 24 });
    },
    webContents: {
      async executeJavaScript(script: string) {
        if (script.includes("scrollbackLines")) return 10000;
        if (script.includes("usedJSHeapSize")) {
          if (mode === "resize-failure" && failureAt === "memory")
            resizeFailure();
          return 123;
        }
        // The renderer stall remains an existing ordering boundary, not real work here.
      },
      send(_channel: string, action: string) {
        if (action === "copy") {
          calls.copies++;
          if (!copyControl) {
            harness.observeClipboard(transcript);
            return;
          }
          const copied = mutateCopiedCheckpoint(transcript, copyControl.copy);
          copying = true;
          onData(copyControl.chunks[0]);
          setTimeout(() => onData(copyControl.chunks[1]), 10);
          if (copyControl.missingMetrics)
            delete routedTerminal.outputFlowMetrics;
          harness.observeClipboard(copied);
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
      if (
        label === "output producer clean exit" &&
        mode === "resize-failure" &&
        failureAt === "exit"
      ) {
        await Promise.resolve();
        resizeFailure();
        onExit({ exitCode: exitCode!, signal: 0 });
      }
      if (!copyControl) {
        if (!(await predicate())) throw new Error(`Not ready: ${label}`);
        return;
      }
      // Controlled adapter for the existing focused 10 s / session 25 ms wait.
      // Virtual time only; no new runtime waiter or native deadline is introduced.
      const deadline = Date.now() + 10_000;
      while (true) {
        if (Date.now() > deadline)
          throw new Error(`Focused oracle timed out: ${label}`);
        try {
          if (await predicate()) return;
        } catch (error) {
          if (label.startsWith("actual copied destination")) {
            rejectedAtPredicate = error;
            if (
              copyControl.afterDecisionChunk &&
              error instanceof Error &&
              error.message.startsWith("Destination checkpoint")
            )
              onData(copyControl.afterDecisionChunk);
          }
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
    },
  });
  void exercise.catch(() => {});
  await vi.advanceTimersByTimeAsync(500);
  return {
    exercise,
    lines,
    calls,
    kill,
    copyFlow: () => ({
      sourceBytes,
      observedAckEnd,
      acceptedEnd,
      pendingBytes: terminal.outputFlowMetrics!().pendingBytes,
      rejectedAtPredicate,
    }),
  };
}
