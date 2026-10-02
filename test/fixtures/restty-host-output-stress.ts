import type { BrowserWindow } from "electron";
import type { LaunchRequest } from "../../src/main/launch-request";
import type { LocalTerminalSession } from "../../src/main/local-terminal-session";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import { isTerminalSessionOutputAck } from "../../src/shared/terminal-contract";
import type {
  IpcMainPort,
  IpcListener,
} from "../../src/main/terminal-ipc-types";
import {
  assertOutputCheckpoint,
  createOutputSourceObserver,
  OUTPUT_CHECKPOINTS,
  outputCheckpointProducer,
} from "./restty-output-checkpoint";
import { outputCheckpointCopyDiagnostic } from "./restty-output-drop-evidence";

export interface OutputStressEvidence {
  readonly source: ReturnType<
    ReturnType<typeof createOutputSourceObserver>["evidence"]
  >;
  readonly destination: {
    readonly checkpoints: readonly ReturnType<typeof assertOutputCheckpoint>[];
    readonly records: number;
    readonly recordBytes: number;
    readonly endSeen: boolean;
  };
  readonly load: "paced-128KiB-checkpoints";
  readonly gridColumns: number;
  readonly scrollbackLines: 10_000;
  // Pinned Surface constructor contract, not an allocation measurement.
  readonly pinnedCoreByteLimit: 10_000_000;
  readonly acknowledgements: {
    readonly count: number;
    readonly cumulativeEnd: number;
  };
  readonly flow: ReturnType<
    NonNullable<LocalTerminalSession["outputFlowMetrics"]>
  >;
  readonly resizeObserved: boolean;
  readonly producerExit: { readonly exitCode: number; readonly signal: number };
  readonly memory: {
    readonly mainHeapUsedBytes: number;
    readonly mainRssBytes: number;
    readonly rendererHeapUsedBytes: number | null;
  };
}

export function outputStressLaunchRequest(
  index: number,
  sessionIndex = 2,
  checkpoints = OUTPUT_CHECKPOINTS,
): LaunchRequest | undefined {
  if (index !== sessionIndex) return undefined;
  const executable = process.env["npm_node_execpath"];
  if (!executable)
    throw new Error("Native output fixture requires npm_node_execpath");
  return {
    kind: "explicit-command",
    executable,
    arguments: ["-e", outputCheckpointProducer(checkpoints)],
  };
}

export function createOutputStressHarness({
  sessionIndex = 2,
  checkpoints = OUTPUT_CHECKPOINTS,
} = {}) {
  const source = createOutputSourceObserver(checkpoints);
  const destination: ReturnType<typeof assertOutputCheckpoint>[] = [];
  let expectingCopy: number | undefined;
  let destinationError: Error | undefined;
  let copyPendingBytes = -1;
  let holdAcknowledgements = false;
  const pendingAcknowledgements: Array<() => void> = [];
  let ackCount = 0;
  let cumulativeEnd = 0;
  let producerExit: { exitCode: number; signal: number } | undefined;

  const releaseAcknowledgements = () => {
    holdAcknowledgements = false;
    for (const acknowledge of pendingAcknowledgements.splice(0)) acknowledge();
  };
  return {
    ipcPort(port: IpcMainPort): IpcMainPort {
      const wrappers = new Map<IpcListener, IpcListener>();
      return {
        handle: (channel, handler) => port.handle(channel, handler),
        removeHandler: (channel) => port.removeHandler(channel),
        on(channel, listener) {
          const wrapped: IpcListener = (event, payload) => {
            if (
              channel === terminalIpc.outputAck &&
              isTerminalSessionOutputAck(payload) &&
              payload.sessionId === `s${sessionIndex + 1}`
            ) {
              const acknowledge = () => {
                if (payload.end < cumulativeEnd)
                  throw new Error("Output ACK cumulative index regressed");
                cumulativeEnd = payload.end;
                ackCount++;
                listener(event, payload);
              };
              if (holdAcknowledgements)
                pendingAcknowledgements.push(acknowledge);
              else acknowledge();
            } else listener(event, payload);
          };
          wrappers.set(listener, wrapped);
          port.on(channel, wrapped);
        },
        removeListener(channel, listener) {
          port.removeListener(channel, wrappers.get(listener) ?? listener);
          wrappers.delete(listener);
        },
      };
    },
    observeOutput(index: number, data: string): boolean {
      if (index !== sessionIndex) return false;
      source.observe(data);
      return true;
    },
    sourceCheckpoints: source.checkpoints,
    observeClipboard(text: string) {
      if (expectingCopy === undefined) return;
      try {
        destination.push(assertOutputCheckpoint(text, expectingCopy));
      } catch (cause) {
        destinationError = new Error(
          `${cause instanceof Error ? cause.message : String(cause)}; source checkpoints=${source.checkpoints()}, source records=${source.evidence().records}, pending=${copyPendingBytes}, ACK=${cumulativeEnd}/${source.evidence().bytes}; copied checkpoint=${JSON.stringify(outputCheckpointCopyDiagnostic(text, expectingCopy))}`,
        );
      }
      expectingCopy = undefined;
    },
    observeExit(index: number, exit: { exitCode: number; signal: number }) {
      if (index === sessionIndex) producerExit = exit;
    },
    async exercise(options: {
      readonly window: BrowserWindow;
      readonly terminals: readonly LocalTerminalSession[];
      readonly resizes: ReadonlyArray<
        readonly { cols: number; rows: number }[]
      >;
      readonly launchKinds: readonly string[];
      readonly existingSession?: boolean;
      readonly waitFor: (
        predicate: () => boolean | Promise<boolean>,
        label: string,
      ) => Promise<void>;
    }): Promise<OutputStressEvidence> {
      const { window, waitFor } = options;
      if (!options.existingSession)
        window.webContents.send(terminalIpc.tabCommand, { action: "new" });
      await waitFor(
        () =>
          options.launchKinds.length === sessionIndex + 1 &&
          (options.resizes[sessionIndex]?.length ?? 0) > 0,
        "output-stress Restty tab",
      );
      await waitFor(source.ready, "output producer readiness");
      const terminal = options.terminals[sessionIndex]!;
      const scrollbackLines: unknown =
        await window.webContents.executeJavaScript(
          "window.omxterm.terminal.configuration().then((value) => value.scrollbackLines)",
          true,
        );
      if (scrollbackLines !== 10_000)
        throw new Error("Output fixture history configuration changed");
      const columns = options.resizes[sessionIndex]!.at(-1)!.cols;
      if (columns < 20)
        throw new Error(
          `Output checkpoint fixture needs at least 20 columns, observed ${columns}`,
        );
      const resizesBefore = options.resizes[sessionIndex]!.length;
      const rendererStall = window.webContents.executeJavaScript(
        "{ const end = performance.now() + 350; while (performance.now() < end) {} }",
        true,
      );
      void rendererStall.catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 25));
      holdAcknowledgements = true;
      terminal.write("g");
      const resizeTimer = setTimeout(() => {
        const bounds = window.getBounds();
        window.setBounds({
          ...bounds,
          width: bounds.width === 920 ? 900 : 920,
        });
      }, 100);
      try {
        await new Promise((resolve) => setTimeout(resolve, 400));
        await waitFor(
          () => (terminal.outputFlowMetrics?.().pauseCount ?? 0) > 0,
          "native high-water pause while output acknowledgements are held",
        );
      } finally {
        clearTimeout(resizeTimer);
        releaseAcknowledgements();
      }
      await waitFor(
        () => (terminal.outputFlowMetrics?.().resumeCount ?? 0) > 0,
        "output backpressure resume",
      );
      for (let batch = 0; batch < checkpoints; batch++) {
        await waitFor(
          () => source.checkpoints() === batch + 1,
          `source checkpoint ${batch}`,
        );
        await waitFor(
          () => terminal.outputFlowMetrics?.().pendingBytes === 0,
          `checkpoint ${batch} complete original output acknowledgement`,
        );
        copyPendingBytes = terminal.outputFlowMetrics!().pendingBytes;
        expectingCopy = batch;
        window.webContents.send(terminalIpc.clipboardAction, "select-all");
        window.webContents.send(terminalIpc.clipboardAction, "copy");
        await waitFor(() => {
          if (destinationError) throw destinationError;
          return destination.length === batch + 1;
        }, `actual copied destination checkpoint ${batch}`);
        if (batch + 1 < checkpoints) terminal.write("n");
      }
      const flow = terminal.outputFlowMetrics?.();
      if (!flow) throw new Error("Output flow metadata is unavailable");
      if (cumulativeEnd !== source.evidence().bytes)
        throw new Error(
          "Output ACK cumulative end differs from original source bytes",
        );
      const rendererHeapUsedBytes = (await window.webContents.executeJavaScript(
        "performance.memory?.usedJSHeapSize ?? null",
        true,
      )) as number | null;
      const memory = process.memoryUsage();
      terminal.write("x");
      await waitFor(
        () => producerExit?.exitCode === 0 && producerExit.signal === 0,
        "output producer clean exit",
      );
      return {
        source: source.evidence(),
        destination: {
          checkpoints: destination,
          records: destination.reduce((sum, batch) => sum + batch.records, 0),
          recordBytes: destination.reduce(
            (sum, batch) => sum + batch.recordBytes,
            0,
          ),
          endSeen: destination.length === checkpoints,
        },
        load: "paced-128KiB-checkpoints",
        gridColumns: columns,
        scrollbackLines,
        pinnedCoreByteLimit: 10_000_000,
        acknowledgements: { count: ackCount, cumulativeEnd },
        flow,
        resizeObserved: options.resizes[sessionIndex]!.length > resizesBefore,
        producerExit: producerExit!,
        memory: {
          mainHeapUsedBytes: memory.heapUsed,
          mainRssBytes: memory.rss,
          rendererHeapUsedBytes,
        },
      };
    },
  };
}
