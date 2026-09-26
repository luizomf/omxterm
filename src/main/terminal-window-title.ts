import type { TerminalSessionId } from "../shared/terminal-contract";

export const DEFAULT_TERMINAL_TITLE = "OMXTerm";
export const TERMINAL_BELL_MARKER = "🔔";
export const MAX_TERMINAL_TITLE_CODE_POINTS = 256;

interface TerminalTitleWindow {
  isFocused(): boolean;
  setTitle(title: string): void;
  on(event: "focus", listener: () => void): void;
  removeListener(event: "focus", listener: () => void): void;
}

export interface TerminalWindowTitleControllerOptions {
  // The Default Shell's name, known from the spawn — the per-session display
  // fallback per ADR 0016. The native window keeps DEFAULT_TERMINAL_TITLE as
  // its final fallback when no session is selected.
  readonly fallbackSessionTitle: string;
  readonly requestAttention: () => () => void;
  readonly sendSessionTitle: (
    sessionId: TerminalSessionId,
    title: string,
  ) => void;
  readonly onRejected?: (reason: TerminalTitleRejectionReason) => void;
  readonly onWindowTitle?: (title: string) => void;
}

export interface TerminalWindowTitleController {
  sessionStarted(
    sessionId: TerminalSessionId,
    fallbackSessionTitle?: string,
  ): void;
  sessionEnded(sessionId: TerminalSessionId): void;
  selectSession(sessionId: TerminalSessionId): void;
  requestTitle(sessionId: TerminalSessionId, request: string): void;
  ringBell(sessionId: TerminalSessionId): void;
  resetAttention(): void;
  dispose(): void;
}

export type TerminalTitleRejectionReason = "too-long" | "invalid-characters";

export function terminalTitleRejectionReason(
  request: string,
): TerminalTitleRejectionReason | undefined {
  if ([...request].length > MAX_TERMINAL_TITLE_CODE_POINTS) return "too-long";
  const sanitized = request.replace(/[\p{Cc}\p{Bidi_Control}]/gu, "");
  if (request.length > 0 && sanitized.length === 0) return "invalid-characters";
  if (/[\p{Cc}\p{Cf}\p{Cs}\p{Cn}\p{Zl}\p{Zp}]/u.test(sanitized))
    return "invalid-characters";
  return undefined;
}

// The accepted display value of one OSC 0/2 request, or undefined when the
// request is empty, oversized, or invalid and the session falls back.
export function sanitizedTerminalTitle(request: string): string | undefined {
  if ([...request].length > MAX_TERMINAL_TITLE_CODE_POINTS) return undefined;

  const sanitized = request.replace(/[\p{Cc}\p{Bidi_Control}]/gu, "");
  if (
    sanitized.length === 0 ||
    /[\p{Cc}\p{Cf}\p{Cs}\p{Cn}\p{Zl}\p{Zp}]/u.test(sanitized)
  )
    return undefined;
  return sanitized;
}

interface SessionTitleState {
  title: string | undefined;
  fallbackTitle: string;
  bellPending: boolean;
}

export function createTerminalWindowTitleController(
  window: TerminalTitleWindow,
  options: TerminalWindowTitleControllerOptions,
): TerminalWindowTitleController {
  const sessions = new Map<TerminalSessionId, SessionTitleState>();
  let selectedSessionId: TerminalSessionId | undefined;
  let cancelAttention: (() => void) | undefined;
  let disposed = false;
  const onRejected = options.onRejected ?? (() => {});

  const displayTitle = (state: SessionTitleState) =>
    `${state.bellPending ? `${TERMINAL_BELL_MARKER} ` : ""}${
      state.title ?? state.fallbackTitle
    }`;

  const pushSessionTitle = (sessionId: TerminalSessionId) => {
    const state = sessions.get(sessionId);
    if (state) options.sendSessionTitle(sessionId, displayTitle(state));
  };

  const updateWindowTitle = () => {
    if (disposed) return;
    const selected = selectedSessionId
      ? sessions.get(selectedSessionId)
      : undefined;
    const title = selected ? displayTitle(selected) : DEFAULT_TERMINAL_TITLE;
    window.setTitle(title);
    options.onWindowTitle?.(title);
  };

  const clearBell = (sessionId: TerminalSessionId | undefined) => {
    const state = sessionId ? sessions.get(sessionId) : undefined;
    if (!state || !state.bellPending) return;
    state.bellPending = false;
    pushSessionTitle(sessionId!);
    if (sessionId === selectedSessionId) updateWindowTitle();
  };

  const cancelPendingAttention = () => {
    const cancel = cancelAttention;
    cancelAttention = undefined;
    cancel?.();
  };

  const resetAttention = () => {
    if (disposed) return;
    cancelPendingAttention();
    clearBell(selectedSessionId);
  };
  const onFocus = () => resetAttention();

  window.on("focus", onFocus);
  updateWindowTitle();

  return {
    sessionStarted(sessionId, fallbackSessionTitle) {
      if (disposed) return;
      sessions.set(sessionId, {
        title: undefined,
        fallbackTitle: fallbackSessionTitle ?? options.fallbackSessionTitle,
        bellPending: false,
      });
      pushSessionTitle(sessionId);
    },
    sessionEnded(sessionId) {
      if (disposed) return;
      sessions.delete(sessionId);
      if (selectedSessionId === sessionId) {
        selectedSessionId = undefined;
        updateWindowTitle();
      }
    },
    selectSession(sessionId) {
      if (disposed || !sessions.has(sessionId)) return;
      selectedSessionId = sessionId;
      // Selecting a ringing tab is looking at it: its marker is done.
      if (window.isFocused()) clearBell(sessionId);
      updateWindowTitle();
    },
    requestTitle(sessionId, request) {
      if (disposed) return;
      const state = sessions.get(sessionId);
      if (!state) return;
      const rejection = terminalTitleRejectionReason(request);
      if (rejection) onRejected(rejection);
      state.title = sanitizedTerminalTitle(request);
      pushSessionTitle(sessionId);
      if (sessionId === selectedSessionId) updateWindowTitle();
    },
    ringBell(sessionId) {
      if (disposed) return;
      const state = sessions.get(sessionId);
      if (!state) return;
      // The marker is unconditional: even the tab the user is looking at
      // shows that its session rang, until focus or interaction clears it.
      // Only native platform attention is reserved for an unfocused window.
      if (!state.bellPending) {
        state.bellPending = true;
        pushSessionTitle(sessionId);
        if (sessionId === selectedSessionId) updateWindowTitle();
      }
      if (!window.isFocused() && !cancelAttention) {
        cancelAttention = options.requestAttention();
      }
    },
    resetAttention,
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelPendingAttention();
      window.removeListener("focus", onFocus);
    },
  };
}
