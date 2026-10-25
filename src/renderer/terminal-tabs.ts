import type {
  TerminalClipboardAction,
  TerminalExportKind,
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
import { DEFAULT_TERMINAL_FONT_SIZE } from "../shared/user-configuration";
import { snippetTarget, type SnippetTarget } from "./snippet-target";
import { englishLanguage, type RendererLanguage } from "./renderer-language";
import { createPaneOperations } from "./terminal-pane-operations";
import { createPaneMount } from "./terminal-pane-mount";
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
import { createExportOwnership } from "./terminal-export-ownership";

export const TERMINAL_TAB_DRAG_DATA_TYPE = "application/x-omxterm-tab";

type MountTerminalSurface = (
  container: HTMLElement,
  adapter: TerminalSessionAdapter,
  options: TerminalSurfaceOptions,
) => Promise<TerminalSurface>;

export interface TerminalTabsElements {
  readonly strip: HTMLElement;
  readonly container: HTMLElement;
}

export interface TerminalTabsOptions {
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
    sessionId: TerminalSessionId | null,
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
  handleCommand(command: TerminalTabCommand): void;
  setSessionTitle(sessionId: TerminalSessionId, title: string): void;
  applyConfiguration(configuration: TerminalSurfaceConfiguration): void;
  zoom(command: TerminalFontZoom): void;
  clipboardAction(action: TerminalClipboardAction): void;
  find(): void;
  // Reads the tab whose terminal context menu offered the export, once.
  exportText(kind: TerminalExportKind): string | undefined;
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
  const tabs: TerminalTab[] = [];
  let tabBarEnabled = options.showTabBar ?? true;
  let selectedIndex = -1;
  let zoomSteps = 0;
  let activeSurfaceOptions = options.surfaceOptions;
  let disposed = false;
  let pendingClose: TerminalTab | undefined;
  let closing = false;
  const exportOwnership = createExportOwnership<TerminalPane>();

  const notifyEmpty = (reason?: "rendering-failure") => {
    if (disposed || closing || tabs.length !== 0) return;
    // Commit last-tab closure: a later queued New Tab cannot resurrect it.
    closing = true;
    options.notifyEmpty?.(reason);
  };

  const selectedTab = (): TerminalTab | undefined => tabs[selectedIndex];
  const focusedPane = () => selectedTab()?.focused;
  const tabDragging = installTabDragging(elements.strip, (tab, clientX) => {
    const selected = selectedTab();
    if (!moveTabToHorizontalDrop(tabs, tab, elements.strip, clientX)) return;
    selectedIndex = selected ? tabs.indexOf(selected) : -1;
    renderStrip();
  });

  const renderStrip = () => {
    const visible = tabBarEnabled && tabs.length >= 2;
    elements.strip.hidden = !visible;
    document.body.classList.toggle("tabs-visible", visible);
    if (!visible) {
      elements.strip.replaceChildren();
      return;
    }
    elements.strip.replaceChildren(
      ...tabs.map((tab, index) => {
        const button = document.createElement("button");
        button.type = "button";
        tabDragging.bind(button, tab);
        // The focused pane's sanitized title pushed by main (ADR 0010); the
        // literal position stands in until the first push lands.
        button.textContent = tab.focused.label || String(index + 1);
        button.setAttribute("role", "tab");
        button.setAttribute(
          "aria-selected",
          index === selectedIndex ? "true" : "false",
        );
        button.addEventListener("click", () => {
          if (!disposed) select(tabs.indexOf(tab));
        });
        return button;
      }),
    );
  };

  // Selection is a complete snapshot even while focus has no live session.
  const notifyFocus = (tab: TerminalTab) => {
    if (disposed || tab !== selectedTab()) return;
    const focused = tab.focused;
    const sessionId = focused.ended
      ? null
      : (focused.adapter.sessionId() ?? null);
    options.notifySelection?.(sessionId, tabSessionIds(tab));
  };

  const select = (index: number, passive = false) => {
    const tab = tabs[index];
    // Lifecycle selection stays deliverable; requested navigation is guarded.
    if (!tab || (!passive && options.canFocus?.() === false)) return;
    selectedIndex = index;
    for (const [position, candidate] of tabs.entries()) {
      candidate.container.hidden = position !== index;
      // Each Surface reads its own container's visibility.
      for (const pane of tabPanes(candidate))
        pane.container.hidden = position !== index;
    }
    renderStrip();
    notifyFocus(tab);
    focusPane(tab.focused, options, passive);
  };

  const removeTab = (tab: TerminalTab, notify = true) => {
    const index = tabs.indexOf(tab);
    if (tab.removed || index < 0) return;
    tab.removed = true;
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
    select(Math.min(selectedIndex, tabs.length - 1), true);
  };

  const closeTab = (tab: TerminalTab | undefined) => {
    if (!tab || tab.removed) return;
    const panes = tabPanes(tab);
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
    // A pane's Surface claims the export its terminal context menu offers.
    surfaceOptions: (pane) =>
      exportOwnership.surfaceOptions(pane, activeSurfaceOptions),
    zoomSteps: () => zoomSteps,
    disposed: () => disposed,
    selectedTab,
    onSessionEnd,
    notifyFocus,
    removePane: (pane, notify) => panes.removePane(pane, notify),
    notifyEmpty,
    focus: (pane, unchanged) => focusPane(pane, options, true, unchanged),
  });

  const panes = createPaneOperations({
    selectedTab,
    removeTab,
    createAdapter: options.createAdapter,
    mountPane,
    focusSurface: (pane, passive) => focusPane(pane, options, passive),
    canInteract: () => options.canFocus?.() !== false,
    surfaceLabel: () => language.t("terminal.surface"),
    resizeLabel: () => language.t("pane.resize"),
    onFocusChange: (tab) => {
      notifyFocus(tab);
      renderStrip();
    },
    disposed: () => disposed,
  });

  const removeLanguage = bindPaneLabels(language, tabs);

  const createTab = async (): Promise<void> => {
    const pane = appendTab(elements.container, options.createAdapter);
    tabs.push(pane.tab);
    panes.renderTab(pane.tab);
    panes.trackFocus(pane);
    select(tabs.length - 1, tabs.length === 1);
    await mountPane(pane);
  };

  return {
    ready: createTab(),
    setSessionTitle(sessionId, title) {
      if (disposed) return;
      const pane = findPaneBySession(tabs, sessionId);
      if (!pane) return;
      pane.label = title;
      renderStrip();
    },
    applyConfiguration(configuration) {
      if (disposed) return;
      activeSurfaceOptions = { ...activeSurfaceOptions, ...configuration };
      zoomSteps = Math.max(1 - configuration.appearance.fontSize, zoomSteps);
      for (const tab of tabs)
        for (const pane of tabPanes(tab))
          pane.surface?.applyConfiguration(configuration);
    },
    handleCommand(command) {
      if (disposed || closing) return;
      switch (command.action) {
        case "new":
          // A failed additional spawn already dropped its tab; main shows
          // the native failure dialog, so the renderer only swallows here.
          void createTab().catch(() => {});
          return;
        case "close":
          closeTab(selectedTab());
          return;
        case "prepare-close":
          pendingClose = selectedTab();
          return;
        case "resolve-close": {
          const target = pendingClose;
          pendingClose = undefined;
          if (command.confirmed) closeTab(target);
          return;
        }
        case "next":
        case "previous": {
          if (tabs.length === 0) return;
          const offset = command.action === "next" ? 1 : -1;
          select((selectedIndex + offset + tabs.length) % tabs.length);
          return;
        }
        case "select":
          if (command.position <= tabs.length) select(command.position - 1);
          return;
        case "close-session":
          panes.closePane(findPaneBySession(tabs, command.sessionId));
          return;
        default:
          panes.handleCommand(command);
      }
    },
    zoom(command) {
      const baseline =
        activeSurfaceOptions.appearance?.fontSize ?? DEFAULT_TERMINAL_FONT_SIZE;
      zoomSteps =
        command === "reset"
          ? 0
          : command === "in"
            ? zoomSteps + 1
            : Math.max(1 - baseline, zoomSteps - 1);
      for (const tab of tabs)
        for (const pane of tabPanes(tab)) pane.surface?.zoom(command);
    },
    clipboardAction(action) {
      const surface = focusedPane()?.surface;
      if (!surface) return;
      if (action === "copy") void surface.copy();
      else if (action === "paste") void surface.paste();
      else surface.selectAll();
    },
    find: () => focusedPane()?.surface?.find(),
    exportText: exportOwnership.exportText,
    injectText(text) {
      void focusedPane()?.surface?.inject(text);
    },
    captureSnippetTarget: () => snippetTarget(focusedPane()),
    toggleTabBar() {
      if (disposed) return;
      tabBarEnabled = !tabBarEnabled;
      renderStrip();
      focusPane(focusedPane(), options, true);
    },
    focusSelected() {
      focusPane(focusedPane(), options);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      pendingClose = undefined;
      removeLanguage();
      tabDragging.dispose();
      for (const tab of [...tabs]) {
        tab.removed = true;
        for (const pane of tabPanes(tab)) {
          pane.removed = true;
          disposePane(pane);
        }
      }
      tabs.length = 0;
    },
  };
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

function bindPaneLabels(
  language: RendererLanguage,
  tabs: readonly TerminalTab[],
) {
  return language.bind((t) => {
    for (const tab of tabs) {
      for (const pane of tabPanes(tab))
        pane.container.setAttribute("aria-label", t("terminal.surface"));
      for (const divider of tab.container.querySelectorAll(
        ".terminal-pane-divider",
      ))
        divider.setAttribute("aria-label", t("pane.resize"));
    }
  });
}

function installTabDragging(
  strip: HTMLElement,
  reorder: (tab: TerminalTab, clientX: number) => void,
) {
  let draggedTab: TerminalTab | undefined;
  let enabled = true;
  const onDragOver = (event: DragEvent) => {
    if (!draggedTab) return;
    event.preventDefault();
    if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  };
  const onDrop = (event: DragEvent) => {
    const tab = draggedTab;
    draggedTab = undefined;
    if (!tab) return;
    event.preventDefault();
    event.stopPropagation();
    reorder(tab, event.clientX);
  };
  const onDragEnd = () => {
    draggedTab = undefined;
  };
  strip.addEventListener("dragover", onDragOver);
  strip.addEventListener("drop", onDrop);
  strip.addEventListener("dragend", onDragEnd);
  return {
    bind(button: HTMLButtonElement, tab: TerminalTab) {
      button.draggable = true;
      button.addEventListener("dragstart", (event) => {
        if (!enabled) return;
        draggedTab = tab;
        if (!event.dataTransfer) return;
        event.dataTransfer.effectAllowed = "move";
        event.dataTransfer.setData(TERMINAL_TAB_DRAG_DATA_TYPE, "reorder");
      });
    },
    dispose() {
      enabled = false;
      draggedTab = undefined;
      strip.removeEventListener("dragover", onDragOver);
      strip.removeEventListener("drop", onDrop);
      strip.removeEventListener("dragend", onDragEnd);
    },
  };
}

function moveTabToHorizontalDrop(
  tabs: TerminalTab[],
  tab: TerminalTab,
  strip: HTMLElement,
  clientX: number,
): boolean {
  const sourceIndex = tabs.indexOf(tab);
  if (sourceIndex < 0) return false;
  const rawDestination = [...strip.querySelectorAll("button")].findIndex(
    (button) =>
      clientX <
      button.getBoundingClientRect().left +
        button.getBoundingClientRect().width / 2,
  );
  const insertionIndex = rawDestination < 0 ? tabs.length : rawDestination;
  const destinationIndex =
    sourceIndex < insertionIndex ? insertionIndex - 1 : insertionIndex;
  if (destinationIndex === sourceIndex) return false;
  tabs.splice(sourceIndex, 1);
  tabs.splice(destinationIndex, 0, tab);
  return true;
}
