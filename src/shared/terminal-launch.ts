import {
  isTerminalSessionId,
  type TerminalSessionId,
} from "./terminal-contract";

// What the renderer may ask for when starting a session. It names intent, not
// executables or paths: main resolves "inherit" to the referenced session's
// working directory and "saved-session" to a stored Session definition, so the
// renderer never gains the ability to spawn arbitrary programs (ADR 0006).
export type TerminalLaunchSpec =
  | { readonly kind: "inherit"; readonly sessionId: TerminalSessionId }
  | { readonly kind: "saved-session"; readonly id: string }
  // Quick Connect: "[user@]host[:port]", validated again in main.
  | { readonly kind: "quick-ssh"; readonly target: string }
  // A restored workspace pane: an opaque token main maps to a directory.
  | { readonly kind: "restored"; readonly token: string };

export const MAX_QUICK_CONNECT_TARGET_LENGTH = 300;

export const SAVED_SESSION_ID = /^[A-Za-z0-9_-]{1,64}$/u;
export const RESTORE_TOKEN = /^r[0-9a-f]{16}$/u;

export function isSavedSessionId(value: unknown): value is string {
  return typeof value === "string" && SAVED_SESSION_ID.test(value);
}

export function isTerminalLaunchSpec(
  value: unknown,
): value is TerminalLaunchSpec {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort().join(",");
  if (record.kind === "inherit")
    return keys === "kind,sessionId" && isTerminalSessionId(record.sessionId);
  if (record.kind === "saved-session")
    return keys === "id,kind" && isSavedSessionId(record.id);
  if (record.kind === "restored")
    return (
      keys === "kind,token" &&
      typeof record.token === "string" &&
      RESTORE_TOKEN.test(record.token)
    );
  if (record.kind === "quick-ssh")
    return (
      keys === "kind,target" &&
      typeof record.target === "string" &&
      record.target.length > 0 &&
      record.target.length <= MAX_QUICK_CONNECT_TARGET_LENGTH
    );
  return false;
}

// OSC 7 working-directory reports: file://host/absolute/path. Only reports
// naming this machine are trusted; a remote shell's path is not a local one.
export function workingDirectoryFromReport(
  uri: string,
  localHostNames: readonly string[],
): string | undefined {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return undefined;
  }
  if (parsed.protocol !== "file:" || parsed.search || parsed.hash)
    return undefined;
  const host = parsed.hostname.toLowerCase();
  if (
    host !== "" &&
    host !== "localhost" &&
    !localHostNames.some((name) => name.toLowerCase() === host)
  )
    return undefined;
  let path: string;
  try {
    path = decodeURIComponent(parsed.pathname);
  } catch {
    return undefined;
  }
  if (!path.startsWith("/") || path.includes("\0")) return undefined;
  // Windows file URIs carry a drive letter after the leading slash.
  return /^\/[A-Za-z]:\//u.test(path)
    ? path.slice(1).replaceAll("/", "\\")
    : path;
}
