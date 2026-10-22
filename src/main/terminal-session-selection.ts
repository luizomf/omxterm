import {
  isTerminalTabSelection,
  type TerminalSessionId,
} from "../shared/terminal-contract";
import type { LocalTerminalSession } from "./local-terminal-session";
import type { RejectBoundary } from "./terminal-ipc-boundaries";

interface SelectableSession {
  readonly session: Pick<LocalTerminalSession, "hasForegroundChildProcess">;
  readonly closed: boolean;
  readonly exited: boolean;
}

// Which session a window has selected, and whether closing it needs the Busy
// Session confirmation (ADR 0017). A split tab reports all of its sessions:
// Close Tab asks when any is Busy, Close Pane only for the focused one.
export function createSessionSelection(
  sessions: ReadonlyMap<TerminalSessionId, SelectableSession>,
  reject: RejectBoundary,
  owner: { readonly onSessionSelected: (sessionId: TerminalSessionId) => void },
  isRouted: (sessionId: TerminalSessionId) => boolean,
) {
  let selectedSessionId: TerminalSessionId | undefined;
  let selectedTabSessionIds: readonly TerminalSessionId[] = [];
  const isBusy = (state: SelectableSession | undefined) =>
    state !== undefined &&
    !state.closed &&
    !state.exited &&
    state.session.hasForegroundChildProcess();
  const hasBusySession = () => [...sessions.values()].some(isBusy);
  const selected = () =>
    selectedSessionId === undefined
      ? undefined
      : sessions.get(selectedSessionId);
  return {
    tabSelected(payload?: unknown) {
      if (!isTerminalTabSelection(payload)) {
        reject("ipc", "invalid-payload");
        return;
      }
      if (!isRouted(payload.sessionId)) return;
      selectedSessionId = payload.sessionId;
      // Siblings must belong to this window; unknown or ended ids are
      // ignored rather than trusted, and the focused session is included.
      selectedTabSessionIds = (
        payload.tabSessionIds ?? [payload.sessionId]
      ).filter((sessionId) => sessions.has(sessionId));
      owner.onSessionSelected(payload.sessionId);
    },
    hasBusySession,
    hasBusySelectedSession() {
      if (!selected()) return hasBusySession();
      return [selectedSessionId!, ...selectedTabSessionIds].some((sessionId) =>
        isBusy(sessions.get(sessionId)),
      );
    },
    hasBusyFocusedSession() {
      const state = selected();
      return state ? isBusy(state) : hasBusySession();
    },
  };
}
