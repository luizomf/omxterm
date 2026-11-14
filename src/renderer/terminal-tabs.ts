/* eslint-disable max-lines -- The window-owned tab lifecycle shares its selection and focus state here. */
import { createMirrorTyping } from "./mirror-typing";
import type { MirrorTypingBridge } from "../shared/mirror-typing";
import { createTerminalTabsLayout } from "./terminal-tabs-layout";
import {
  createStateMarks,
  type StateMark,
  type StateText,
} from "./state-marks";
import {
  agentScreen,
  agentTail,
  type AgentActionResult,
  type AgentPaneRead,
  type AgentWindowCommand,
  type AgentModesResult,
  type AgentPressResult,
  type AgentReadResult,
  type AgentTabsResult,
  MAX_AGENT_TABS,
  MAX_AGENT_TAB_PANES,
  MAX_AGENT_TAB_TITLE,
} from "../shared/agent-access";
import type { AgentKeyChord } from "../shared/agent-api";
import { agentPaneModes, encodeAgentKeys } from "./agent-access";
import { createPaneAttention } from "./pane-attention";
import { createLayoutSaveNotice } from "./layout-save-notice";
import type {
  InitialLayout,
  TerminalLayoutBridge,
} from "../shared/terminal-layout";
import {
  activateTabContent,
  disposeTabContent,
  focusApplicationTab,
  focusPane,
  captureActionTarget,
} from "./application-tab-content";
import type { HostedTab } from "./hosted-content-tabs";
import { createGraphicalTabs } from "./graphical-tabs";
import type { HostedContentBridge } from "../shared/extension-view";
import type { SettingsBridge } from "../shared/settings";
import type { SettingsTab } from "./settings-tab";
import { retainDismissalGesture } from "./about/about-dialog";
import type { SettingsTabSelection } from "../shared/terminal-panes";
import type {
  TerminalClipboardAction,
  TerminalContextMenuTarget,
  TerminalExportContext,
  TerminalExportSaveRequest,
  TerminalFontZoom,
  TerminalSessionId,
  TerminalTabCommand,
} from "../shared/terminal-contract";
import type {
  TerminalClipboard,
  TerminalSurface,
  TerminalSurfaceConfiguration,
  TerminalSurfaceOptions,
} from "../terminal-surface/terminal-surface";
import type { TerminalSessionAdapter } from "../terminal-surface/terminal-session-adapter";
import { createApplicationTabCommands } from "./application-tab-commands";
import { createTerminalTabConfiguration } from "./terminal-tab-configuration";
import { snippetTarget, type SnippetTarget } from "./snippet-target";
import { englishLanguage, type RendererLanguage } from "./renderer-language";
import { createPaneOperations } from "./terminal-pane-operations";
import { createPaneMount } from "./terminal-pane-mount";
import {
  terminalPaneEnded,
  terminalTabCreator,
  relabelEndedPane,
} from "./terminal-tab-lifetime";
import {
  createPaneContextMenu,
  type TerminalHostClipboard,
} from "./terminal-pane-context-menu";
import {
  disposePane,
  findPaneBySession,
  endPane,
  tabPanes,
  tabSessionIds,
  type CreatePaneAdapter,
  type TerminalPane,
  type TerminalTab,
} from "./terminal-panes";

import { createApplicationTabStrip } from "./application-tab-strip";

// Below main's 3 s window answer, so a late command never runs after it.
const AGENT_ACTIVATION_MS = 2000;
export { TERMINAL_TAB_DRAG_DATA_TYPE } from "./application-tab-strip";

type MountTerminalSurface = (
  container: HTMLElement,
  adapter: TerminalSessionAdapter,
  options: TerminalSurfaceOptions,
) => Promise<TerminalSurface>;

export interface TerminalTabsElements {
  readonly strip: HTMLElement;
  readonly container: HTMLElement;
}

export type ApplicationTab = TerminalTab | SettingsTab | HostedTab;

export interface TerminalTabsOptions {
  readonly mirrorTyping?: MirrorTypingBridge | undefined;
  readonly initialLayout?: InitialLayout | undefined;
  readonly layout?: TerminalLayoutBridge | undefined;
  readonly hostedContent?: HostedContentBridge | undefined;
  readonly hostedPresentation?: ReturnType<
    typeof import("./hosted-content-presentation").createHostedContentPresentation
  >;
  readonly selectContent?: (
    tab: ApplicationTab,
    activate: (focusAllowed?: boolean) => void,
    passive: boolean,
    // False keeps an extension's view from taking native focus.
    nativeFocus?: boolean,
  ) => void;
  readonly isSshSourceForeground?: (id: string) => boolean;
  // The hosted dialog shown over the selected tab, if any.
  readonly isDialogShown?: (id?: string) => boolean;
  // Closes the shown hosted dialog; false when none is shown.
  readonly closeDialog?: () => boolean;
  readonly onGraphicalSelected?: () => void;
  readonly settings?: SettingsBridge;
  readonly extensions?: import("../shared/extensions").ExtensionsBridge;
  readonly onSettingsSelected?: () => void;
  readonly language?: RendererLanguage;
  // A split pane passes its source session to inherit a reported directory.
  readonly createAdapter: CreatePaneAdapter;
  readonly sshPane?:
    ((token: string, accepted: boolean | null) => void) | undefined;
  readonly mount: MountTerminalSurface;
  readonly surfaceOptions: Omit<TerminalSurfaceOptions, "clipboard"> & {
    readonly clipboard?: TerminalHostClipboard;
  };
  readonly showTabBar?: boolean;
  readonly showPaneMarks?: boolean;
  readonly canFocus?: () => boolean;
  // A deliberate mount may restore focus if no control took focus while it
  // was pending. Other passive paths pass false.
  readonly canAutoFocus?: (unchangedFocus: boolean) => boolean;
  readonly notifyEmpty?: (reason?: "rendering-failure") => void;
  // The selected tab's focused pane and every started session of that tab.
  readonly notifySelectionRevision?: ((revision: number) => void) | undefined;
  readonly notifySelection?: (
    sessionId: TerminalSessionId | null | SettingsTabSelection,
    tabSessionIds: readonly TerminalSessionId[],
  ) => void;
  readonly notifyTitle?: (
    sessionId: TerminalSessionId,
    request: string,
  ) => void;
  readonly notifyBell?: (sessionId: TerminalSessionId) => void;
  readonly notifyDesktop?: (
    sessionId: TerminalSessionId,
    notification: import("../shared/terminal-attention").TerminalNotification,
  ) => void;
  readonly syncTitle?: (sessionId: TerminalSessionId) => void;
  // The window's title bar, for an agent's shortcut; false when it can't.
  readonly toggleTitleBar?: () => boolean;
}

export interface TerminalTabs {
  readonly ready: Promise<void>;
  openSettings(
    destination?: import("./settings/settings-dialog").SettingsDestination,
  ): void;
  isSettingsSelected(): boolean;
  isTerminalSelected(): boolean;
  openOverlay(open: () => void, refused?: () => void): void;
  setBlocked(blocked: boolean): void;
  editSettingsClipboard(
    action: TerminalClipboardAction,
    clipboard: TerminalSurfaceOptions["clipboard"],
  ): boolean;
  handleCommand(command: TerminalTabCommand): void;
  setSessionTitle(sessionId: TerminalSessionId, title: string): void;
  // Main's verdict for a session's attention mark (ADR 0053).
  setSessionAttention(sessionId: TerminalSessionId, pending: boolean): void;
  // A mark on every pane and tab of the window (ADR 0052).
  setWindowMark(owner: string, mark: StateMark | undefined): void;
  flash(text: StateText): void;
  // One session's last lines or active screen, hidden tabs included.
  readSession(
    id: string,
    sessionId: TerminalSessionId,
    read: AgentPaneRead,
  ): AgentReadResult;
  // An agent's keys encoded for one session's current modes, hidden tabs
  // included; main writes them.
  encodeSessionKeys(
    id: string,
    sessionId: TerminalSessionId,
    keys: readonly AgentKeyChord[],
  ): AgentPressResult;
  // The modes a send's paste depends on, for one session, hidden tabs
  // included.
  sessionModes(id: string, sessionId: TerminalSessionId): AgentModesResult;
  // The window's tabs for the agent API: ids, titles and the sessions of
  // each tab's panes (settings and hosted tabs have none).
  agentTabs(id: string): AgentTabsResult;
  // An agent's tab or pane shortcut: focus the session's pane, selecting its
  // tab, then run the command there, as the user's click and press would.
  // allowed() is checked again right before the command runs: a stopped
  // grant never runs a command it already handed over.
  runSessionCommand(
    id: string,
    sessionId: TerminalSessionId,
    command: AgentWindowCommand,
    allowed?: () => boolean,
  ): Promise<AgentActionResult>;
  // Drops one waiting agent command, or all of them, as unavailable.
  cancelAgentCommands(id?: string): void;
  applyConfiguration(configuration: TerminalSurfaceConfiguration): void;
  zoom(command: TerminalFontZoom): void;
  clipboardAction(
    action: TerminalClipboardAction,
    target?: TerminalContextMenuTarget,
  ): void;
  exportRequest(
    context: TerminalExportContext,
    allowed: boolean,
  ): TerminalExportSaveRequest | undefined;
  fieldClipboard(
    clipboard?: TerminalHostClipboard,
  ): TerminalClipboard | undefined;
  find(): void;
  injectText(text: string): void;
  // The selected live terminal, captured for one snippet action.
  captureSnippetTarget(): SnippetTarget | undefined;
  fileDropArea(event: DragEvent): HTMLElement | undefined;
  selectionRevision(): number;
  selectedSessionId(): TerminalSessionId | undefined;
  captureActionTarget(): { isCurrent(): boolean };
  toggleTabBar(): void;
  togglePaneMarks(): void;
  focusSelected(): void;
  dispose(): void;
}

// eslint-disable-next-line max-lines-per-function -- Keep window-owned lifecycle closures together; layout mechanics live in terminal-tabs-layout.
export function createTerminalTabs(
  elements: TerminalTabsElements,
  options: TerminalTabsOptions,
): TerminalTabs {
  let mirror: ReturnType<typeof createMirrorTyping> | undefined;
  let contentReady = true;
  let automaticFocusAllowed = true;
  const canFocus = options.canFocus;
  const canAutoFocus = options.canAutoFocus;
  options = {
    ...options,
    canFocus: () => contentReady && canFocus?.() !== false,
    canAutoFocus: (unchangedFocus) =>
      automaticFocusAllowed && canAutoFocus?.(unchangedFocus) !== false,
  };
  const language = options.language ?? englishLanguage;
  const tabs: ApplicationTab[] = [];
  const terminalTabs = () =>
    tabs.filter((tab): tab is TerminalTab => tab.kind === "terminal");
  const keyboard = retainDismissalGesture(elements.container.ownerDocument);
  let tabBarEnabled = options.showTabBar ?? true;
  let selectedIndex = -1;
  const configuration = createTerminalTabConfiguration(
    options.surfaceOptions,
    terminalTabs,
  );
  let disposed = false;
  let closing = false;
  let actionGeneration = 0;
  const selectionChanged = () => {
    actionGeneration += 1;
    options.notifySelectionRevision?.(actionGeneration);
  };
  let lastFocusedPane: TerminalPane | undefined;

  const notifyEmpty = (reason?: "rendering-failure") => {
    if (disposed || closing || tabs.length !== 0) return;
    // Commit last-tab closure: a later queued New Tab cannot resurrect it.
    closing = true;
    options.notifyEmpty?.(reason);
  };

  const selectedApplicationTab = () => tabs[selectedIndex];
  const marks = createStateMarks(
    elements.container.ownerDocument,
    language,
    () => renderStrip(),
    {
      panes: () => terminalTabs().flatMap(tabPanes),
      corner: elements.container,
      // Whenever no pane shows them: a tab button's glyph can't be clicked,
      // and the grant's mark is the one-click stop (ADR 0052).
      // A terminal tab's panes show only once its content is ready (an
      // extension's view hides first), so the corner stays until then.
      cornerShown: () => {
        const tab = selectedApplicationTab();
        return !!tab && (tab.kind !== "terminal" || !contentReady);
      },
    },
  );
  marks.showCapsule(options.showPaneMarks ?? true);
  const attention = createPaneAttention(marks);
  const layout = createTerminalTabsLayout(
    elements.container,
    tabs,
    options,
    selectedApplicationTab,
    () => disposed || closing,
  );
  const selectedTab = () => {
    const tab = selectedApplicationTab();
    return tab?.kind === "terminal" ? tab : undefined;
  };
  const focusedPane = () => (disposed ? undefined : selectedTab()?.focused);
  const interactivePane = () => (contentReady ? focusedPane() : undefined);
  const contextMenu = createPaneContextMenu({
    focusedPane,
    disposed: () => disposed,
    canInteract: () => options.canFocus?.() !== false,
  });
  const strip = createApplicationTabStrip(elements.strip, tabs, {
    label: (tab, index) => tabLabel(tab, index, language),
    marks: (tab) => marks.tab(tab.kind === "terminal" ? tab : undefined),
    select: (tab) => select(tabs.indexOf(tab)),
    canInteract: () => !disposed && options.canFocus?.() !== false,
    reordered(reorder) {
      const selected = selectedApplicationTab();
      reorder();
      selectedIndex = selected ? tabs.indexOf(selected) : -1;
      renderStrip();
      // Tell main the order changed so Saved Layout remembers it. Action
      // targets stay valid: the selected tab and pane didn't change.
      const tab = selectedTab();
      if (tab) notifyFocus(tab);
    },
  });
  const renderStrip = () => {
    strip.render(selectedIndex, tabBarEnabled);
    marks.refreshCorner();
  };

  // Selection is a complete snapshot even while focus has no live session.
  const notifyFocus = (tab: TerminalTab) => {
    if (disposed || tab !== selectedTab()) return;
    const focused = tab.focused;
    if (lastFocusedPane !== focused) selectionChanged();
    lastFocusedPane = focused;
    contextMenu.selectionChanged();
    const sessionId = focused.ended
      ? null
      : (focused.adapter.sessionId() ?? null);
    options.notifySelection?.(sessionId, tabSessionIds(tab));
    mirror?.changed();
  };

  const toggleTabBar = () => {
    if (disposed) return;
    tabBarEnabled = !tabBarEnabled;
    renderStrip();
    focusPane(focusedPane(), options, true);
  };
  // An agent's shortcut, once its pane is focused (ADR 0052). Copy and
  // Select All take that pane, as the user's would after a click on it.
  const runAgentCommand = (
    pane: TerminalPane,
    command: AgentWindowCommand,
  ): boolean => {
    switch (command.action) {
      case "zoom":
        configuration.zoom(command.zoom);
        return true;
      case "copy":
        void pane.surface?.copy();
        return true;
      case "select-all":
        pane.surface?.selectAll();
        return true;
      case "toggle-tab-bar":
        toggleTabBar();
        return true;
      case "toggle-title-bar":
        return options.toggleTitleBar?.() ?? false;
      default:
        commands.handle(command);
        return true;
    }
  };

  let agentSelection = false;
  // Agent commands waiting for their tab's content to show.
  const activated = new Map<string, { shown(): void; cancel(): void }>();
  const select = (
    index: number,
    passive = false,
    mirrorReady?: { ready(): void; current(): boolean },
  ) => {
    const tab = tabs[index];
    // Lifecycle selection stays deliverable; requested navigation is guarded.
    if (!tab || (!passive && canFocus?.() === false)) return;
    const changed = selectedApplicationTab() !== tab;
    if (changed) selectionChanged();
    // Leaving the tab, or the setup dialog shown over it, cancels a Start.
    if ((changed || options.isDialogShown?.()) && !mirrorReady) mirror?.stop();
    selectedIndex = index;
    layout.selected(tab);
    renderStrip();
    contextMenu.selectionChanged();
    if (tab.kind === "hosted") options.notifySelection?.(null, []);
    contentReady = false;
    marks.refreshCorner();
    const activate = (focusAllowed = true) => {
      contentReady = true;
      automaticFocusAllowed = focusAllowed;
      activateTabContent(
        tabs,
        tab,
        changed,
        passive || !focusAllowed,
        !focusAllowed || (mirrorReady && !mirrorReady.current())
          ? { ...options, canFocus: () => false }
          : options,
        notifyFocus,
      );
      mirrorReady?.ready();
      marks.refreshCorner();
      for (const waiter of [...activated.values()]) waiter.shown();
    };
    // An agent's shortcut never pulls native focus into a window the user
    // isn't in (ADR 0052): focusing an extension's view would raise it.
    const nativeFocus =
      !agentSelection || elements.container.ownerDocument.hasFocus();
    if (options.selectContent)
      options.selectContent(tab, activate, passive, nativeFocus);
    else
      hosted.select(
        tab.kind === "hosted" ? tab : undefined,
        activate,
        tab,
        nativeFocus,
      );
  };

  const removeTab = (tab: ApplicationTab, notify = true) => {
    const selected = selectedApplicationTab();
    const index = tabs.indexOf(tab);
    if (tab.removed || index < 0) return;
    tab.removed = true;
    layout.removed(tab);
    if (tab.kind === "settings") tab.view.dispose();
    else if (tab.kind === "hosted") hosted.forget(tab);
    else if (tab.kind === "terminal")
      for (const pane of tabPanes(tab)) {
        pane.removed = true;
        endPane(pane);
      }
    tabs.splice(index, 1);
    tab.container.remove();
    if (tabs.length === 0) {
      selectedIndex = -1;
      hosted.select(undefined, () => {});
      renderStrip();
      if (notify) notifyEmpty();
      return;
    }
    if (index < selectedIndex) selectedIndex -= 1;
    const nextIndex = Math.min(selectedIndex, tabs.length - 1);
    // Splicing a selected tab already puts its neighbor at the same index.
    // Preserve the identity transition so graphical activation/focus still run.
    if (selected === tab) selectedIndex = -1;
    select(nextIndex, true);
  };

  const closeTab = (tab: ApplicationTab | undefined) => {
    if (!tab || tab.removed) return;
    if (tab.kind === "hosted") {
      hosted.close(tab, () => removeTab(tab));
      return;
    }
    const panes = tab.kind === "terminal" ? tabPanes(tab) : [];
    removeTab(tab);
    for (const pane of panes) disposePane(pane);
  };

  const onSessionEnd = (
    pane: TerminalPane,
    exit: import("../shared/terminal-contract").TerminalExit,
  ) => {
    if (disposed) return;
    attention.ended(pane);
    if (pane.removed) return;
    terminalPaneEnded(pane, exit, panes, keyboard, notifyFocus, language.t);
  };

  const mountPaneSurface = createPaneMount({
    document: elements.container.ownerDocument,
    options,
    surfaceOptions: configuration.current,
    zoomSteps: configuration.zoomSteps,
    disposed: () => disposed,
    selectedTab,
    onSessionEnd,
    notifyFocus,
    removePane: (pane, notify) => panes.removePane(pane, notify),
    notifyEmpty,
    focus: (pane, unchanged) => {
      if (pane.tab === selectedTab()) focusPane(pane, options, true, unchanged);
    },
    focusClicked: (pane) => panes.focusPane(pane.tab, pane, true),
    captureContextMenuTarget: contextMenu.capture,
    fieldClipboard: contextMenu.fieldClipboard,
    routeKeyInput: (pane, data) => mirror?.route(pane, data) ?? false,
    onSemanticInput: (pane) => mirror?.semantic(pane),
    onProgress: (pane, active) => attention.progress(pane, active),
    onAttention: (pane) => attention.progress(pane, false),
  });
  // Every pane gets the window's marks from the start, wherever it opens.
  const mountPane = (pane: TerminalPane) => {
    marks.attach(pane);
    return mountPaneSurface(pane);
  };

  const panes = createPaneOperations({
    selectedTab,
    takeContextMenuPane: contextMenu.take,
    removeTab,
    createAdapter: options.createAdapter,
    mountPane,
    focusSurface: (pane, passive) => {
      if (pane.tab === selectedTab()) focusPane(pane, options, passive);
    },
    canInteract: () => options.canFocus?.() !== false,
    surfaceLabel: () => language.t("terminal.surface"),
    resizeLabel: () => language.t("pane.resize"),
    onFocusChange: (tab) => {
      notifyFocus(tab);
      renderStrip();
    },
    disposed: () => disposed,
  });

  const removeLanguage = bindTabLabels(language, terminalTabs, renderStrip);

  const createTab = terminalTabCreator(elements.container, tabs, options, {
    selected: selectedApplicationTab,
    select,
    render: renderStrip,
    panes,
    mount: mountPane,
  });

  const tabOwner = {
    canFocus,
    available: () => !disposed && !closing,
    selected: selectedApplicationTab,
    select,
    close: closeTab,
    remove: removeTab,
    render: renderStrip,
  };
  const { hosted, settingsActions } = createGraphicalTabs(
    tabs,
    elements.container,
    options,
    language,
    keyboard,
    tabOwner,
  );
  const commands = createApplicationTabCommands(tabs, {
    ...tabOwner,
    create: createTab,
    openSsh: (command) => void createTab(command).catch(() => {}),
    refuseSsh: (token) => options.sshPane?.(token, false),
    closeSession: (id) =>
      panes.closePane(findPaneBySession(terminalTabs(), id)),
    pane: panes.handleCommand,
    extensions: options.extensions,
    closeDialog: options.closeDialog,
    canOpenSnippets: () => !!interactivePane(),
    openSnippetsManagement: () =>
      settingsActions.openSettings({ page: "extensions", reason: "snippets" }),
  });
  const layoutSaved = createLayoutSaveNotice(marks);
  // A clicked notification: select the session's tab and focus its pane.
  const revealSession = (sessionId: TerminalSessionId) => {
    const pane = findPaneBySession(terminalTabs(), sessionId);
    if (disposed || !pane || pane.removed || pane.tab.removed) return;
    if (pane.tab === selectedTab()) {
      panes.focusPane(pane.tab, pane, true);
      return;
    }
    pane.tab.focused = pane;
    panes.renderTab(pane.tab);
    select(tabs.indexOf(pane.tab));
  };
  if (options.mirrorTyping)
    mirror = createMirrorTyping({
      bridge: options.mirrorTyping,
      parent: elements.container,
      marks,
      selected: selectedApplicationTab,
      setupShown: (id) => options.isDialogShown?.(id) ?? false,
      available: () => !disposed && !closing && canFocus?.() !== false,
      handoff(tab, pane, ready, current) {
        tab.focused = pane;
        select(tabs.indexOf(tab), false, { ready, current });
      },
      focus: () => focusPane(focusedPane(), options),
    });
  const initialReady = layout.initialize({
    panes,
    select,
    mount: mountPane,
    disposed: () => disposed,
    notify: marks.notify,
  });
  return {
    ready: initialReady ?? createTab(),
    ...settingsActions,
    isTerminalSelected: () => !!interactivePane(),
    openOverlay(open, refused) {
      mirror?.stop();
      hosted.openOverlay(open, refused);
    },
    setBlocked(blocked) {
      if (blocked) mirror?.stop();
      settingsActions.setBlocked(blocked);
    },
    setSessionAttention(sessionId, pending) {
      if (disposed) return;
      const pane = findPaneBySession(terminalTabs(), sessionId);
      if (pane) attention.pending(pane, pending);
    },
    setWindowMark: (owner, mark) => {
      if (!disposed) marks.setWindow(owner, mark);
    },
    flash: (text) => {
      if (!disposed) marks.flash(text);
    },
    readSession(id, sessionId, read) {
      const pane = disposed
        ? undefined
        : findPaneBySession(terminalTabs(), sessionId);
      if (!pane?.surface || pane.removed) return { id, error: "unknown-pane" };
      const surface = pane.surface;
      try {
        let text;
        if (read.source === "tail")
          text = agentTail(surface.exportText("content"), read.lines);
        else {
          // A Surface with no screen to read fails rather than answer blank.
          const screen = surface.readScreen?.();
          if (screen === undefined) return { id, error: "failed" };
          const alternate = surface.isAlternateScreen?.();
          text = {
            ...agentScreen(screen),
            ...(alternate === undefined ? {} : { alternate }),
          };
        }
        return {
          id,
          ...text,
          ...(pane.size ? { cols: pane.size.cols, rows: pane.size.rows } : {}),
        };
      } catch {
        // Core text extraction can fail (e.g. a WASM allocation).
        return { id, error: "failed" };
      }
    },
    encodeSessionKeys(id, sessionId, keys) {
      const pane = disposed
        ? undefined
        : findPaneBySession(terminalTabs(), sessionId);
      return encodeAgentKeys(
        id,
        pane && !pane.removed ? pane.surface : undefined,
        keys,
      );
    },
    sessionModes(id, sessionId) {
      const pane = disposed
        ? undefined
        : findPaneBySession(terminalTabs(), sessionId);
      return agentPaneModes(
        id,
        pane && !pane.removed ? pane.surface : undefined,
      );
    },
    agentTabs(id) {
      if (disposed) return { id, error: "failed" };
      return {
        id,
        tabs: tabs.slice(0, MAX_AGENT_TABS).map((tab, index) => ({
          tab: agentTabId(tab),
          title: tabLabel(tab, index, language).slice(0, MAX_AGENT_TAB_TITLE),
          selected: index === selectedIndex,
          panes:
            tab.kind === "terminal"
              ? tabPanes(tab)
                  .filter((pane) => !pane.removed)
                  .flatMap((pane) => pane.adapter.sessionId() ?? [])
                  .slice(0, MAX_AGENT_TAB_PANES)
              : [],
        })),
      };
    },
    runSessionCommand(id, sessionId, command, allowed = () => true) {
      const pane = disposed
        ? undefined
        : findPaneBySession(terminalTabs(), sessionId);
      if (!pane || pane.removed || pane.tab.removed)
        return Promise.resolve({ id, error: "unknown-pane" });
      const unavailable = { id, error: "unavailable" } as const;
      if (closing || !allowed()) return Promise.resolve(unavailable);
      agentSelection = true;
      try {
        revealSession(sessionId);
      } finally {
        agentSelection = false;
      }
      // A dialog over the window keeps its selection and takes the user's
      // keys; never act elsewhere, or behind it, or once the grant ended.
      const run = (): AgentActionResult => {
        if (
          disposed ||
          closing ||
          !allowed() ||
          canFocus?.() === false ||
          pane.removed ||
          selectedTab() !== pane.tab ||
          pane.tab.focused !== pane
        )
          return unavailable;
        agentSelection = true;
        try {
          return runAgentCommand(pane, command) ? { id } : unavailable;
        } finally {
          agentSelection = false;
        }
      };
      if (contentReady || selectedTab() !== pane.tab)
        return Promise.resolve(run());
      // The tab shows only after a native view hid: split and directional
      // focus measure it, so the command waits for that, within a bound.
      const page = elements.container.ownerDocument.defaultView!;
      return new Promise((resolve) => {
        // Settles once: the command may select again, which activates again.
        const finish = (result: () => AgentActionResult) => {
          activated.delete(id);
          page.clearTimeout(timer);
          resolve(result());
        };
        const timer = page.setTimeout(
          () => finish(() => unavailable),
          AGENT_ACTIVATION_MS,
        );
        activated.set(id, {
          shown: () => finish(run),
          cancel: () => finish(() => unavailable),
        });
      });
    },
    cancelAgentCommands(id) {
      for (const [key, waiter] of [...activated])
        if (id === undefined || key === id) waiter.cancel();
    },
    setSessionTitle(sessionId, title) {
      if (disposed) return;
      const pane = findPaneBySession(terminalTabs(), sessionId);
      if (!pane) return;
      pane.label = title;
      renderStrip();
    },
    applyConfiguration(next) {
      if (!disposed) configuration.apply(next);
    },
    handleCommand: (command: TerminalTabCommand) => {
      if (command.action === "layout-save-result") layoutSaved(command.outcome);
      else if (command.action === "reveal-session")
        revealSession(command.sessionId);
      else commands.handle(command);
    },
    zoom(command) {
      if (!disposed && selectedTab()) configuration.zoom(command);
    },
    clipboardAction(action, target) {
      // Consume targeted claims even if modal or hosted content blocks input.
      const pane = target ? contextMenu.take(target) : interactivePane();
      if (!interactivePane() || options.canFocus?.() === false) return;
      const surface = pane?.surface;
      if (action === "copy") void surface?.copy();
      else if (action === "paste") void surface?.paste();
      else surface?.selectAll();
    },
    exportRequest: contextMenu.exportRequest,
    fieldClipboard: contextMenu.fieldClipboard,
    find: () => interactivePane()?.surface?.find(),
    injectText: (text) => void interactivePane()?.surface?.inject(text),
    captureSnippetTarget: () => {
      const pane = interactivePane(),
        revision = actionGeneration;
      return snippetTarget(
        pane,
        () =>
          revision === actionGeneration &&
          interactivePane() === pane &&
          options.canFocus?.() !== false,
        () => {
          if (pane?.surface?.focusInput) pane.surface.focusInput();
          else focusPane(pane, options);
        },
      );
    },
    fileDropArea(event) {
      const pane = interactivePane();
      const target = event.target;
      if (
        !pane?.surface ||
        pane.ended ||
        pane.removed ||
        options.canFocus?.() === false ||
        !(
          target instanceof
          elements.container.ownerDocument.defaultView!.Element
        ) ||
        !pane.container.contains(target) ||
        target.closest(
          '[hidden], [inert], [role="search"], input, textarea, button, select, [contenteditable="true"]',
        )
      )
        return undefined;
      const bounds = pane.container.getBoundingClientRect();
      return bounds.width > 0 &&
        bounds.height > 0 &&
        event.clientX >= bounds.left &&
        event.clientX < bounds.right &&
        event.clientY >= bounds.top &&
        event.clientY < bounds.bottom
        ? pane.container
        : undefined;
    },
    selectionRevision: () => actionGeneration,
    selectedSessionId: () => {
      const pane = interactivePane();
      return pane && !pane.ended ? pane.adapter.sessionId() : undefined;
    },
    captureActionTarget: () =>
      captureActionTarget(
        selectedApplicationTab,
        () => actionGeneration,
        () => !disposed && !closing,
      ),
    toggleTabBar,
    togglePaneMarks: () => marks.toggleCapsule(),
    focusSelected() {
      automaticFocusAllowed = true;
      focusApplicationTab(selectedApplicationTab(), options, hosted.focus);
    },
    dispose() {
      if (disposed) return;
      mirror?.dispose();
      disposed = true;
      commands.dispose();
      layout.dispose();
      hosted.dispose();
      contextMenu.dispose();
      removeLanguage();
      strip.dispose();
      marks.dispose();
      keyboard.dispose();
      disposeTabContent(tabs);
    },
  };
}

// Tab ids are the window's own, handed out when an agent first sees a tab and
// kept while the tab lives.
const agentTabIds = new WeakMap<object, string>();
let agentTabCount = 0;
function agentTabId(tab: ApplicationTab): string {
  let id = agentTabIds.get(tab);
  if (!id) {
    agentTabCount += 1;
    id = `t${agentTabCount}`;
    agentTabIds.set(tab, id);
  }
  return id;
}

function tabLabel(
  tab: ApplicationTab,
  index: number,
  language: RendererLanguage,
) {
  if (tab.kind === "settings") return language.t("settings.title");
  return tab.kind === "hosted"
    ? tab.title
    : tab.focused.label || String(index + 1);
}

function bindTabLabels(
  language: RendererLanguage,
  terminalTabs: () => readonly TerminalTab[],
  renderStrip: () => void,
) {
  return language.bind((t) => {
    for (const tab of terminalTabs()) {
      for (const pane of tabPanes(tab)) {
        pane.container.setAttribute("aria-label", t("terminal.surface"));
        relabelEndedPane(pane, t);
      }
      for (const divider of tab.container.querySelectorAll(
        ".terminal-pane-divider",
      ))
        divider.setAttribute("aria-label", t("pane.resize"));
    }
    renderStrip();
  });
}
