import type { BrowserWindow } from "electron";
import type { LaunchRequest } from "../../src/main/launch-request";
import type { LocalTerminalSession } from "../../src/main/local-terminal-session";
import { terminalIpc } from "../../src/shared/terminal-ipc";

const RECORDS = 65_536;
const RECORD_BYTES = 32;
const BEGIN = "__OMXTERM_OUTPUT_BEGIN__";
const END = "__OMXTERM_OUTPUT_END__";
const SESSION_INDEX = 2;

export interface OutputStressEvidence {
  readonly bytes: number;
  readonly records: number;
  readonly endSeen: boolean;
  readonly markerVisible: boolean;
  readonly remainderCodeUnits: number;
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
): LaunchRequest | undefined {
  if (index !== SESSION_INDEX) return undefined;
  const executable = process.env["npm_node_execpath"];
  if (!executable)
    throw new Error("Native output fixture requires npm_node_execpath");
  const producer = `let i=0;const write=()=>{if(i===0)process.stdout.write("__OMXTERM_"+"OUTPUT_BEGIN__");while(i<${RECORDS}){const line=String(i).padStart(8,"0")+":"+"x".repeat(23);i++;if(!process.stdout.write(line)){process.stdout.once("drain",write);return}}process.stdout.write("__OMXTERM_"+"OUTPUT_END__");process.stdin.once("data",()=>process.exit(0))};process.stdin.once("data",write);process.stdin.resume()`;
  return {
    kind: "explicit-command",
    executable,
    arguments: ["-e", producer],
  };
}

export function createOutputStressHarness() {
  let active = false;
  let bytes = 0;
  let began = false;
  let nextRecord = 0;
  let remainder = "";
  let endSeen = false;
  let markerVisible = false;
  let producerExit: { exitCode: number; signal: number } | undefined;

  const observeOutput = (index: number, data: string): boolean => {
    if (index !== SESSION_INDEX || !active) return false;
    remainder += data;
    if (!began) {
      const begin = remainder.indexOf(BEGIN);
      if (begin < 0) remainder = remainder.slice(-BEGIN.length);
      else {
        began = true;
        bytes += BEGIN.length;
        remainder = remainder.slice(begin + BEGIN.length);
      }
    }
    while (began && nextRecord < RECORDS && remainder.length >= RECORD_BYTES) {
      const record = remainder.slice(0, RECORD_BYTES);
      remainder = remainder.slice(RECORD_BYTES);
      const expected = `${String(nextRecord).padStart(8, "0")}:${"x".repeat(23)}`;
      if (record !== expected)
        throw new Error(`Output stress order failed at ${nextRecord}`);
      nextRecord += 1;
      bytes += RECORD_BYTES;
    }
    if (nextRecord === RECORDS && remainder.includes(END)) {
      endSeen = true;
      bytes += END.length;
      remainder = remainder.slice(remainder.indexOf(END) + END.length);
    }
    return true;
  };

  return {
    observeOutput,
    observeClipboard(text: string) {
      markerVisible ||= text.includes(END);
    },
    observeExit(index: number, exit: { exitCode: number; signal: number }) {
      if (index === SESSION_INDEX) producerExit = exit;
    },
    async exercise(options: {
      readonly window: BrowserWindow;
      readonly terminals: readonly LocalTerminalSession[];
      readonly resizes: ReadonlyArray<readonly unknown[]>;
      readonly launchKinds: readonly string[];
      readonly waitFor: (
        predicate: () => boolean | Promise<boolean>,
        label: string,
      ) => Promise<void>;
    }): Promise<OutputStressEvidence> {
      active = true;
      options.window.webContents.send(terminalIpc.tabCommand, {
        action: "new",
      });
      await options.waitFor(
        () =>
          options.launchKinds.length === 3 &&
          options.resizes[SESSION_INDEX]!.length > 0,
        "output-stress Restty tab",
      );
      const terminal = options.terminals[SESSION_INDEX]!;
      const resizesBefore = options.resizes[SESSION_INDEX]!.length;
      const rendererStall = options.window.webContents.executeJavaScript(
        "{ const end = performance.now() + 350; while (performance.now() < end) {} }",
        true,
      );
      void rendererStall.catch(() => undefined);
      await new Promise((resolve) => setTimeout(resolve, 25));
      terminal.write("g\r");
      setTimeout(() => {
        const bounds = options.window.getBounds();
        options.window.setBounds({
          ...bounds,
          width: bounds.width === 920 ? 900 : 920,
        });
      }, 100);
      await new Promise((resolve) => setTimeout(resolve, 400));
      await options.waitFor(() => endSeen, "ordered 2 MiB output end marker");
      await options.waitFor(
        () => (terminal.outputFlowMetrics?.().resumeCount ?? 0) > 0,
        "output backpressure resume",
      );
      await options.waitFor(
        () => terminal.outputFlowMetrics?.().pendingBytes === 0,
        "complete output acknowledgement",
      );
      options.window.webContents.send(
        terminalIpc.clipboardAction,
        "select-all",
      );
      options.window.webContents.send(terminalIpc.clipboardAction, "copy");
      await options.waitFor(
        () => markerVisible,
        "Restty core output end marker",
      );
      active = false;
      const flow = terminal.outputFlowMetrics?.();
      if (!flow) throw new Error("Output flow metadata is unavailable");
      const rendererHeapUsedBytes =
        (await options.window.webContents.executeJavaScript(
          "performance.memory?.usedJSHeapSize ?? null",
          true,
        )) as number | null;
      const memory = process.memoryUsage();
      terminal.write("x\r");
      await options.waitFor(
        () => producerExit?.exitCode === 0 && producerExit.signal === 0,
        "output producer clean exit",
      );
      return {
        bytes,
        records: nextRecord,
        endSeen,
        markerVisible,
        remainderCodeUnits: remainder.length,
        flow,
        resizeObserved: options.resizes[SESSION_INDEX]!.length > resizesBefore,
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
