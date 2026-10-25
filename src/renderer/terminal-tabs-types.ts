import type { OpenSessionPane } from "./sessions/session-activity";
import type { Translator } from "../shared/i18n";
import type { WorkspacePlan, WorkspaceSnapshot } from "../shared/workspace";
import type {
  TerminalClipboardAction,
  TerminalFontZoom,
  TerminalSessionId,
  TerminalTabCommand,
} from "../shared/terminal-contract";
import type { TerminalLaunchSpec } from "../shared/terminal-launch";
import type { TerminalSessionAdapter } from "../terminal-surface/terminal-session-adapter";
import type {
  TerminalSurface,
  TerminalSurfaceConfiguration,
  TerminalSurfaceOptions,
} from "../terminal-surface/terminal-surface";
import type { ElectronTerminalAdapter } from "./electron-terminal-adapter";
import type { TabStrip } from "./tab-strip";
import type { OutputHighlighter } from "./highlighting/output-highlighter";
import type {
  EndedBannerStrings,
  EndedOffer,
  PaneLaunch,
  TerminalPane,
  TerminalTab,
} from "./terminal-tab-model";

export type MountTerminalSurface = (
  container: HTMLElement,
  adapter: TerminalSessionAdapter,
  options: TerminalSurfaceOptions,
) => Promise<TerminalSurface>;

export type TerminalLaunchPlacement = "tab" | "split-right" | "split-down";

export interface TerminalTabsElements {
  readonly strip: HTMLElement;
  readonly container: HTMLElement;
}

export interface TerminalTabsOptions {
  readonly createAdapter: (
    launch?: TerminalLaunchSpec,
  ) => ElectronTerminalAdapter;
  readonly mount: MountTerminalSurface;
  readonly surfaceOptions: TerminalSurfaceOptions;
  readonly showTabBar?: boolean;
  // How the first tab opens; the Default Shell when absent.
  readonly initialLaunch?: PaneLaunch;
  // A restored workspace replaces the first tab with these tabs.
  readonly initialWorkspace?: WorkspacePlan;
  // The window's layout, after changes settle, for workspace restore.
  readonly onWorkspaceChange?: (snapshot: WorkspaceSnapshot) => void;
  readonly dividerLabel?: string;
  // The accessible name of each terminal area.
  readonly surfaceLabel?: string;
  // Labels for the tab and group menus; English when absent.
  readonly translator?: Translator;
  readonly endedBanner?: EndedBannerStrings;
  // An extra choice for a retained pane that failed, from its launch and the
  // tail of its final output.
  readonly endedOffer?: (
    launch: PaneLaunch,
    output: string,
  ) => Promise<EndedOffer | undefined>;
  // Called after panes, titles or session states change.
  readonly onPanesChange?: () => void;
  // The tooltip of a tab whose focused pane runs an SSH session; the tab
  // then shows a server icon.
  readonly describeRemote?: (pane: {
    readonly launch: PaneLaunch;
    readonly title: string;
    readonly ended: boolean;
    readonly startedAt?: number;
  }) => { readonly tooltip: string } | undefined;
  // Opens the Solution for an SSH session that ended with ssh's error
  // status; reconnect replaces the pane with a new session.
  readonly endedSolution?: (
    launch: PaneLaunch,
    output: string,
    reconnect: () => void,
  ) => void;
  readonly notifyEmpty?: (reason?: "rendering-failure") => void;
  // tabSessionIds is supplied only for split tabs; a single-pane tab keeps
  // the original one-session selection message.
  readonly notifySelection?: (
    sessionId: TerminalSessionId,
    tabSessionIds?: readonly TerminalSessionId[],
  ) => void;
  readonly notifyTitle?: (
    sessionId: TerminalSessionId,
    request: string,
  ) => void;
  readonly notifyBell?: (sessionId: TerminalSessionId) => void;
  readonly syncTitle?: (sessionId: TerminalSessionId) => void;
  readonly onWorkingDirectory?: (
    sessionId: TerminalSessionId,
    uri: string,
  ) => void;
  // Broadcasting starts only after this resolves true (see toggleBroadcast).
  readonly confirmBroadcast?: (targetCount: number) => Promise<boolean>;
  readonly onBroadcastChange?: (targetCount: number) => void;
  // One output highlighter per pane; undefined leaves output untouched.
  readonly createHighlighter?: () => OutputHighlighter;
  // Whether a program runs in any of these sessions (closing asks first).
  readonly paneBusy?: (sessionIds: readonly string[]) => Promise<boolean>;
  // Reopens one tab in a new window (Detach Tab).
  readonly detachTab?: (snapshot: WorkspaceSnapshot) => Promise<boolean>;
}

export interface TerminalTabs {
  readonly ready: Promise<void>;
  handleCommand(command: TerminalTabCommand): void;
  setSessionTitle(sessionId: TerminalSessionId, title: string): void;
  applyConfiguration(configuration: TerminalSurfaceConfiguration): void;
  zoom(command: TerminalFontZoom): void;
  clipboardAction(action: TerminalClipboardAction): void;
  injectText(text: string): void;
  injectSnippet(body: string, options: { readonly submit: boolean }): void;
  toggleTabBar(): void;
  focusSelected(): void;
  focusedSessionId(): TerminalSessionId | undefined;
  // The focused pane's selected text, or "".
  focusedSelection(): string;
  // Raw input to the focused pane, as if typed (control keys included).
  sendKeys(keys: string): void;
  // The focused pane's whole buffer as text, for Save Output to File.
  focusedOutput(): string;
  // Every tab's label in order, for the Open Tabs list.
  tabList(): { readonly label: string; readonly selected: boolean }[];
  selectTab(index: number): void;
  // Every live pane of every tab, for running a command in several.
  paneTargets(): PaneTarget[];
  // The file name printed under a window point in the selected tab.
  fileAtPoint(
    clientX: number,
    clientY: number,
  ): { readonly sessionId: TerminalSessionId; readonly token: string } | null;
  openLaunch(launch: PaneLaunch, placement: TerminalLaunchPlacement): void;
  // Every open pane with its launch and state, for the Sessions sidebar.
  openSessions(): OpenSessionPane[];
  // Selects a tab and focuses one of its panes (1-based positions).
  revealPane(tabNumber: number, paneNumber: number): void;
  dispose(): void;
}

export interface PaneTarget {
  readonly tabLabel: string;
  readonly paneLabel: string;
  // 1-based positions, and how many panes the tab has.
  readonly tabNumber: number;
  readonly paneNumber: number;
  readonly paneCount: number;
  readonly sessionId?: TerminalSessionId;
  // Set by the caller when a program (an editor, a pager) runs in the pane.
  readonly busy?: boolean;
  // The focused pane of the selected tab.
  readonly current: boolean;
  // Types and submits into this pane; false once it has closed.
  run(command: string): boolean;
}

export type PendingClose =
  | { readonly kind: "tab"; readonly tab: TerminalTab }
  | { readonly kind: "pane"; readonly pane: TerminalPane };

// Shared mutable state of one window's Terminal Tabs. The view, lifecycle and
// command modules read it at call time, so they never hold stale copies.
export interface TabsContext {
  readonly document: Document;
  readonly elements: TerminalTabsElements;
  readonly options: TerminalTabsOptions;
  readonly tabs: TerminalTab[];
  readonly strip: TabStrip<TerminalTab>;
  selectedIndex: number;
  zoomSteps: number;
  activeSurfaceOptions: TerminalSurfaceOptions;
  tabBarEnabled: boolean;
  disposed: boolean;
  // Last-tab closure is committed: queued New Tab cannot resurrect it.
  closing: boolean;
  pendingClose: PendingClose | undefined;
  // Broadcast mirrors keyboard input from the focused pane of this tab to
  // every other live pane in it. It is never implicit.
  broadcastTab: TerminalTab | undefined;
}
