import type {
  TerminalSessionId,
  TerminalSize,
} from "../shared/terminal-contract";
import type {
  TerminalSessionAdapter,
  TerminalSessionHandlers,
} from "../terminal-surface/terminal-session-adapter";
import type {
  TerminalSurface,
  TerminalSurfaceGeometry,
} from "../terminal-surface/terminal-surface";
import type { ElectronTerminalAdapter } from "./electron-terminal-adapter";
import { layoutPanes, leaf, type PaneLayout } from "./pane-layout";

export type CreatePaneAdapter = (
  workingDirectoryOf?: TerminalSessionId,
) => ElectronTerminalAdapter;

// One Terminal Surface and its Live Terminal Session (ADR 0016).
export interface TerminalPane {
  readonly tab: TerminalTab;
  readonly container: HTMLElement;
  readonly adapter: ElectronTerminalAdapter;
  readonly mountAbort: AbortController;
  surface: TerminalSurface | undefined;
  geometry: TerminalSurfaceGeometry | undefined;
  label: string;
  removed: boolean;
  startRequested: boolean;
  ended: boolean;
  readonly snippetTargetListeners: Set<() => void>;
  // The grid last sent to the PTY: the reference for split admission.
  size: TerminalSize | undefined;
}

// A Terminal Tab: one or more panes and exactly one focused pane.
export interface TerminalTab {
  readonly container: HTMLElement;
  layout: PaneLayout<TerminalPane>;
  focused: TerminalPane;
  removed: boolean;
}

export function appendTab(
  parent: HTMLElement,
  createAdapter: CreatePaneAdapter,
): TerminalPane {
  const container = parent.ownerDocument.createElement("div");
  container.className = "terminal-tab";
  parent.append(container);
  // Its layout and focused pane are completed once the first pane exists.
  const tab = { container, removed: false } as unknown as TerminalTab;
  const pane = createPane(tab, createAdapter);
  tab.layout = leaf(pane);
  tab.focused = pane;
  container.append(pane.container);
  return pane;
}

export function createPane(
  tab: TerminalTab,
  createAdapter: CreatePaneAdapter,
  workingDirectoryOf?: TerminalSessionId,
): TerminalPane {
  const container = tab.container.ownerDocument.createElement("main");
  container.className = "terminal-surface";
  container.setAttribute("aria-label", "Terminal Surface");
  return {
    tab,
    container,
    adapter: createAdapter(workingDirectoryOf),
    mountAbort: new AbortController(),
    surface: undefined,
    geometry: undefined,
    label: "",
    removed: false,
    startRequested: false,
    ended: false,
    snippetTargetListeners: new Set(),
    size: undefined,
  };
}

// Retained failures remain owned for ACK, but cannot receive snippet delivery.
export function endPane(pane: TerminalPane): void {
  if (pane.ended) return;
  pane.ended = true;
  for (const listener of pane.snippetTargetListeners) listener();
  pane.snippetTargetListeners.clear();
}

export function closePendingPane(pane: TerminalPane): void {
  pane.mountAbort.abort();
  pane.adapter.close();
}

// Disposing a Surface closes its adapter and session; a pane still mounting
// has no Surface yet, so its adapter is closed directly.
export function disposePane(pane: TerminalPane): void {
  endPane(pane);
  if (pane.surface) pane.surface.dispose();
  else closePendingPane(pane);
}

export function tabPanes(tab: TerminalTab): TerminalPane[] {
  return layoutPanes(tab.layout);
}

// The started sessions of a tab, for main's Busy Session count.
export function tabSessionIds(tab: TerminalTab): TerminalSessionId[] {
  return tabPanes(tab).flatMap((pane) => {
    const sessionId = pane.adapter.sessionId();
    return sessionId === undefined || pane.removed || pane.ended
      ? []
      : [sessionId];
  });
}

export function findPaneBySession(
  tabs: readonly TerminalTab[],
  sessionId: TerminalSessionId,
): TerminalPane | undefined {
  for (const tab of tabs)
    for (const pane of tabPanes(tab))
      if (pane.adapter.sessionId() === sessionId) return pane;
  return undefined;
}

export function paneSessionAdapter(
  pane: TerminalPane,
  onSessionEnd: (
    pane: TerminalPane,
    exit: { signal: number; startupFailed?: true },
  ) => void,
  onStarted: () => void,
): TerminalSessionAdapter {
  const { adapter } = pane;
  return {
    start: async (handlers: TerminalSessionHandlers) => {
      pane.startRequested = true;
      await adapter.start({
        onOutput: handlers.onOutput,
        onExit(exit) {
          endPane(pane);
          handlers.onExit(exit);
          onSessionEnd(pane, exit);
        },
      });
      onStarted();
    },
    write: (data) => adapter.write(data),
    resize: (size) => {
      pane.size = size;
      adapter.resize(size);
    },
    close: (reason) => adapter.close(reason),
  };
}
