import { randomBytes } from "node:crypto";
import path from "node:path";
import { isSavedSessionId } from "../shared/terminal-launch";
import {
  isWorkspacePaneLaunch,
  isWorkspaceWindowShape,
  type RestoredPane,
  type WorkspacePlan,
} from "../shared/workspace";
import { createApplicationDocumentStore } from "./application-data";
import type {
  PersistedPane,
  PersistedWorkspaceWindow,
} from "./terminal-ipc-workspace";
import type { TerminalIpcControllerOptions } from "./terminal-ipc-types";

// workspace.json: whether to reopen windows at startup and, when enabled,
// the windows open when OMXTerm last quit (Application Data, ADR 0034).
export interface WorkspaceDocument {
  readonly restore: boolean;
  readonly windows: readonly PersistedWorkspaceWindow[];
}

const MAX_WINDOWS = 16;
const MAX_DIRECTORY_LENGTH = 4096;
const EMPTY: WorkspaceDocument = { restore: false, windows: [] };

const isPersistedPane = (value: unknown): value is PersistedPane => {
  if (isWorkspacePaneLaunch(value)) return true;
  if (typeof value !== "object" || value === null) return false;
  const record = value as Record<string, unknown>;
  const keys = Object.keys(record).sort().join(",");
  return (
    record.kind === "shell" &&
    (keys === "kind" ||
      (keys === "directory,kind" &&
        typeof record.directory === "string" &&
        record.directory.length <= MAX_DIRECTORY_LENGTH &&
        !record.directory.includes("\0") &&
        (path.posix.isAbsolute(record.directory) ||
          path.win32.isAbsolute(record.directory))))
  );
};

export function validateWorkspaceDocument(value: unknown): WorkspaceDocument {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    throw new TypeError("workspace must be an object");
  const { restore, windows } = value as Record<string, unknown>;
  if (
    typeof restore !== "boolean" ||
    !Array.isArray(windows) ||
    windows.length > MAX_WINDOWS ||
    !windows.every((window) => isWorkspaceWindowShape(window, isPersistedPane))
  )
    throw new TypeError("workspace is malformed");
  return { restore, windows: windows as PersistedWorkspaceWindow[] };
}

export type WorkspaceWindowOptions = Pick<
  TerminalIpcControllerOptions,
  "onWorkspace" | "workspacePlan" | "resolveRestoredDirectory" | "onDetachTab"
>;

export interface WorkspaceService {
  load(): Promise<void>;
  restoreEnabled(): boolean;
  setRestore(on: boolean): Promise<void>;
  // How many windows to open at startup; queues their plans when allowed.
  startupWindowCount(allowed: boolean): number;
  // Options for one new window; `onClosed` reports when it has closed.
  windowOptions(
    windowId: number,
    onClosed: (listener: () => void) => void,
  ): WorkspaceWindowOptions;
  // Writes the final state while the application exits.
  saveOnExit(): void;
  // How Detach Tab opens the window that restores the tab.
  setWindowOpener(open: () => void): void;
}

export function createWorkspaceService(options: {
  readonly directory: string;
  readonly isDirectory: (directory: string) => boolean;
  readonly savedSession: (
    id: string,
  ) => { readonly name: string; readonly color?: string } | undefined;
  readonly isQuickTarget: (target: string) => boolean;
  // True once a quit is confirmed; a cancelled quit never sets it.
  readonly isQuitting: () => boolean;
}): WorkspaceService {
  const store = createApplicationDocumentStore<WorkspaceDocument>(
    {
      fileName: "workspace.json",
      version: 1,
      empty: () => EMPTY,
      validate: validateWorkspaceDocument,
    },
    { directory: options.directory },
  );
  let document = EMPTY;
  let queue: PersistedWorkspaceWindow[] = [];
  // Latest layout per window; a window closed while others stay open is
  // dropped, the last one (or every window when quitting) is kept.
  const windows = new Map<number, PersistedWorkspaceWindow>();
  const open = new Set<number>();
  const kept = new Set<number>();
  // Restore tokens stay valid for the process, so Reconnect reuses them.
  const directories = new Map<string, string>();
  let openWindow: (() => void) | undefined;

  const restoredPane = (pane: PersistedPane): RestoredPane => {
    if (pane.kind === "saved-session") {
      const session = isSavedSessionId(pane.id)
        ? options.savedSession(pane.id)
        : undefined;
      if (session)
        return {
          kind: "saved-session",
          id: pane.id,
          label: session.name.slice(0, 200),
          ...(session.color ? { color: session.color } : {}),
        };
      return { kind: "shell" };
    }
    if (pane.kind === "quick-ssh")
      return options.isQuickTarget(pane.target) ? pane : { kind: "shell" };
    if (pane.directory === undefined || !options.isDirectory(pane.directory))
      return { kind: "shell" };
    const token = `r${randomBytes(8).toString("hex")}`;
    directories.set(token, pane.directory);
    return { kind: "shell", token };
  };
  const plan = (window: PersistedWorkspaceWindow): WorkspacePlan => ({
    selected: window.selected,
    tabs: window.tabs.map(({ panes, ...tab }) => ({
      ...tab,
      panes: panes.map(restoredPane),
    })),
  });

  return {
    async load() {
      document = (await store.load()).value;
    },
    restoreEnabled: () => document.restore,
    async setRestore(on) {
      // Turning restore off also forgets the saved windows.
      const next = { restore: on, windows: on ? document.windows : [] };
      await store.save(next);
      document = next;
    },
    startupWindowCount(allowed) {
      queue = allowed && document.restore ? [...document.windows] : [];
      return Math.max(1, queue.length);
    },
    windowOptions(windowId, onClosed) {
      const restored = queue.shift();
      let pendingPlan = restored ? plan(restored) : null;
      open.add(windowId);
      onClosed(() => {
        open.delete(windowId);
        if (options.isQuitting() || open.size === 0) kept.add(windowId);
        else windows.delete(windowId);
      });
      return {
        onWorkspace(window) {
          if (open.has(windowId) || kept.has(windowId))
            windows.set(windowId, window);
        },
        workspacePlan() {
          const current = pendingPlan;
          pendingPlan = null;
          return current;
        },
        resolveRestoredDirectory: (token) => directories.get(token),
        // The next window to open takes the detached tab's plan.
        onDetachTab(window) {
          if (!openWindow) return;
          queue.push(window);
          openWindow();
        },
      };
    },
    setWindowOpener(open) {
      openWindow = open;
    },
    saveOnExit() {
      const next: WorkspaceDocument = {
        restore: document.restore,
        windows: document.restore
          ? [...windows.values()]
              .filter((window) => window.tabs.length > 0)
              .slice(0, MAX_WINDOWS)
          : [],
      };
      store.saveSync(next);
      document = next;
    },
  };
}
