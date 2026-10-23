import type { TerminalSessionId } from "../../shared/terminal-contract";

export interface DirectoryTracker {
  // The OSC 7 URI last reported by a pane's shell.
  report(sessionId: TerminalSessionId, uri: string): void;
  // The focused pane changed.
  focus(sessionId: TerminalSessionId): void;
  // The focused pane's last directory URI, if its shell reported one.
  current(): string | undefined;
  // Runs when the focused pane's directory, or the focused pane, changes.
  subscribe(listener: (uri: string | undefined) => void): () => void;
}

const MAX_TRACKED_SESSIONS = 512;

// Which directory each pane's shell is in, as far as OSC 7 tells, so the
// Files panel can follow the focused terminal.
// focusedSessionId answers which pane has focus; a pane that started before
// its first focus notification is still found.
export function createDirectoryTracker(
  focusedSessionId: () => TerminalSessionId | undefined,
): DirectoryTracker {
  const uris = new Map<TerminalSessionId, string>();
  const listeners = new Set<(uri: string | undefined) => void>();
  let lastFocused: TerminalSessionId | undefined;
  const focused = () => focusedSessionId() ?? lastFocused;
  const current = () => {
    const id = focused();
    return id === undefined ? undefined : uris.get(id);
  };
  // Nobody listens until the Files panel opens, which is after the tabs
  // exist; without listeners nothing asks which pane has focus.
  const notify = () => {
    if (listeners.size === 0) return;
    const uri = current();
    for (const listener of listeners) listener(uri);
  };
  return {
    report(sessionId, uri) {
      uris.delete(sessionId);
      uris.set(sessionId, uri);
      // Closed sessions are never reported again; keep the map bounded.
      if (uris.size > MAX_TRACKED_SESSIONS)
        uris.delete(uris.keys().next().value!);
      if (listeners.size > 0 && sessionId === focused()) notify();
    },
    focus(sessionId) {
      if (sessionId === lastFocused) return;
      lastFocused = sessionId;
      notify();
    },
    current,
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}
