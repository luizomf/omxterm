import {
  isTerminalSessionId,
  type TerminalSessionId,
} from "./terminal-contract";

// A program's desktop notification (OSC 9 or OSC 777 notify): untrusted plain
// text, bounded and sanitized before it leaves the Surface and again in main.
export interface TerminalNotification {
  readonly title: string;
  readonly body: string;
}

export interface TerminalNotificationRequest extends TerminalNotification {
  readonly sessionId: TerminalSessionId;
}

// Main's verdict for one session's attention mark (ADR 0053).
export interface TerminalSessionAttention {
  readonly sessionId: TerminalSessionId;
  readonly pending: boolean;
}

export const MAX_NOTIFICATION_TITLE_CODE_POINTS = 128;
// A short sound; main reads at most this much of the user's file.
export const MAX_ATTENTION_SOUND_BYTES = 4 * 1024 * 1024;
export const MAX_NOTIFICATION_BODY_CODE_POINTS = 512;

// Controls and line breaks become spaces, bidirectional controls and lone
// surrogates go away, runs of space collapse, and text longer than the limit
// ends with an ellipsis.
export function sanitizedNotificationText(text: string, max: number): string {
  // Never scan an unbounded OSC body; four code units cover any code point.
  const bounded = text.slice(0, max * 4);
  const plain = bounded
    .replace(/[\p{Bidi_Control}\p{Cs}]/gu, "")
    .replace(/[\p{Cc}\p{Zl}\p{Zp}]/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
  const codePoints = [...plain];
  return codePoints.length <= max
    ? plain
    : `${codePoints.slice(0, max - 1).join("")}…`;
}

export function isTerminalNotificationRequest(
  value: unknown,
): value is TerminalNotificationRequest {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).length === 3 &&
    isTerminalSessionId(record.sessionId) &&
    isBoundedText(record.title, MAX_NOTIFICATION_TITLE_CODE_POINTS) &&
    isBoundedText(record.body, MAX_NOTIFICATION_BODY_CODE_POINTS)
  );
}

export function isTerminalSessionAttention(
  value: unknown,
): value is TerminalSessionAttention {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const record = value as Record<string, unknown>;
  return (
    Object.keys(record).length === 2 &&
    isTerminalSessionId(record.sessionId) &&
    typeof record.pending === "boolean"
  );
}

function isBoundedText(value: unknown, max: number): value is string {
  return (
    typeof value === "string" &&
    value.length <= max * 2 &&
    [...value].length <= max
  );
}
