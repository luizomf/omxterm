import type { TerminalSurface } from "../terminal-surface/terminal-surface";

// The terminal a snippet was chosen for, captured when the user acts. It never
// follows selection to another pane: once its Surface ends it delivers nothing.
export interface SnippetTarget {
  live(): boolean;
  // Fires once (immediately if already unavailable); closing a preview unsubscribes.
  onUnavailable(listener: () => void): () => void;
  deliver(body: string, submit: boolean): void;
}

export function snippetTarget(
  tab:
    | {
        readonly removed: boolean;
        readonly ended: boolean;
        readonly snippetTargetListeners: Set<() => void>;
        readonly surface?: TerminalSurface | undefined;
      }
    | undefined,
): SnippetTarget | undefined {
  if (!tab?.surface || tab.removed || tab.ended) return undefined;
  const live = () => !tab.removed && !tab.ended && tab.surface !== undefined;
  return {
    live,
    onUnavailable(listener) {
      if (!live()) listener();
      else tab.snippetTargetListeners.add(listener);
      return () => {
        tab.snippetTargetListeners.delete(listener);
      };
    },
    deliver(body, submit) {
      if (live()) void tab.surface?.inject(body, { submit });
    },
  };
}
