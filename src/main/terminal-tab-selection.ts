import type { TerminalSessionId } from "../shared/terminal-contract";
import {
  isTerminalSessionStart,
  isTerminalTabSelection,
  type TerminalSessionStart,
} from "../shared/terminal-panes";
import { isSurfaceFontIdentity } from "../shared/user-configuration";

// The renderer-reported selection of one Terminal Window: the selected tab's
// focused pane, and every session of that tab for Close Tab's Busy count.
export function createTabSelection<State>(options: {
  readonly routed: (sessionId: TerminalSessionId) => State | undefined;
  readonly current: (sessionId: TerminalSessionId) => State | undefined;
  readonly isBusy: (state: State) => boolean;
  readonly hasBusySession: () => boolean;
  readonly reject: () => void;
  readonly onSessionSelected: (sessionId: TerminalSessionId) => void;
}) {
  let focused: TerminalSessionId | null = null;
  let tab: readonly TerminalSessionId[] | undefined;
  return {
    tabSelected(payload?: unknown) {
      if (!isTerminalTabSelection(payload)) {
        options.reject();
        return;
      }
      // Legacy one-session notifications must still name a live owned session.
      // A full snapshot also represents pending/retired focus and an empty tab.
      if (
        payload.tabSessionIds === undefined &&
        (payload.sessionId === null || !options.routed(payload.sessionId))
      )
        return;
      focused = payload.sessionId;
      tab = payload.tabSessionIds ?? (focused === null ? [] : [focused]);
      if (focused !== null && options.current(focused))
        options.onSessionSelected(focused);
    },
    hasBusySelectedSession() {
      if (tab === undefined) return options.hasBusySession();
      const states = tab.flatMap((id) => {
        const state = options.current(id);
        return state === undefined ? [] : [state];
      });
      return states.some(options.isBusy);
    },
    hasBusyFocusedSession() {
      if (tab === undefined) return options.hasBusySession();
      const state = focused === null ? undefined : options.current(focused);
      return state !== undefined && options.isBusy(state);
    },
  };
}

// A legacy start names only a Surface identity; a pane start may also name
// the session whose reported directory it inherits.
export function terminalSessionStart(
  payload: unknown,
  reject: () => void,
): TerminalSessionStart {
  if (payload === undefined) return {};
  if (typeof payload === "string") return { surfaceId: payload };
  if (!isTerminalSessionStart(payload, isSurfaceFontIdentity)) {
    reject();
    throw new TypeError("Invalid terminal start payload");
  }
  return payload;
}
