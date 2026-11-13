// `wait`'s `match` (ADR 0052): looks at the pane's screen as the window
// shows output past `after`, and finds the text once the screen holds more
// copies of it than it did at `after`. An old copy still on screen never
// answers; a new one does, even if it landed before the wait arrived.

import type { TerminalSessionId } from "../shared/terminal-contract";

/** Least time between two looks at a busy pane's screen. */
const LOOK_GAP_MS = 50;

export interface ScreenMatchOptions {
  readonly match: string;
  /** Only output past this position counts. */
  readonly after: number;
  /**
   * The screen at `after`. Without one, or if it couldn't be read, every
   * copy counts once the window shows output past `after`.
   */
  readonly baseline?: Promise<string | undefined> | undefined;
  /** How far the window has shown the pane's output; undefined once gone. */
  readonly shown: () => number | undefined;
  /** The pane's screen text, as `read` with `source: "screen"` answers it. */
  readonly look: () => Promise<string>;
  /** A look settled: check the wait again. */
  readonly changed: () => void;
  readonly now: () => number;
}

export function copiesOf(text: string, match: string): number {
  let copies = 0;
  for (
    let at = text.indexOf(match);
    at !== -1;
    at = text.indexOf(match, at + match.length)
  )
    copies += 1;
  return copies;
}

export function createScreenMatch(options: ScreenMatchOptions) {
  const baseline = (options.baseline ?? Promise.resolve(undefined)).then(
    (text) => (text === undefined ? 0 : copiesOf(text, options.match)),
  );
  // The fewest copies seen since `after`: an old copy that scrolled off
  // stops counting, so a new one isn't hidden behind it.
  let fewest: number | undefined;
  let found: number | undefined;
  let failure: unknown;
  let looking = false;
  let lookedAt = -1;
  let lastLook = -Infinity;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;

  const lookAgain = (): void => {
    if (stopped || looking || timer || found !== undefined) return;
    const shown = options.shown();
    if (shown === undefined || shown <= options.after || shown === lookedAt)
      return;
    const gap = lastLook + LOOK_GAP_MS - options.now();
    if (gap > 0) {
      timer = setTimeout(() => {
        timer = undefined;
        lookAgain();
      }, gap);
      return;
    }
    looking = true;
    lookedAt = shown;
    lastLook = options.now();
    Promise.all([baseline, options.look()]).then(
      ([before, text]) => {
        looking = false;
        if (stopped) return;
        const copies = copiesOf(text, options.match);
        fewest = Math.min(fewest ?? before, copies);
        if (copies > fewest) found = lookedAt;
        options.changed();
      },
      (error: unknown) => {
        looking = false;
        if (stopped) return;
        failure = error;
        options.changed();
      },
    );
  };

  return {
    /** The offset the screen showed when the text appeared, if it has. */
    check(): number | undefined {
      if (failure !== undefined) throw failure;
      lookAgain();
      return found;
    },
    stop() {
      stopped = true;
      clearTimeout(timer);
    },
  };
}

export interface ScreenMatchesOptions {
  /** The window's text for one pane, as `read` answers it. */
  readonly read: (
    sessionId: TerminalSessionId,
    read: { readonly source: "screen" },
    signal: AbortSignal,
  ) => Promise<{ readonly text: string }>;
  readonly shown: (sessionId: TerminalSessionId) => number | undefined;
  readonly changed: () => void;
  readonly now: () => number;
}

/**
 * Match waits for one window. It keeps the screen just before each pane's
 * latest send or press, for a wait's `after`: read before the write, so the
 * window answers it before the program can echo anything. A failed read is
 * no baseline.
 */
export function createScreenMatches(options: ScreenMatchesOptions) {
  const read = (sessionId: TerminalSessionId, signal: AbortSignal) =>
    options
      .read(sessionId, { source: "screen" }, signal)
      .then((screen) => screen.text);
  const lifetime = new AbortController();
  const screens = new Map<
    TerminalSessionId,
    { readonly offset: number; readonly screen: Promise<string | undefined> }
  >();
  const quietly = (sessionId: TerminalSessionId, signal: AbortSignal) => {
    try {
      return read(sessionId, signal).catch(() => undefined);
    } catch {
      return Promise.resolve(undefined);
    }
  };
  return {
    remember(sessionId: TerminalSessionId, offset: number) {
      screens.set(sessionId, {
        offset,
        screen: quietly(sessionId, lifetime.signal),
      });
    },
    /**
     * Looks for `match` past `after`. The screen at `after` is the one
     * remembered for it, or the screen now when nothing has arrived since
     * (`sent`); otherwise unknown.
     */
    watch(
      sessionId: TerminalSessionId,
      match: string,
      after: number,
      sent: number,
      signal: AbortSignal,
    ) {
      const remembered = screens.get(sessionId);
      return createScreenMatch({
        match,
        after,
        baseline:
          remembered?.offset === after
            ? remembered.screen
            : after === sent
              ? quietly(sessionId, signal)
              : undefined,
        shown: () => options.shown(sessionId),
        look: () => read(sessionId, signal),
        changed: options.changed,
        now: options.now,
      });
    },
    forget(sessionId: TerminalSessionId) {
      screens.delete(sessionId);
    },
    dispose() {
      lifetime.abort();
      screens.clear();
    },
  };
}
