import type { TerminalSessionId } from "../shared/terminal-contract";

// OSC 133 command marks a shell prints when the user set it up (ADR 0054):
// `A` (prompt), `C` (the command starts) and `D;<exit code>` (it ended).
// OMXTerm reads them from the pane's output, as it reads OSC 7, and never
// asks for them. Like the rest of the output they are the program's word,
// not proof: an exit code is a bounded integer or nothing, and never logged.
const INTRODUCER = "\u001b]133;";
// A mark longer than this is ignored, so a missing terminator can't make
// main keep a session's output.
const MAX_MARK_LENGTH = 256;
// Command ends kept per session, for waits whose `after` is a little behind.
const MAX_ENDS = 64;
const INT32_MIN = -2_147_483_648;
const UINT32_MAX = 4_294_967_295;
const MARKS = new Set(["A", "B", "C", "D", "I", "N", "P"]);

export interface CommandEnd {
  /** The pane's output position at the end of the output holding the mark. */
  readonly offset: number;
  /** Missing when the shell didn't report one. */
  readonly exitCode?: number;
}

export function createCommandMarks() {
  // Sessions whose shell printed a mark, with the ends it reported.
  const ends = new Map<TerminalSessionId, CommandEnd[]>();
  // An unterminated mark, or a possibly split introducer, per session.
  const carries = new Map<TerminalSessionId, string>();

  const record = (sessionId: TerminalSessionId, body: string, end: number) => {
    // Options after the letter (`;aid=…`, `;redraw=0`) are skipped.
    const [action, code = ""] = body.split(";");
    if (!MARKS.has(action!)) return;
    const list = ends.get(sessionId) ?? [];
    ends.set(sessionId, list);
    if (action !== "D") return;
    const exitCode = /^-?\d{1,10}$/u.test(code) ? Number(code) : undefined;
    list.push(
      exitCode !== undefined && exitCode >= INT32_MIN && exitCode <= UINT32_MAX
        ? { offset: end, exitCode }
        : { offset: end },
    );
    if (list.length > MAX_ENDS) list.shift();
  };

  return {
    /** `end` is the session's output position after `data`. */
    observe(sessionId: TerminalSessionId, data: string, end: number) {
      const carried = carries.get(sessionId);
      if (carried === undefined && !data.includes("\u001b")) return;
      carries.delete(sessionId);
      const text = (carried ?? "") + data;
      let from = 0;
      for (;;) {
        const start = text.indexOf(INTRODUCER, from);
        if (start < 0) {
          const tail = partialIntroducer(text);
          if (tail) carries.set(sessionId, tail);
          return;
        }
        const body = start + INTRODUCER.length;
        const stop = terminator(text, body);
        if (stop === "pending") {
          if (text.length - body <= MAX_MARK_LENGTH)
            carries.set(sessionId, text.slice(start));
          return;
        }
        if (!stop.cancelled && stop.index - body <= MAX_MARK_LENGTH)
          record(sessionId, text.slice(body, stop.index), end);
        from = stop.next;
      }
    },
    /** The pane's shell has printed at least one command mark. */
    reports: (sessionId: TerminalSessionId) => ends.has(sessionId),
    /**
     * The first command end past `after`: the command running then, or the
     * next one. Text typed while a command runs is that command's input, or
     * runs after it.
     */
    endAfter: (
      sessionId: TerminalSessionId,
      after: number,
    ): CommandEnd | undefined =>
      ends.get(sessionId)?.find((end) => end.offset > after),
    forget(sessionId: TerminalSessionId) {
      ends.delete(sessionId);
      carries.delete(sessionId);
    },
  };
}

// BEL or ST ends a mark. CAN, SUB or an ESC that doesn't start ST abandon it,
// as a terminal's parser does.
function terminator(
  text: string,
  from: number,
): { index: number; next: number; cancelled: boolean } | "pending" {
  const ending = /[\u0007\u0018\u001a\u001b]/gu;
  ending.lastIndex = from;
  const match = ending.exec(text);
  if (!match) return "pending";
  const index = match.index;
  if (match[0] === "\u0007")
    return { index, next: index + 1, cancelled: false };
  if (match[0] !== "\u001b") return { index, next: index + 1, cancelled: true };
  if (index + 1 === text.length) return "pending";
  return text[index + 1] === "\\"
    ? { index, next: index + 2, cancelled: false }
    : // The ESC may start the next sequence, such as another mark.
      { index, next: index, cancelled: true };
}

// The longest end of `text` that could begin an introducer in the next chunk.
function partialIntroducer(text: string): string {
  for (let length = INTRODUCER.length - 1; length > 0; length -= 1)
    if (text.endsWith(INTRODUCER.slice(0, length)))
      return INTRODUCER.slice(0, length);
  return "";
}
