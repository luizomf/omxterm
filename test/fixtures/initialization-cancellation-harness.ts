import { vi } from "vitest";
import type { TerminalBridge } from "../../src/shared/terminal-bridge";

export function deferred() {
  let resolve!: () => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<void>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

export function cancellationBridge(gate?: Promise<void>) {
  const outputs = new Set<Parameters<TerminalBridge["onOutput"]>[0]>();
  const exits = new Set<Parameters<TerminalBridge["onExit"]>[0]>();
  let starts = 0;
  const bridge = {
    start: vi.fn(async () => {
      const id = `s${++starts}`;
      if (starts === 2 && gate) await gate;
      return id;
    }),
    input: vi.fn(),
    resize: vi.fn(),
    close: vi.fn(),
    acknowledgeOutput: vi.fn(),
    onOutput(listener: Parameters<TerminalBridge["onOutput"]>[0]) {
      outputs.add(listener);
      return () => {
        outputs.delete(listener);
      };
    },
    onExit(listener: Parameters<TerminalBridge["onExit"]>[0]) {
      exits.add(listener);
      return () => {
        exits.delete(listener);
      };
    },
  };
  return { bridge: bridge as typeof bridge & TerminalBridge, outputs, exits };
}
