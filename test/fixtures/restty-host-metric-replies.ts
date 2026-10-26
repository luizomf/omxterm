interface Size {
  cols: number;
  rows: number;
}
interface TerminalIo {
  write(data: string): void;
  resize(size: Size): void;
}

// Keep the fixture's I/O evidence complete while routing a synthetic query's
// reply back to its fixture owner, never into the unrelated native shell.
export function createFixtureMetricReplyRouter<T extends TerminalIo>(
  terminal: T,
  deliverOutput: (data: string) => void,
  evidence: {
    inputs: string[];
    resizes: Size[];
    onResize?: (
      status: "begin" | "complete",
      cols: number,
      rows: number,
      requestCount: number,
    ) => void;
  },
) {
  let pending = false;
  return {
    deliverOutput(data: string) {
      if (data === "\u001b[16t") {
        if (pending) throw new Error("Overlapping fixture cell-metric query");
        pending = true;
      }
      deliverOutput(data);
    },
    terminal: {
      ...terminal,
      write(data: string) {
        evidence.inputs.push(data);
        if (pending && /^\u001b\[6;\d+;\d+t$/u.test(data)) {
          pending = false;
          return;
        }
        terminal.write(data);
      },
      resize(size: Size) {
        const { cols, rows } = size;
        evidence.resizes.push(size);
        const requestCount = evidence.resizes.length;
        evidence.onResize?.("begin", cols, rows, requestCount);
        terminal.resize(size);
        evidence.onResize?.("complete", cols, rows, requestCount);
      },
    },
  };
}
