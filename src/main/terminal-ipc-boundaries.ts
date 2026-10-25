import {
  isNonemptyClipboardText,
  requiresProtectedPaste,
  isTerminalSessionOutputAck,
  isTerminalSessionReference,
  isTerminalSessionTitle,
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

export function createTerminalTitleRequests(
  target: (
    sessionId: TerminalSessionId,
  ) => { readonly closed: boolean; readonly exited: boolean } | undefined,
  options: {
    readonly onTitleRequest: (
      sessionId: TerminalSessionId,
      title: string,
    ) => void;
    readonly onSessionTitleSync?: (sessionId: TerminalSessionId) => void;
  },
  reject: RejectBoundary,
) {
  return {
    title(payload?: unknown) {
      if (!isTerminalSessionTitle(payload)) {
        reject("title", "invalid-payload");
        return;
      }
      if (target(payload.sessionId))
        options.onTitleRequest(payload.sessionId, payload.title);
    },
    syncTabTitle(payload?: unknown) {
      if (!isTerminalSessionReference(payload)) {
        reject("ipc", "invalid-payload");
        return;
      }
      const state = target(payload.sessionId);
      if (state && !state.closed && !state.exited)
        options.onSessionTitleSync?.(payload.sessionId);
    },
  };
}

// The Clipboard Boundary requests of one Terminal Window. Its context menu
// request is validated separately because it also offers Explicit Export.
export function clipboardRequests(
  options: {
    readonly writeClipboardText: (text: string) => void;
    readonly readClipboardText: () => string;
    readonly confirmPaste: (text: string) => Promise<boolean>;
    readonly onClipboardError?: () => void;
  },
  reject: RejectBoundary,
) {
  return {
    writeClipboardText(payload?: unknown) {
      if (!isNonemptyClipboardText(payload)) {
        reject("clipboard", "invalid-payload");
        throw new TypeError("Invalid clipboard write payload");
      }
      useClipboard(
        () => options.writeClipboardText(payload),
        options.onClipboardError,
        undefined,
      );
    },
    readClipboardText(payload?: unknown) {
      if (payload !== undefined) {
        reject("clipboard", "invalid-payload");
        throw new TypeError("Invalid clipboard read payload");
      }
      return useClipboard(
        options.readClipboardText,
        options.onClipboardError,
        "",
      );
    },
    confirmPaste: (payload?: unknown) =>
      confirmClipboardPaste(payload, options, reject),
  };
}

export async function confirmClipboardPaste(
  payload: unknown,
  options: {
    readonly confirmPaste: (text: string) => Promise<boolean>;
    readonly onClipboardError?: () => void;
  },
  reject: RejectBoundary,
): Promise<boolean> {
  if (!isNonemptyClipboardText(payload) || !requiresProtectedPaste(payload)) {
    reject("clipboard", "invalid-payload");
    throw new TypeError("Invalid Protected Paste payload");
  }
  try {
    return await options.confirmPaste(payload);
  } catch {
    options.onClipboardError?.();
    return false;
  }
}

export function useClipboard<T>(
  operation: () => T,
  onError: (() => void) | undefined,
  fallback: T,
): T {
  try {
    return operation();
  } catch {
    onError?.();
    return fallback;
  }
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
