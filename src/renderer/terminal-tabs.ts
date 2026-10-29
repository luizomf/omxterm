import { createMirrorTyping } from "./mirror-typing";
import type { MirrorTypingBridge } from "../shared/mirror-typing";
import { createTerminalTabsLayout } from "./terminal-tabs-layout";
import type {
  InitialLayout,
  TerminalLayoutBridge,
} from "../shared/terminal-layout";
import {
  activateTabContent,
  disposeTabContent,
  focusApplicationTab,
  focusPane,
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
  TerminalFontZoom,
  TerminalSessionId,
  TerminalTabCommand,
} from "../shared/terminal-contract";
import type {
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
import { createPaneContextMenu } from "./terminal-pane-context-menu";
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
  ) => void;
  readonly isSshSourceForeground?: (id: string) => boolean;
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
  readonly surfaceOptions: TerminalSurfaceOptions;
  readonly showTabBar?: boolean;
  readonly canFocus?: () => boolean;
  // A deliberate mount may restore focus if no control took focus while it
  // was pending. Other passive paths pass false.
  readonly canAutoFocus?: (unchangedFocus: boolean) => boolean;
  readonly notifyEmpty?: (reason?: "rendering-failure") => void;
  // The selected tab's focused pane and every started session of that tab.
  readonly notifySelection?: (
    sessionId: TerminalSessionId | null | SettingsTabSelection,
    tabSessionIds: readonly TerminalSessionId[],
  ) => void;
  readonly notifyTitle?: (
    sessionId: TerminalSessionId,
    request: string,
  ) => void;
  readonly notifyBell?: (sessionId: TerminalSessionId) => void;
  readonly syncTitle?: (sessionId: TerminalSessionId) => void;
}

export interface TerminalTabs {
  readonly ready: Promise<void>;
  openSettings(): void;
  isSettingsSelected(): boolean;
  isTerminalSelected(): boolean;
  openOverlay(open: () => void): void;
  setBlocked(blocked: boolean): void;
  editSettingsClipboard(
    action: TerminalClipboardAction,
    clipboard: TerminalSurfaceOptions["clipboard"],
  ): boolean;
  handleCommand(command: TerminalTabCommand): void;
  setSessionTitle(sessionId: TerminalSessionId, title: string): void;
  applyConfiguration(configuration: TerminalSurfaceConfiguration): void;
  zoom(command: TerminalFontZoom): void;
  clipboardAction(
    action: TerminalClipboardAction,
    target?: TerminalContextMenuTarget,
  ): void;
  find(): void;
  injectText(text: string): void;
  // The selected live terminal, captured for one snippet action.
  captureSnippetTarget(): SnippetTarget | undefined;
  captureActionTarget(): { isCurrent(): boolean };
  toggleTabBar(): void;
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
  let lastFocusedPane: TerminalPane | undefined;

  const notifyEmpty = (reason?: "rendering-failure") => {
    if (disposed || closing || tabs.length !== 0) return;
    // Commit last-tab closure: a later queued New Tab cannot resurrect it.
    closing = true;
    options.notifyEmpty?.(reason);
  };

  const selectedApplicationTab = () => tabs[selectedIndex];
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
    select: (tab) => select(tabs.indexOf(tab)),
    canInteract: () => !disposed && options.canFocus?.() !== false,
    reordered(reorder) {
      const selected = selectedApplicationTab();
      reorder();
      selectedIndex = selected ? tabs.indexOf(selected) : -1;
      renderStrip();
    },
  });
  const renderStrip = () => strip.render(selectedIndex, tabBarEnabled);

  // Selection is a complete snapshot even while focus has no live session.
  const notifyFocus = (tab: TerminalTab) => {
    if (disposed || tab !== selectedTab()) return;
    const focused = tab.focused;
    if (lastFocusedPane !== focused) actionGeneration += 1;
    lastFocusedPane = focused;
    contextMenu.selectionChanged();
    const sessionId = focused.ended
      ? null
      : (focused.adapter.sessionId() ?? null);
    options.notifySelection?.(sessionId, tabSessionIds(tab));
    mirror?.changed();
  };

  const select = (
    index: number,
    passive = false,
    mirrorReady?: { ready(): void; current(): boolean },
  ) => {
    const tab = tabs[index];
    // Lifecycle selection stays deliverable; requested navigation is guarded.
    if (!tab || (!passive && canFocus?.() === false)) return;
    const changed = selectedApplicationTab() !== tab;
    if (changed) {
      actionGeneration += 1;
      if (!mirrorReady) mirror?.stop();
    }
    selectedIndex = index;
    layout.selected(tab);
    renderStrip();
    contextMenu.selectionChanged();
    if (tab.kind === "hosted") options.notifySelection?.(null, []);
    contentReady = false;
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
    };
    if (options.selectContent) options.selectContent(tab, activate, passive);
    else hosted.select(tab.kind === "hosted" ? tab : undefined, activate, tab);
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
    if (disposed || pane.removed) return;
    terminalPaneEnded(pane, exit, panes, keyboard, notifyFocus, language.t);
  };

  const mountPane = createPaneMount({
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
    routeKeyInput: (pane, data) => mirror?.route(pane, data) ?? false,
    onSemanticInput: (pane) => mirror?.semantic(pane),
  });

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
  });
  if (options.mirrorTyping)
    mirror = createMirrorTyping({
      bridge: options.mirrorTyping,
      parent: elements.container,
      language,
      selected: selectedApplicationTab,
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
  });
  return {
    ready: initialReady ?? createTab(),
    ...settingsActions,
    isTerminalSelected: () => !!interactivePane(),
    openOverlay(open) {
      mirror?.stop();
      hosted.openOverlay(open);
    },
    setBlocked(blocked) {
      if (blocked) mirror?.stop();
      settingsActions.setBlocked(blocked);
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
    handleCommand: commands.handle,
    zoom(command) {
      if (!disposed && selectedTab()) configuration.zoom(command);
    },
    clipboardAction(action, target) {
      if (!interactivePane()) return;
      const surface = (target ? contextMenu.take(target) : focusedPane())
        ?.surface;
      if (action === "copy") void surface?.copy();
      else if (action === "paste") void surface?.paste();
      else surface?.selectAll();
    },
    find: () => interactivePane()?.surface?.find(),
    injectText: (text) => void interactivePane()?.surface?.inject(text),
    captureSnippetTarget: () => snippetTarget(interactivePane()),
    captureActionTarget: () =>
      captureActionTarget(
        selectedApplicationTab,
        () => actionGeneration,
        () => !disposed && !closing,
      ),
    toggleTabBar() {
      if (disposed) return;
      tabBarEnabled = !tabBarEnabled;
      renderStrip();
      focusPane(focusedPane(), options, true);
    },
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
      keyboard.dispose();
      disposeTabContent(tabs);
    },
  };
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

function captureActionTarget(
  selected: () => ApplicationTab | undefined,
  revision: () => number,
  available: () => boolean,
): { isCurrent(): boolean } {
  const tab = selected();
  const pane = tab?.kind === "terminal" ? tab.focused : undefined;
  const generation = revision();
  return {
    isCurrent: () =>
      available() &&
      !!tab &&
      !tab.removed &&
      revision() === generation &&
      selected() === tab &&
      (tab.kind !== "terminal" ||
        (!!pane && tab.focused === pane && !pane.removed && !pane.ended)),
  };
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
