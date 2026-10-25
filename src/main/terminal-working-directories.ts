import { statSync } from "node:fs";
import { hostname } from "node:os";
import type { TerminalSessionId } from "../shared/terminal-contract";
import {
  isWorkingDirectoryUri,
  localWorkingDirectory,
  MAX_WORKING_DIRECTORY_REPORT_LENGTH,
} from "../shared/terminal-panes";

const INTRODUCER = "\u001b]7;";

// The last local directory each session's shell reported through OSC 7 in its
// own output. It is used only to start a split pane where its source pane is;
// it is never logged, persisted or sent anywhere. Shells that do not report
// keep the home directory, and OMXTerm injects nothing to make them report
// (ADR 0013).
export function createWorkingDirectoryTracker(
  options: {
    readonly platform?: string;
    readonly hostName?: () => string;
    readonly isDirectory?: (path: string) => boolean;
  } = {},
) {
  const directories = new Map<TerminalSessionId, string>();
  // An unterminated report, or a possibly split introducer, per session.
  const carries = new Map<TerminalSessionId, string>();
  // Once over budget, consume the same rejected report through its terminator.
  const discarding = new Set<TerminalSessionId>();
  const platform = options.platform ?? process.platform;
  const hostName = options.hostName ?? hostname;
  const isDirectory = options.isDirectory ?? existingDirectory;

  const record = (sessionId: TerminalSessionId, uri: string) => {
    const directory = isWorkingDirectoryUri(uri)
      ? localWorkingDirectory(uri, hostName(), platform)
      : undefined;
    // A remote or unusable report replaces, never keeps, an older one.
    if (directory === undefined) directories.delete(sessionId);
    else directories.set(sessionId, directory);
  };

  return {
    observe(sessionId: TerminalSessionId, data: string) {
      const carried = carries.get(sessionId);
      if (
        carried === undefined &&
        !discarding.has(sessionId) &&
        !data.includes("\u001b")
      )
        return;
      carries.delete(sessionId);
      const text = (carried ?? "") + data;
      let from = 0;
      if (discarding.has(sessionId)) {
        const end = terminator(text, 0);
        if (end === undefined) {
          if (text.endsWith("\u001b")) carries.set(sessionId, "\u001b");
          return;
        }
        discarding.delete(sessionId);
        from = end.index + end.length;
      }
      for (;;) {
        const start = text.indexOf(INTRODUCER, from);
        if (start < 0) {
          const tail = partialIntroducer(text);
          if (tail) carries.set(sessionId, tail);
          return;
        }
        const body = start + INTRODUCER.length;
        const end = terminator(text, body);
        if (end === undefined) {
          // A bounded report may continue in the next chunk.
          const length = text.length - body;
          const pendingSt = text.endsWith("\u001b");
          if (
            length <= MAX_WORKING_DIRECTORY_REPORT_LENGTH ||
            (pendingSt && length === MAX_WORKING_DIRECTORY_REPORT_LENGTH + 1)
          )
            carries.set(sessionId, text.slice(start));
          else {
            directories.delete(sessionId);
            discarding.add(sessionId);
            if (pendingSt) carries.set(sessionId, "\u001b");
          }
          return;
        }
        if (!end.cancelled) record(sessionId, text.slice(body, end.index));
        // Overflow invalidates cwd before cancellation, regardless of chunking.
        else if (end.index - body > MAX_WORKING_DIRECTORY_REPORT_LENGTH)
          directories.delete(sessionId);
        from = end.index + end.length;
      }
    },
    // A reported directory may have been removed since; home is the fallback.
    inherited(sessionId: TerminalSessionId | undefined): string | undefined {
      const directory =
        sessionId === undefined ? undefined : directories.get(sessionId);
      return directory !== undefined && isDirectory(directory)
        ? directory
        : undefined;
    },
    forget(sessionId: TerminalSessionId) {
      directories.delete(sessionId);
      carries.delete(sessionId);
      discarding.delete(sessionId);
    },
  };
}

// BEL/ST completes a report; CAN/SUB cancels it without recording its URI.
function terminator(
  text: string,
  from: number,
):
  | {
      readonly index: number;
      readonly length: number;
      readonly cancelled: boolean;
    }
  | undefined {
  const ending = /[\u0007\u0018\u001a]|\u001b\\/gu;
  ending.lastIndex = from;
  const match = ending.exec(text);
  return match
    ? {
        index: match.index,
        length: match[0].length,
        cancelled: match[0] === "\u0018" || match[0] === "\u001a",
      }
    : undefined;
}

// The longest end of `text` that could begin an introducer in the next chunk.
function partialIntroducer(text: string): string {
  for (let length = INTRODUCER.length - 1; length > 0; length -= 1)
    if (text.endsWith(INTRODUCER.slice(0, length)))
      return INTRODUCER.slice(0, length);
  return "";
}

function existingDirectory(path: string): boolean {
  try {
    return statSync(path).isDirectory();
  } catch {
    return false;
  }
}
