import type { Translator } from "../../shared/i18n";
import type { SavedSessionsDocument } from "../../shared/saved-sessions";
import type { SessionsBridge } from "../../shared/terminal-bridge";
import type { PaneLaunch } from "../terminal-tab-model";
import {
  remoteTabTooltip,
  sessionDetailLines,
  sshTarget,
  type SessionPaneCount,
} from "./session-details";

// One open pane as the tabs report it.
export interface OpenSessionPane {
  readonly launch: PaneLaunch;
  readonly title: string;
  readonly ended: boolean;
  readonly startedAt?: number;
  // 1-based positions, and how many panes the tab has.
  readonly tabNumber: number;
  readonly paneNumber: number;
  readonly paneCount: number;
}

// Which Saved Sessions run in this window's panes: the Sessions sidebar's
// status dots and open-pane menu, and the SSH tab icon and tooltip. It keeps
// the definitions main broadcasts; panes report changes through
// panesChanged.
export interface SessionActivity {
  definitions(): SavedSessionsDocument;
  panesChanged(): void;
  subscribe(listener: () => void): () => void;
  // The tooltip of a tab whose focused pane is an SSH session.
  describeRemote(pane: {
    readonly launch: PaneLaunch;
    readonly title: string;
    readonly ended: boolean;
    readonly startedAt?: number;
  }): { readonly tooltip: string } | undefined;
  dispose(): void;
}

export function createSessionActivity(
  bridge: Pick<SessionsBridge, "list" | "onChanged">,
  translator: Translator,
): SessionActivity {
  let definitions: SavedSessionsDocument = { folders: [], sessions: [] };
  let disposed = false;
  const listeners = new Set<() => void>();
  const notify = () => {
    if (!disposed) for (const listener of [...listeners]) listener();
  };
  const update = (document: SavedSessionsDocument) => {
    definitions = document;
    notify();
  };
  void bridge
    .list()
    .then(update)
    .catch(() => {});
  const stopChanges = bridge.onChanged(update);
  return {
    definitions: () => definitions,
    panesChanged: notify,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    describeRemote(pane) {
      const spec = pane.launch.spec;
      if (spec?.kind === "quick-ssh")
        return {
          tooltip: remoteTabTooltip(
            pane,
            { connection: spec.target },
            [],
            translator,
          ),
        };
      if (spec?.kind !== "saved-session") return undefined;
      const session = definitions.sessions.find(
        (candidate) => candidate.id === spec.id,
      );
      if (session?.kind !== "ssh") return undefined;
      // The header names the kind already.
      const details = sessionDetailLines(
        session,
        definitions,
        translator,
      ).slice(1);
      return {
        tooltip: remoteTabTooltip(
          pane,
          { name: session.name, connection: sshTarget(session) },
          details,
          translator,
        ),
      };
    },
    dispose() {
      disposed = true;
      listeners.clear();
      stopChanges();
    },
  };
}

// Open and running panes of each Saved Session in this window.
export function countSessionPanes(
  panes: readonly OpenSessionPane[],
): ReadonlyMap<string, SessionPaneCount> {
  const counts = new Map<string, { open: number; running: number }>();
  for (const pane of panes) {
    const spec = pane.launch.spec;
    if (spec?.kind !== "saved-session") continue;
    const count = counts.get(spec.id) ?? { open: 0, running: 0 };
    count.open += 1;
    if (!pane.ended) count.running += 1;
    counts.set(spec.id, count);
  }
  return counts;
}

// The Sessions panel's view of this window's panes, when activity is known.
export function openPanesOption(
  tabs: {
    openSessions(): OpenSessionPane[];
    revealPane(tabNumber: number, paneNumber: number): void;
  },
  activity: SessionActivity | undefined,
) {
  return activity
    ? {
        openPanes: {
          list: () => tabs.openSessions(),
          reveal: (pane: OpenSessionPane) =>
            tabs.revealPane(pane.tabNumber, pane.paneNumber),
          subscribe: activity.subscribe,
        },
      }
    : {};
}
