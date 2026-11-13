import {
  MAX_NOTIFICATION_BODY_CODE_POINTS,
  MAX_NOTIFICATION_TITLE_CODE_POINTS,
  sanitizedNotificationText,
  type TerminalNotification,
} from "../shared/terminal-attention";

export type AttentionOsc =
  | { readonly kind: "progress"; readonly active: boolean }
  | ({ readonly kind: "notification" } & TerminalNotification);

/**
 * Reads one OSC 9 or OSC 777 payload (the text after `9;` or `777;`).
 *
 * OSC 9 is shared: `9;4;state;percent` is a ConEmu progress report (state 0
 * clears it, 1–4 are normal, error, indeterminate and paused), other ConEmu
 * subcommands (`9;1` … `9;12`, such as `9;9` working directory) are ignored,
 * and anything else is iTerm2's notification text. OSC 777 only knows
 * `notify;title;body`.
 */
export function parseAttentionOsc(
  command: number,
  payload: string,
): AttentionOsc | undefined {
  if (command === 9) {
    if (/^4(?:;|$)/u.test(payload)) {
      const state = payload.split(";", 2)[1] ?? "";
      if (state === "" || state === "0")
        return { kind: "progress", active: false };
      return /^[1-4]$/u.test(state)
        ? { kind: "progress", active: true }
        : undefined;
    }
    if (/^(?:[1-9]|1[0-2])(?:;|$)/u.test(payload)) return undefined;
    return notification("", payload);
  }
  if (command === 777 && payload.startsWith("notify;")) {
    const rest = payload.slice("notify;".length);
    const separator = rest.indexOf(";");
    return separator < 0
      ? notification(rest, "")
      : notification(rest.slice(0, separator), rest.slice(separator + 1));
  }
  return undefined;
}

function notification(title: string, body: string): AttentionOsc | undefined {
  const clean = {
    title: sanitizedNotificationText(title, MAX_NOTIFICATION_TITLE_CODE_POINTS),
    body: sanitizedNotificationText(body, MAX_NOTIFICATION_BODY_CODE_POINTS),
  };
  return clean.title || clean.body
    ? { kind: "notification", ...clean }
    : undefined;
}
