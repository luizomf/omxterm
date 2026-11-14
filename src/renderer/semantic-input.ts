import type { TerminalSnippet } from "../shared/terminal-snippets";
import type { SnippetTarget } from "./snippet-target";

type InputSource = string | { source: string; target: SnippetTarget };
function focusArguments(
  source?: InputSource,
): [source?: string, drop?: boolean] {
  if (typeof source === "object") return [source.source, true];
  return source ? [source] : [];
}

/** Core owns capture and delivery; packages supply intent, never a target. */
export function createSemanticInput(options: {
  readonly capture: () => SnippetTarget | undefined;
  readonly blocked: () => boolean;
  readonly focusTerminal: () => void;
  readonly focusCapturedTarget?: (
    target: SnippetTarget,
    source?: string,
    drop?: boolean,
  ) => void;
}) {
  let disposed = false;
  return {
    dispose() {
      disposed = true;
    },
    // Resolves when delivery was requested, or reported when waiting for it.
    request(
      snippet: TerminalSnippet,
      intent: "insert" | "run",
      signal?: AbortSignal,
      waitForDelivery = false,
      source?: InputSource,
    ): Promise<boolean> {
      if (disposed || signal?.aborted || options.blocked())
        return Promise.resolve(false);
      // Capture first; never recapture in a continuation.
      const capturedDrop =
        typeof source === "object" ? source.target : undefined;
      const focusSource = focusArguments(source);
      const target = capturedDrop ?? options.capture();
      if (!target?.live() || (capturedDrop && !target.isCurrent?.()))
        return Promise.resolve(false);
      if (waitForDelivery) {
        if (!target.deliverAndReport) return Promise.resolve(false);
        try {
          return target.deliverAndReport(snippet.body).then(
            (delivered) => {
              if (
                delivered === true &&
                !signal?.aborted &&
                target.isCurrent?.()
              ) {
                options.focusCapturedTarget?.(target, ...focusSource);
              }
              return delivered === true;
            },
            () => false,
          );
        } catch {
          return Promise.resolve(false);
        }
      }
      void target.deliver(snippet.body, intent === "run");
      options.focusTerminal();
      return Promise.resolve(true);
    },
  };
}
