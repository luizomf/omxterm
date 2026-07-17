export const DEFAULT_TERMINAL_TITLE = "OMXTerm";
export const TERMINAL_BELL_MARKER = "🔔";
export const MAX_TERMINAL_TITLE_CODE_POINTS = 256;

interface TerminalTitleWindow {
  isFocused(): boolean;
  setTitle(title: string): void;
  on(event: "focus", listener: () => void): void;
  removeListener(event: "focus", listener: () => void): void;
}

export interface TerminalWindowTitleController {
  requestTitle(request: string): void;
  ringBell(): void;
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

export function safeTerminalBaseTitle(request: string): string {
  if ([...request].length > MAX_TERMINAL_TITLE_CODE_POINTS)
    return DEFAULT_TERMINAL_TITLE;

  const sanitized = request.replace(/[\p{Cc}\p{Bidi_Control}]/gu, "");
  if (
    sanitized.length === 0 ||
    /[\p{Cc}\p{Cf}\p{Cs}\p{Cn}\p{Zl}\p{Zp}]/u.test(sanitized)
  )
    return DEFAULT_TERMINAL_TITLE;
  return sanitized;
}

export function createTerminalWindowTitleController(
  window: TerminalTitleWindow,
  requestDockAttention: () => void,
  onRejected: (reason: TerminalTitleRejectionReason) => void = () => {},
): TerminalWindowTitleController {
  let baseTitle = DEFAULT_TERMINAL_TITLE;
  let attentionPending = false;
  let disposed = false;

  const displayTitle = () => {
    if (disposed) return;
    window.setTitle(
      attentionPending ? `${TERMINAL_BELL_MARKER}${baseTitle}` : baseTitle,
    );
  };
  const resetAttention = () => {
    if (disposed || !attentionPending) return;
    attentionPending = false;
    displayTitle();
  };
  const onFocus = () => resetAttention();

  window.on("focus", onFocus);
  displayTitle();

  return {
    requestTitle(request) {
      if (disposed) return;
      const rejection = terminalTitleRejectionReason(request);
      if (rejection) onRejected(rejection);
      baseTitle = safeTerminalBaseTitle(request);
      displayTitle();
    },
    ringBell() {
      if (disposed || window.isFocused() || attentionPending) return;
      attentionPending = true;
      displayTitle();
      requestDockAttention();
    },
    resetAttention,
    dispose() {
      if (disposed) return;
      disposed = true;
      window.removeListener("focus", onFocus);
    },
  };
}
