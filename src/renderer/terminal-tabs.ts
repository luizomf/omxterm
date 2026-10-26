import type { SettingsBridge } from "../shared/settings";
import { createSettingsView } from "./settings/settings-dialog";
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
import { createPaneContextMenu } from "./terminal-pane-context-menu";
import {
  appendTab,
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

interface SettingsTab {
  readonly kind: "settings";
  readonly container: HTMLElement;
  readonly view: ReturnType<typeof createSettingsView>;
  removed: boolean;
}
type ApplicationTab = TerminalTab | SettingsTab;

export interface TerminalTabsOptions {
  readonly settings?: SettingsBridge;
  readonly onSettingsSelected?: () => void;
  readonly language?: RendererLanguage;
  // A split pane passes its source session to inherit a reported directory.
  readonly createAdapter: CreatePaneAdapter;
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
  toggleTabBar(): void;
  focusSelected(): void;
  dispose(): void;
}

export function createTerminalTabs(
  elements: TerminalTabsElements,
  options: TerminalTabsOptions,
): TerminalTabs {
  const document = elements.container.ownerDocument;
  const language = options.language ?? englishLanguage;
  const tabs: ApplicationTab[] = [];
  const terminalTabs = () =>
    tabs.filter((tab): tab is TerminalTab => tab.kind === "terminal");
  const keyboard = retainDismissalGesture(document);
  let tabBarEnabled = options.showTabBar ?? true;
  let selectedIndex = -1;
  const configuration = createTerminalTabConfiguration(
    options.surfaceOptions,
    terminalTabs,
  );
  let disposed = false;
  let closing = false;

  const notifyEmpty = (reason?: "rendering-failure") => {
    if (disposed || closing || tabs.length !== 0) return;
    // Commit last-tab closure: a later queued New Tab cannot resurrect it.
    closing = true;
    options.notifyEmpty?.(reason);
  };

  const selectedApplicationTab = () => tabs[selectedIndex];
  const selectedTab = (): TerminalTab | undefined => {
    const tab = selectedApplicationTab();
    return tab?.kind === "terminal" ? tab : undefined;
  };
  const focusedPane = () => selectedTab()?.focused;
  const contextMenu = createPaneContextMenu({
    focusedPane,
    disposed: () => disposed,
    canInteract: () => options.canFocus?.() !== false,
  });
  const strip = createApplicationTabStrip(elements.strip, tabs, {
    label: (tab, index) =>
      tab.kind === "settings"
        ? language.t("settings.title")
        : tab.focused.label || String(index + 1),
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
    contextMenu.selectionChanged();
    const sessionId = focused.ended
      ? null
      : (focused.adapter.sessionId() ?? null);
    options.notifySelection?.(sessionId, tabSessionIds(tab));
  };

  const select = (index: number, passive = false) => {
    const tab = tabs[index];
    // Lifecycle selection stays deliverable; requested navigation is guarded.
    if (!tab || (!passive && options.canFocus?.() === false)) return;
    const changed = selectedApplicationTab() !== tab;
    selectedIndex = index;
    for (const [position, candidate] of tabs.entries()) {
      candidate.container.hidden = position !== index;
      if (candidate.kind === "settings")
        candidate.view.setSelected(position === index);
      else
        for (const pane of tabPanes(candidate))
          pane.container.hidden = position !== index;
    }
    renderStrip();
    contextMenu.selectionChanged();
    if (tab.kind === "settings") {
      if (changed) options.onSettingsSelected?.();
      options.notifySelection?.({ kind: "settings" }, []);
      if ((changed || !passive) && options.canFocus?.() !== false)
        tab.view.focus();
    } else {
      notifyFocus(tab);
      focusPane(tab.focused, options, passive);
    }
  };

  const removeTab = (tab: ApplicationTab, notify = true) => {
    const selected = selectedApplicationTab();
    const index = tabs.indexOf(tab);
    if (tab.removed || index < 0) return;
    tab.removed = true;
    if (tab.kind === "settings") tab.view.dispose();
    else
      for (const pane of tabPanes(tab)) {
        pane.removed = true;
        endPane(pane);
      }
    tabs.splice(index, 1);
    tab.container.remove();
    if (tabs.length === 0) {
      selectedIndex = -1;
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
    const panes = tab.kind === "terminal" ? tabPanes(tab) : [];
    removeTab(tab);
    for (const pane of panes) disposePane(pane);
  };

  const onSessionEnd = (
    pane: TerminalPane,
    exit: { signal: number; startupFailed?: true },
  ) => {
    if (disposed || pane.removed) return;
    // An ordinary end removes the pane; an unexpected signal keeps the dead
    // pane visible until main acknowledges the failure and orders removal.
    if (exit.signal === 0 && !exit.startupFailed) panes.removePane(pane);
    else notifyFocus(pane.tab);
  };

  const mountPane = createPaneMount({
    document,
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

  const createTab = async (): Promise<void> => {
    const pane = appendTab(elements.container, options.createAdapter);
    tabs.push(pane.tab);
    panes.renderTab(pane.tab);
    panes.trackFocus(pane);
    select(tabs.length - 1, tabs.length === 1);
    await mountPane(pane);
  };

  const commands = createApplicationTabCommands(tabs, {
    available: () => !disposed && !closing,
    selected: selectedApplicationTab,
    select,
    create: createTab,
    close: closeTab,
    closeSession: (id) =>
      panes.closePane(findPaneBySession(terminalTabs(), id)),
    pane: panes.handleCommand,
  });
  return {
    ready: createTab(),
    ...settingsTabActions(tabs, {
      selected: selectedApplicationTab,
      select,
      canOpen: () => !disposed && !closing && options.canFocus?.() !== false,
      create: () =>
        options.settings
          ? createSettingsTab(
              elements.container,
              options.settings,
              language,
              keyboard,
              closeTab,
            )
          : undefined,
    }),
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
    clipboardAction: (action, target) =>
      applyClipboardAction(
        target ? contextMenu.take(target) : focusedPane(),
        action,
      ),
    find: () => focusedPane()?.surface?.find(),
    injectText: (text) => void focusedPane()?.surface?.inject(text),
    captureSnippetTarget: () => snippetTarget(focusedPane()),
    toggleTabBar() {
      if (disposed) return;
      tabBarEnabled = !tabBarEnabled;
      renderStrip();
      if (selectedApplicationTab()?.kind !== "settings")
        focusPane(focusedPane(), options, true);
    },
    focusSelected() {
      const tab = selectedApplicationTab();
      if (tab?.kind === "settings") tab.view.focus();
      else focusPane(focusedPane(), options);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      commands.dispose();
      contextMenu.dispose();
      removeLanguage();
      strip.dispose();
      keyboard.dispose();
      for (const tab of [...tabs]) {
        tab.removed = true;
        if (tab.kind === "settings") {
          tab.view.dispose();
          continue;
        }
        for (const pane of tabPanes(tab)) {
          pane.removed = true;
          disposePane(pane);
        }
      }
      tabs.length = 0;
    },
  };
}

function bindTabLabels(
  language: RendererLanguage,
  terminalTabs: () => readonly TerminalTab[],
  renderStrip: () => void,
) {
  return language.bind((t) => {
    for (const tab of terminalTabs()) {
      for (const pane of tabPanes(tab))
        pane.container.setAttribute("aria-label", t("terminal.surface"));
      for (const divider of tab.container.querySelectorAll(
        ".terminal-pane-divider",
      ))
        divider.setAttribute("aria-label", t("pane.resize"));
    }
    renderStrip();
  });
}

function settingsTabActions(
  tabs: ApplicationTab[],
  options: {
    readonly selected: () => ApplicationTab | undefined;
    readonly select: (index: number) => void;
    readonly canOpen: () => boolean;
    readonly create: () => SettingsTab | undefined;
  },
): Pick<
  TerminalTabs,
  "openSettings" | "isSettingsSelected" | "setBlocked" | "editSettingsClipboard"
> {
  return {
    openSettings() {
      if (!options.canOpen()) return;
      let tab = tabs.find(
        (candidate): candidate is SettingsTab => candidate.kind === "settings",
      );
      if (!tab) {
        tab = options.create();
        if (!tab) return;
        tabs.push(tab);
        options.select(tabs.length - 1);
        void tab.view.open();
      } else if (tab !== options.selected()) options.select(tabs.indexOf(tab));
    },
    isSettingsSelected: () => options.selected()?.kind === "settings",
    setBlocked(blocked) {
      for (const tab of tabs)
        if (tab.kind === "settings") tab.view.setBlocked(blocked);
    },
    editSettingsClipboard(action, clipboard) {
      const tab = options.selected();
      if (tab?.kind !== "settings") return false;
      tab.view.editClipboard(action, clipboard);
      return true;
    },
  };
}

function applyClipboardAction(
  pane: TerminalPane | undefined,
  action: TerminalClipboardAction,
): void {
  const surface = pane?.surface;
  if (!surface) return;
  if (action === "copy") void surface.copy();
  else if (action === "paste") void surface.paste();
  else surface.selectAll();
}

function focusPane(
  pane: TerminalPane | undefined,
  options: TerminalTabsOptions,
  passive = false,
  unchangedFocus = false,
): void {
  if (
    options.canFocus?.() !== false &&
    (!passive || options.canAutoFocus?.(unchangedFocus) !== false)
  )
    pane?.surface?.focus();
}

function createSettingsTab(
  parent: HTMLElement,
  bridge: SettingsBridge,
  language: RendererLanguage,
  keyboard: ReturnType<typeof retainDismissalGesture>,
  close: (tab: SettingsTab) => void,
): SettingsTab {
  const container = parent.ownerDocument.createElement("div");
  container.className = "settings-tab";
  parent.append(container);
  const view = createSettingsView(parent.ownerDocument, bridge, {
    container,
    language,
    keyboard,
    onClose: () => close(tab),
  });
  const tab: SettingsTab = {
    kind: "settings",
    container,
    view,
    removed: false,
  };
  return tab;
}
