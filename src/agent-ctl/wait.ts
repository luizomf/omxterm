// How omxterm-ctl asks for a wait and prints its answer (docs/dev/agent-api.md).
import { EXIT } from "./client";
import type { Options, Outcome } from "./commands";

export function waitArguments(options: Options, pane: string, after?: number) {
  return {
    pane,
    timeoutMs: options.timeout ?? 60_000,
    ...(after === undefined ? {} : { after }),
    ...(options.idle === undefined ? {} : { idleMs: options.idle }),
    ...(options.match === undefined ? {} : { match: options.match }),
    ...(options.commandEnd ? { commandEnd: true } : {}),
  };
}

/** Where a send's text went, for a wait that failed after it. */
export const sentAt = (offset: number) =>
  `It was sent; wait with --after ${offset}.`;

export function report(options: Options, value: unknown): Outcome {
  const result = value as { reason: string; exitCode?: number; offset: number };
  const { reason, exitCode, offset } = result;
  // A command still running may end before the next wait arrives.
  const text =
    exitCode !== undefined
      ? `${reason} ${exitCode}`
      : reason === "timeout" && options.commandEnd
        ? `timeout (still running; wait --command --after ${offset})`
        : reason;
  return {
    output: options.json ? JSON.stringify(result) : text,
    code: reason === "timeout" ? EXIT.timeout : EXIT.ok,
    result,
  };
}
