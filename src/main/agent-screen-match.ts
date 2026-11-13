// `wait`'s `match` (ADR 0052): looks at the pane's screen as the window
// shows output past `after`, and finds the text once a screen holds more
// copies of it than the fewest it held since `after`. Each screen (main and
// alternate) keeps its own count, so text that was there before a
// full-screen program and comes back after it isn't new; a screen whose
// count isn't known takes it from its first look. When in doubt the wait
// runs on to its timeout rather than answer for an old copy.

import type { TerminalSessionId } from "../shared/terminal-contract";

/** Least time between two looks at a busy pane's screen. */
const LOOK_GAP_MS = 50;

/** One screen read, as `read` with `source: "screen"` answers it. */
export interface ScreenText {
  readonly text: string;
  readonly alternate?: boolean;
  readonly cols?: number;
  readonly rows?: number;
}

export interface ScreenMatchOptions {
  readonly match: string;
  /** Only output past this position counts. */
  readonly after: number;
  /** The screen at `after`, if known; undefined when it isn't. */
  readonly baseline?: Promise<ScreenText | undefined> | undefined;
  /** How far the window has shown the pane's output; undefined once gone. */
  readonly shown: () => number | undefined;
  readonly look: () => Promise<ScreenText>;
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

type Floor = { readonly copies: number; readonly size?: string | undefined };
const screenOf = (screen: ScreenText) =>
  screen.alternate ? "alternate" : "main";
const sizeOf = (screen: ScreenText) =>
  screen.cols === undefined ? undefined : `${screen.cols}x${screen.rows}`;

// The fewest copies each screen held since `after`. The screen that was
// there at `after` starts from its count then; the alternate screen, when
// the main one was there, starts empty (a program switched to it since).
// Any other screen, or one resized since (rows reflow), starts from a look.
function createFloors(match: string) {
  const floors = new Map<string, Floor>();
  return {
    seed(baseline: ScreenText | undefined) {
      if (!baseline) return;
      floors.set(screenOf(baseline), {
        copies: copiesOf(baseline.text, match),
        size: sizeOf(baseline),
      });
      if (baseline.alternate === false) floors.set("alternate", { copies: 0 });
    },
    /** Whether this look shows a copy more than its screen's floor. */
    rises(screen: ScreenText): boolean {
      const key = screenOf(screen);
      const size = sizeOf(screen);
      const floor = floors.get(key);
      const copies = copiesOf(screen.text, match);
      const resized =
        floor?.size !== undefined && size !== undefined && floor.size !== size;
      if (floor && !resized && copies > floor.copies) return true;
      floors.set(key, { copies, size: size ?? floor?.size });
      return false;
    },
  };
}

export function createScreenMatch(options: ScreenMatchOptions) {
  const floors = createFloors(options.match);
  const baseline = (options.baseline ?? Promise.resolve(undefined)).then(
    (screen) => floors.seed(screen),
  );
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
    Promise.all([options.look(), baseline]).then(
      ([screen]) => {
        looking = false;
        if (stopped) return;
        if (floors.rises(screen)) found = lookedAt;
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
  ) => Promise<ScreenText>;
  readonly shown: (sessionId: TerminalSessionId) => number | undefined;
  readonly changed: () => void;
  readonly now: () => number;
}

/**
 * Match waits for one window. It keeps the screen just before each pane's
 * latest send or press, for a wait's `after`: read before the write, so the
 * window answers it before the program can echo anything. A failed read is
 * no baseline: the first look sets the count.
 */
export function createScreenMatches(options: ScreenMatchesOptions) {
  const read = (sessionId: TerminalSessionId, signal: AbortSignal) =>
    options.read(sessionId, { source: "screen" }, signal);
  const lifetime = new AbortController();
  const screens = new Map<
    TerminalSessionId,
    {
      readonly offset: number;
      readonly screen: Promise<ScreenText | undefined>;
    }
  >();
  const quietly = (
    sessionId: TerminalSessionId,
    signal: AbortSignal,
  ): Promise<ScreenText | undefined> => {
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
