import type { BrowserWindow } from "electron";
import { writeSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { expect, vi } from "vitest";
import {
  createLocalTerminalSession,
  type SpawnPty,
} from "../../src/main/local-terminal-session";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import type {
  IpcListener,
  IpcMainPort,
} from "../../src/main/terminal-ipc-types";
import { createOutputStressHarness } from "./restty-host-output-stress";
import { outputCheckpointProducer } from "./restty-output-checkpoint";
import { outputRefitProducer } from "./restty-output-refit";
import { createFixtureMetricReplyRouter } from "./restty-host-metric-replies";
import { runFocusedResttyHostOracle } from "./restty-host-oracle-scenarios";
import { createResttyHostSessions } from "./restty-host-sessions";

type OutputMode =
  | "acknowledged"
  | "withheld"
  | "counter-only"
  | "refit-fragmented"
  | "refit-no-r"
  | "refit-no-end"
  | "refit-no-exit"
  | "refit-resize-failure"
  | "refit-write-failure"
  | "refit-late-grid";

// Shared controlled producer/session/renderer ports; no actual child or cleanup.
export async function exerciseOutput(
  mode: OutputMode,
  failureResizeCall = mode === "refit-resize-failure" ? 3 : 0,
  failResizeDiagnostic = false,
  reentrantResize = false,
) {
  vi.useFakeTimers();
  const lines: string[] = [],
    failedDiagnostics: string[] = [];
  vi.mocked(writeSync).mockImplementation((_fd, value) => {
    const line = String(value);
    if (
      failResizeDiagnostic &&
      (line.includes('"phase":"resize-failure"') ||
        (mode === "refit-late-grid" &&
          (line.includes('"phase":"grid-after-resize-return"') ||
            line.includes('"phase":"refit-resize-call","status":"complete"'))))
    ) {
      failedDiagnostics.push(line);
      throw new Error("controlled diagnostic sink failure");
    }
    lines.push(line);
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
  const rendererCalls = { total: 0, width: 0 };
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
          if (refit && text === "r" && mode !== "refit-late-grid") {
            if (mode === "refit-no-end") queued = queued.slice(0, -24);
            for (let at = 0; at < queued.length; at += 47)
              continuation.push(queued.slice(at, at + 47));
            queued = ""; // Only release controlled continuation after write returns.
          }
          if (exiting && exitCode !== undefined)
            queued += "\u001b[?1004l\u001b[?9001l";
          flush();
          if (exitCode !== undefined && failureResizeCall !== 5)
            onExit({ exitCode, signal: 0 });
        },
        pause() {},
        resume() {},
        kill() {},
        resize() {
          if (++resizeCalls === failureResizeCall)
            throw new Error(
              failureResizeCall === 1
                ? "ioctl(2) failed, EBADF"
                : "controlled resize failure",
            );
          if (reentrantResize && resizeCalls === 3)
            routedTerminal.resize({ cols: 80, rows: 24 });
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
      onResize: (status, cols, rows, requestCount) =>
        harness.observeResize(0, status, cols, rows, requestCount),
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
        if (++rendererCalls.width === 3 && mode === "refit-late-grid") return;
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
        rendererCalls.total++;
        if (script.includes("scrollbackLines")) {
          if (failureResizeCall === 1)
            harness.observeResizeFailure(0, "native-failure");
          return 10000;
        }
        if (script.includes("usedJSHeapSize")) return 123;
        if (script.includes("surface"))
          return runInNewContext(script, {
            document: { querySelector: () => surface },
          }) as unknown;
        // Adapt the existing renderer stall, not its ordering.
      },
      send(_channel: string, action: string) {
        if (action === "copy") {
          calls.copies++;
          harness.observeClipboard(transcript);
        }
      },
    },
  };
  if (failureResizeCall === 1) {
    // Initial sizing can call the real router/session observer before exercise
    // installs a flow reader. A later different category must not replace it.
    expect(() => routedTerminal.resize({ cols: 80, rows: 24 })).not.toThrow();
    expect(() =>
      harness.observeResizeFailure(0, "native-failure"),
    ).not.toThrow();
  }
  const options = {
    window: window as unknown as BrowserWindow,
    terminals: [routedTerminal],
    resizes: [sizes],
    launchKinds: ["explicit-command"],
    existingSession: true,
    async waitFor(predicate: () => boolean | Promise<boolean>, label: string) {
      if (label === "output producer clean exit" && failureResizeCall === 5) {
        // A contained resize after restoration, at the final async exit wait.
        await Promise.resolve();
        routedTerminal.resize({ cols: 80, rows: 24 });
        onExit({ exitCode: exitCode!, signal: 0 });
      }
      if (await predicate()) return;
      while (continuation.length) {
        await Promise.resolve();
        onData(continuation.shift()!);
        if (await predicate()) return;
      }
      throw new Error(`Not ready: ${label}`);
    },
  };
  const exercise =
    mode === "refit-late-grid"
      ? focusedOutput(harness, options, lines)
      : harness.exercise(options);
  void exercise.catch(() => {});
  await vi.advanceTimersByTimeAsync(500);
  return {
    exercise,
    lines,
    calls,
    failedDiagnostics,
    routedTerminal,
    rendererCalls,
  };
}

// Only adapt unused caller ports. Both the focused 10 s wrapper and the session's
// 25 ms / 120 s wait execute unchanged; no session is spawned or completed.
async function focusedOutput(
  harness: ReturnType<typeof createOutputStressHarness>,
  options: Parameters<typeof harness.exercise>[0],
  lines: string[],
) {
  const sessions = createResttyHostSessions({
    spawn() {
      throw Error("No spawn allowed");
    },
    app: {
      on() {},
      exit() {
        throw Error("No native completion allowed");
      },
    },
    signals: { on() {} },
    windows: () => [],
    reportError: vi.fn(),
  });
  await runFocusedResttyHostOracle({
    ...options,
    oracle: "output-checkpoints",
    root: "/synthetic",
    outputStress: harness,
    terminals: [...options.terminals],
    launchKinds: [...options.launchKinds],
    resizes: options.resizes.map(
      (sizes) => sizes as Array<{ cols: number; rows: number }>,
    ),
    outputs: [[]],
    inputs: [[]],
    externalLinks: [],
    localImageRequests: [],
    deliverOutputs: [],
    ptyExits: () => 0,
    sessionStarts: () => 1,
    sessionExited: () => false,
    reload: async () => {},
    complete: async (code) => {
      expect(code).toBe(0);
    },
    waitFor: sessions.waitFor,
  });
  return (
    JSON.parse(
      lines
        .find((line) => line.startsWith("__OMXTERM_RESTTY_HOST_RESULT__"))!
        .slice("__OMXTERM_RESTTY_HOST_RESULT__".length),
    ) as { outputStress: Awaited<ReturnType<typeof harness.exercise>> }
  ).outputStress;
}
