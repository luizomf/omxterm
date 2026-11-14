import type { TerminalNotification } from "../shared/terminal-attention";
import type { TerminalSessionId } from "../shared/terminal-contract";

export const DEFAULT_TERMINAL_TITLE = "OMXTerm";
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
  // The session's attention State Mark appears or clears (ADR 0053).
  readonly sendSessionAttention?: (
    sessionId: TerminalSessionId,
    pending: boolean,
  ) => void;
  // Attention the user can't see right now: the window is unfocused or the
  // session's tab is not selected. A bell carries no text of its own.
  readonly notify?: (
    sessionId: TerminalSessionId,
    notification: TerminalNotification,
  ) => void;
  readonly bellText?: () => string;
}

export interface TerminalWindowTitleController {
  sessionStarted(
    sessionId: TerminalSessionId,
    fallbackSessionTitle?: string,
  ): void;
  sessionEnded(sessionId: TerminalSessionId): void;
  selectSession(sessionId: TerminalSessionId | null): void;
  selectSettings(title: string): void;
  syncSessionTitle(sessionId: TerminalSessionId): void;
  requestTitle(sessionId: TerminalSessionId, request: string): void;
  // inSelectedTab: the session is a pane of the selected tab, so it is on
  // screen. It defaults to whether it is the selected tab's focused pane.
  ringBell(sessionId: TerminalSessionId, inSelectedTab?: boolean): void;
  notify(
    sessionId: TerminalSessionId,
    notification: TerminalNotification,
    inSelectedTab?: boolean,
  ): void;
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
  attentionPending: boolean;
}

export function createTerminalWindowTitleController(
  window: TerminalTitleWindow,
  options: TerminalWindowTitleControllerOptions,
): TerminalWindowTitleController {
  const sessions = new Map<TerminalSessionId, SessionTitleState>();
  let selectedSessionId: TerminalSessionId | undefined;
  let settingsTitle: string | undefined;
  let cancelAttention: (() => void) | undefined;
  let disposed = false;
  // A bell that arrives while the window opens (tmux replaying a pending one
  // on attach) is not news: bells wait for the first focus. Program
  // notifications carry text the program chose to send, so they never wait.
  let hasBeenFocused = window.isFocused();
  const onRejected = options.onRejected ?? (() => {});

  const displayTitle = (state: SessionTitleState) =>
    state.title ?? state.fallbackTitle;

  const pushSessionTitle = (sessionId: TerminalSessionId) => {
    const state = sessions.get(sessionId);
    if (state) options.sendSessionTitle(sessionId, displayTitle(state));
  };

  const updateWindowTitle = () => {
    if (disposed) return;
    const selected = selectedSessionId
      ? sessions.get(selectedSessionId)
      : undefined;
    const title =
      settingsTitle ??
      (selected ? displayTitle(selected) : DEFAULT_TERMINAL_TITLE);
    window.setTitle(title);
    options.onWindowTitle?.(title);
  };

  const clearAttention = (sessionId: TerminalSessionId | undefined) => {
    const state = sessionId ? sessions.get(sessionId) : undefined;
    if (!state || !state.attentionPending) return;
    state.attentionPending = false;
    options.sendSessionAttention?.(sessionId!, false);
  };

  const raiseAttention = (
    sessionId: TerminalSessionId,
    notification: TerminalNotification | undefined,
    inSelectedTab: boolean,
  ) => {
    if (disposed) return;
    const state = sessions.get(sessionId);
    if (!state) return;
    // The mark is unconditional: even the pane the user is looking at shows
    // that it asked for attention, until focus or interaction clears it.
    // Native attention and notifications are for what is out of sight, and
    // only once the user has had the window in front of them.
    if (!state.attentionPending) {
      state.attentionPending = true;
      options.sendSessionAttention?.(sessionId, true);
    }
    if (!hasBeenFocused && !notification) return;
    const focused = window.isFocused();
    if (!focused && !cancelAttention) {
      cancelAttention = options.requestAttention();
    }
    if (focused && inSelectedTab) return;
    options.notify?.(sessionId, {
      title: notification?.title || displayTitle(state),
      body: notification ? notification.body : (options.bellText?.() ?? ""),
    });
  };

  const cancelPendingAttention = () => {
    const cancel = cancelAttention;
    cancelAttention = undefined;
    cancel?.();
  };

  const resetAttention = () => {
    if (disposed) return;
    cancelPendingAttention();
    clearAttention(selectedSessionId);
  };
  const onFocus = () => {
    hasBeenFocused = true;
    resetAttention();
  };

  window.on("focus", onFocus);
  updateWindowTitle();

  return {
    sessionStarted(sessionId, fallbackSessionTitle) {
      if (disposed) return;
      sessions.set(sessionId, {
        title: undefined,
        fallbackTitle: fallbackSessionTitle ?? options.fallbackSessionTitle,
        attentionPending: false,
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
    selectSettings(title) {
      if (disposed) return;
      selectedSessionId = undefined;
      settingsTitle = title;
      updateWindowTitle();
    },
    selectSession(sessionId) {
      if (disposed || (sessionId !== null && !sessions.has(sessionId))) return;
      settingsTitle = undefined;
      selectedSessionId = sessionId ?? undefined;
      // Selecting a ringing pane is looking at it: its mark is done.
      if (window.isFocused()) clearAttention(selectedSessionId);
      updateWindowTitle();
    },
    syncSessionTitle(sessionId) {
      // Publish the current value on the same ordered stream as OSC/BEL updates;
      // a start-time snapshot could overwrite a newer accepted title.
      if (!disposed) pushSessionTitle(sessionId);
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
    ringBell(sessionId, inSelectedTab = sessionId === selectedSessionId) {
      raiseAttention(sessionId, undefined, inSelectedTab);
    },
    notify(
      sessionId,
      notification,
      inSelectedTab = sessionId === selectedSessionId,
    ) {
      raiseAttention(sessionId, notification, inSelectedTab);
    },
    resetAttention,
    dispose() {
      if (disposed) return;
      disposed = true;
      cancelPendingAttention();
      sessions.clear();
      window.removeListener("focus", onFocus);
    },
  };
}
