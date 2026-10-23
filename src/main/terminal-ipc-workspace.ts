import type { TerminalSessionId } from "../shared/terminal-contract";
import {
  isWorkspaceSnapshot,
  type SerializedPaneLayout,
  type WorkspacePaneLaunch,
  type WorkspaceTabLook,
  type WorkspacePlan,
  type WorkspaceSnapshot,
} from "../shared/workspace";
import type { RejectBoundary } from "./terminal-ipc-boundaries";

// What workspace.json keeps for a pane: a Saved Session, a Quick Connect
// target, or a shell with the directory it was last in.
export type PersistedPane =
  { readonly kind: "shell"; readonly directory?: string } | WorkspacePaneLaunch;

export interface PersistedWorkspaceWindow {
  readonly selected: number;
  readonly tabs: readonly (WorkspaceTabLook & {
    readonly layout: SerializedPaneLayout;
    readonly focused: number;
    readonly panes: readonly PersistedPane[];
  })[];
}

export function persistWindow(
  snapshot: WorkspaceSnapshot,
  directoryOf: (sessionId: TerminalSessionId) => string | undefined,
): PersistedWorkspaceWindow {
  return {
    selected: snapshot.selected,
    tabs: snapshot.tabs.map(({ panes, ...tab }) => ({
      ...tab,
      panes: panes.map((pane): PersistedPane => {
        if (pane.launch) return pane.launch;
        const directory =
          pane.sessionId === null ? undefined : directoryOf(pane.sessionId);
        return directory === undefined
          ? { kind: "shell" }
          : { kind: "shell", directory };
      }),
    })),
  };
}

// One Terminal Window's workspace reports and its restore plan.
export function createWorkspaceRequests(
  options: {
    readonly onWorkspace?: (window: PersistedWorkspaceWindow) => void;
    readonly workspacePlan?: () => WorkspacePlan | null;
    readonly onDetachTab?: (window: PersistedWorkspaceWindow) => void;
  },
  reject: RejectBoundary,
  directoryOf: (sessionId: TerminalSessionId) => string | undefined,
) {
  let latest: WorkspaceSnapshot | undefined;
  const publish = () => {
    if (latest) options.onWorkspace?.(persistWindow(latest, directoryOf));
  };
  return {
    report(payload?: unknown) {
      if (!isWorkspaceSnapshot(payload)) {
        reject("ipc", "invalid-payload");
        return;
      }
      latest = payload;
      publish();
    },
    plan(payload?: unknown): WorkspacePlan | null {
      if (payload !== undefined) {
        reject("ipc", "invalid-payload");
        throw new TypeError("Invalid workspace plan request");
      }
      return options.workspacePlan?.() ?? null;
    },
    // Detach Tab: the renderer sends that tab alone; its shells reopen in
    // the directories they were in, connections reconnect.
    detach(payload?: unknown): boolean {
      if (
        !isWorkspaceSnapshot(payload) ||
        payload.tabs.length !== 1 ||
        !options.onDetachTab
      ) {
        reject("ipc", "invalid-payload");
        return false;
      }
      options.onDetachTab(persistWindow(payload, directoryOf));
      return true;
    },
    // Runs before the window's sessions close, so shells that changed
    // directory without a layout change are saved where they are.
    flush: publish,
  };
}
