import {
  isTerminalSessionOutputAck,
  type TerminalSessionId,
} from "../shared/terminal-contract";
import { isValidExternalLink } from "./external-link";
import type { OperationalEventLog } from "./operational-events";
import type { TerminalOutputFlow } from "./terminal-output-flow";

export type RejectBoundary = (
  boundary: "ipc" | "title" | "external-link" | "clipboard",
  reason:
    | "untrusted-sender"
    | "invalid-payload"
    | "invalid-value"
    | "too-long"
    | "invalid-characters"
    | "unknown-session"
    | "invalid-progress",
) => void;

interface ExternalLinkRequestOptions {
  readonly openExternalLink: (url: string) => Promise<void>;
  readonly onExternalLinkOpenError: () => void;
}

interface OutputAckTarget {
  readonly outputFlow: TerminalOutputFlow;
  readonly closed: boolean;
  readonly exited: boolean;
}

export function acknowledgeTerminalOutput(
  payload: unknown,
  target: (sessionId: TerminalSessionId) => OutputAckTarget | undefined,
  reject: RejectBoundary,
): void {
  if (!isTerminalSessionOutputAck(payload)) {
    reject("ipc", "invalid-payload");
    return;
  }
  const state = target(payload.sessionId);
  if (!state) {
    reject("ipc", "unknown-session");
    return;
  }
  if (
    state.closed ||
    state.exited ||
    !state.outputFlow.acknowledge(payload.end)
  )
    reject("ipc", "invalid-progress");
}

export function requestExternalLink(
  payload: unknown,
  options: ExternalLinkRequestOptions,
  operationalEvents: Pick<OperationalEventLog, "write"> | undefined,
  reject: RejectBoundary,
): void {
  if (!isValidExternalLink(payload)) {
    reject("external-link", "invalid-value");
    return;
  }
  void options.openExternalLink(payload).catch(() => {
    operationalEvents?.write({
      name: "application.failure",
      stage: "external-link-open",
    });
    options.onExternalLinkOpenError();
  });
}
