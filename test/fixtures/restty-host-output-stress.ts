import type { BrowserWindow } from "electron";
import {
  recordResttyHostPhase as phase,
  recordOutputRefitProgress,
  type OutputRefitProgress,
} from "./restty-host-phases";
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
import {
  createOutputRefitPrefix,
  outputRefitProducer,
  prepareOutputRefit,
} from "./restty-output-refit";

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
  readonly controlledRefit?: {
    readonly original: { readonly cols: number; readonly rows: number };
    readonly refitted: { readonly cols: number; readonly rows: number };
    readonly prefixUnits: number;
    readonly prefixAcknowledgement: ReturnType<
      ReturnType<typeof createOutputRefitPrefix>["evidence"]
    >;
  };
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
  controlledRefit = false,
): LaunchRequest | undefined {
  if (index !== sessionIndex) return undefined;
  const executable = process.env["npm_node_execpath"];
  if (!executable)
    throw new Error("Native output fixture requires npm_node_execpath");
  return {
    kind: "explicit-command",
    executable,
    arguments: [
      "-e",
      controlledRefit
        ? outputRefitProducer(checkpoints)
        : outputCheckpointProducer(checkpoints),
    ],
  };
}

// oxlint-disable-next-line max-lines-per-function -- Inline phase receipts preserve the existing oracle's ordering without a new orchestration abstraction.
export function createOutputStressHarness({
  sessionIndex = 2,
  checkpoints = OUTPUT_CHECKPOINTS,
  controlledRefit = false,
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
  let readRefitProgress: (() => OutputRefitProgress) | undefined;
  let continuationStarted = false,
    continuationOutput = false,
    continuationFailed = false;
  let resizeArmed = false;
  let resizeEntered: number | undefined;
  let refitReturned:
    ((cols: number, rows: number, requestCount: number) => void) | undefined;
  let resizeFailure: "closed-pty" | "native-failure" | undefined;
  const assertNoResizeFailure = () => {
    if (resizeFailure) throw new Error("Output refit native resize failed");
  };
  const trace = (
    status:
      | "continuation-returned"
      | "continuation-output"
      | "continuation-failure"
      | "resize-failure",
    reason?: typeof resizeFailure,
  ) => {
    let progress: OutputRefitProgress | undefined;
    try {
      progress = readRefitProgress?.();
    } catch {
      /* A snapshot failure cannot hide the fixed resize-failure event. */
    }
    if (progress || status === "resize-failure")
      recordOutputRefitProgress(status, progress, undefined, reason);
  };
  const continuationFailure = () => {
    if (controlledRefit && continuationStarted && !continuationFailed) {
      continuationFailed = true;
      trace("continuation-failure");
    }
  };

  const settledFlow = (terminal: LocalTerminalSession) => {
    const flow = terminal.outputFlowMetrics?.();
    if (!flow) throw new Error("Output flow metadata is unavailable");
    if (cumulativeEnd !== source.evidence().bytes)
      throw new Error(
        "Output ACK cumulative end differs from original source bytes",
      );
    if (flow.pendingBytes !== 0)
      throw new Error(
        "Output actual pending bytes remain after acknowledgement",
      );
    return flow;
  };
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
      try {
        source.observe(data);
      } catch (error) {
        continuationFailure();
        throw error;
      }
      if (
        controlledRefit &&
        continuationStarted &&
        !continuationOutput &&
        data.length
      ) {
        continuationOutput = true;
        trace("continuation-output");
      }
      return true;
    },
    sourceCheckpoints: source.checkpoints,
    observeResize(
      index: number,
      status: "begin" | "complete",
      cols: number,
      rows: number,
      requestCount: number,
    ) {
      if (!controlledRefit || index !== sessionIndex || !resizeArmed) return;
      if (status === "begin" && resizeEntered === undefined) {
        resizeEntered = requestCount;
        phase("refit-resize-call", "begin");
      } else if (status === "complete" && resizeEntered === requestCount) {
        resizeArmed = false;
        const onReturn = refitReturned;
        refitReturned = undefined;
        try {
          onReturn?.(cols, rows, requestCount);
        } catch {
          /* Observation cannot alter resize return or its failure category. */
        }
      }
    },
    observeResizeFailure(
      index: number,
      reason: "closed-pty" | "native-failure",
    ) {
      if (!controlledRefit || index !== sessionIndex || resizeFailure) return;
      resizeFailure = reason;
      trace("resize-failure", reason);
    },
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
      phase("output-session", "begin");
      if (!options.existingSession)
        window.webContents.send(terminalIpc.tabCommand, { action: "new" });
      await waitFor(
        () =>
          options.launchKinds.length === sessionIndex + 1 &&
          (options.resizes[sessionIndex]?.length ?? 0) > 0,
        "output-stress Restty tab",
      );
      phase("output-session", "complete");
      phase("output-producer-ready", "begin");
      await waitFor(source.ready, "output producer readiness");
      phase("output-producer-ready", "complete");
      const terminal = options.terminals[sessionIndex]!;
      readRefitProgress = () => {
        const flow = terminal.outputFlowMetrics?.();
        return {
          sourceBytes: source.evidence().bytes,
          checkpoints: source.checkpoints(),
          cumulativeAck: cumulativeEnd,
          pendingBytes: flow?.pendingBytes ?? -1,
          pauseCount: flow?.pauseCount ?? -1,
          resumeCount: flow?.resumeCount ?? -1,
        };
      };
      phase("output-configuration", "begin");
      const scrollbackLines: unknown =
        await window.webContents.executeJavaScript(
          "window.omxterm.terminal.configuration().then((value) => value.scrollbackLines)",
          true,
        );
      phase("output-configuration", "complete");
      if (scrollbackLines !== 10_000)
        throw new Error("Output fixture history configuration changed");
      const columns = options.resizes[sessionIndex]!.at(-1)!.cols;
      if (columns < 20)
        throw new Error(
          `Output checkpoint fixture needs at least 20 columns, observed ${columns}`,
        );
      const refit = controlledRefit
        ? await prepareOutputRefit({
            window,
            sizes: options.resizes[sessionIndex]!,
            readProgress: readRefitProgress,
            beforeRefit: (onReturn) => {
              resizeArmed = true;
              refitReturned = onReturn;
            },
            waitFor,
          })
        : undefined;
      let prefixAcknowledgement:
        | NonNullable<
            OutputStressEvidence["controlledRefit"]
          >["prefixAcknowledgement"]
        | undefined;
      const resizesBefore = options.resizes[sessionIndex]!.length;
      phase("output-renderer-stall", "begin");
      const rendererStall = window.webContents.executeJavaScript(
        "{ const end = performance.now() + 350; while (performance.now() < end) {} }",
        true,
      );
      void rendererStall.then(
        () => phase("output-renderer-stall", "complete"),
        () => undefined,
      );
      await new Promise((resolve) => setTimeout(resolve, 25));
      holdAcknowledgements = true;
      terminal.write(refit ? `g${refit.prefixUnits};` : "g");
      const resizeTimer = refit
        ? undefined
        : setTimeout(() => {
            const bounds = window.getBounds();
            window.setBounds({
              ...bounds,
              width: bounds.width === 920 ? 900 : 920,
            });
          }, 100);
      try {
        phase("output-high-water", "begin");
        await new Promise((resolve) => setTimeout(resolve, 400));
        await waitFor(
          () => (terminal.outputFlowMetrics?.().pauseCount ?? 0) > 0,
          "native high-water pause while output acknowledgements are held",
        );
        phase("output-high-water", "complete");
      } finally {
        clearTimeout(resizeTimer);
        releaseAcknowledgements();
      }
      phase("output-resume", "begin");
      await waitFor(
        () => (terminal.outputFlowMetrics?.().resumeCount ?? 0) > 0,
        "output backpressure resume",
      );
      phase("output-resume", "complete");
      try {
        if (refit) {
          prefixAcknowledgement = await refit.refit();
          assertNoResizeFailure();
          phase("refit-continuation-write", "begin");
          continuationStarted = true;
          terminal.write("r");
          phase("refit-continuation-write", "complete");
          trace("continuation-returned");
        }
        for (let batch = 0; batch < checkpoints; batch++) {
          phase("checkpoint-source", "begin", batch);
          await waitFor(
            () => source.checkpoints() === batch + 1,
            `source checkpoint ${batch}`,
          );
          phase("checkpoint-source", "complete", batch);
          phase("checkpoint-ack", "begin", batch);
          await waitFor(
            () => terminal.outputFlowMetrics?.().pendingBytes === 0,
            `checkpoint ${batch} complete original output acknowledgement`,
          );
          phase("checkpoint-ack", "complete", batch);
          copyPendingBytes = terminal.outputFlowMetrics!().pendingBytes;
          expectingCopy = batch;
          phase("checkpoint-copy", "begin", batch);
          window.webContents.send(terminalIpc.clipboardAction, "select-all");
          window.webContents.send(terminalIpc.clipboardAction, "copy");
          await waitFor(() => {
            if (destinationError) throw destinationError;
            return destination.length === batch + 1;
          }, `actual copied destination checkpoint ${batch}`);
          phase("checkpoint-copy", "complete", batch);
          if (batch + 1 < checkpoints) terminal.write("n");
        }
      } catch (error) {
        continuationFailure();
        throw error;
      } finally {
        if (refit) {
          phase("refit-cleanup", "begin");
          await refit.restore();
          phase("refit-cleanup", "complete");
        }
      }
      // Outside finally: a secondary contained resize failure must not replace
      // an earlier source/copy/write failure, and restoration still runs.
      assertNoResizeFailure();
      settledFlow(terminal);
      phase("output-memory", "begin");
      const rendererHeapUsedBytes = (await window.webContents.executeJavaScript(
        "performance.memory?.usedJSHeapSize ?? null",
        true,
      )) as number | null;
      phase("output-memory", "complete");
      const memory = process.memoryUsage();
      phase("output-producer-exit", "begin");
      try {
        terminal.write("x");
        await waitFor(
          () => producerExit?.exitCode === 0 && producerExit.signal === 0,
          "output producer clean exit",
        );
      } catch (error) {
        continuationFailure();
        throw error;
      }
      phase("output-producer-exit", "complete");
      const finalSource = source.finalize();
      // Exit can add transport envelope. Neither the pre-x snapshot nor the
      // wrapper's requested ACK counter proves actual retirement of those bytes.
      const flow = settledFlow(terminal);
      // The memory query and actual exit wait above are asynchronous. Keep the
      // final success decision synchronous with the last latch check.
      assertNoResizeFailure();
      return {
        source: finalSource,
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
        ...(refit
          ? {
              controlledRefit: {
                original: refit.original,
                refitted: refit.refitted,
                prefixUnits: refit.prefixUnits,
                prefixAcknowledgement: prefixAcknowledgement!,
              },
            }
          : {}),
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
