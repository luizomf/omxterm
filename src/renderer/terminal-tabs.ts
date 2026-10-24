import type {
  TerminalClipboardAction,
  TerminalFontZoom,
  TerminalSessionId,
  TerminalTabCommand,
} from "../shared/terminal-contract";
import type {
  TerminalSessionAdapter,
  TerminalSessionHandlers,
} from "../terminal-surface/terminal-session-adapter";
import type {
  TerminalSurface,
  TerminalSurfaceConfiguration,
  TerminalSurfaceOptions,
} from "../terminal-surface/terminal-surface";
import { DEFAULT_TERMINAL_FONT_SIZE } from "../shared/user-configuration";
import type { ElectronTerminalAdapter } from "./electron-terminal-adapter";

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
  readonly createAdapter: () => ElectronTerminalAdapter;
  readonly mount: MountTerminalSurface;
  readonly surfaceOptions: TerminalSurfaceOptions;
  readonly showTabBar?: boolean;
  readonly canFocus?: () => boolean;
  // A deliberate mount may restore focus if no control took focus while it
  // was pending. Other passive paths pass false.
  readonly canAutoFocus?: (unchangedFocus: boolean) => boolean;
  readonly notifyEmpty?: (reason?: "rendering-failure") => void;
  readonly notifySelection?: (sessionId: TerminalSessionId) => void;
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
  injectText(text: string): void;
  injectSnippet(body: string, options: { readonly submit: boolean }): void;
  toggleTabBar(): void;
  focusSelected(): void;
  dispose(): void;
}

interface TerminalTab {
  readonly container: HTMLElement;
  readonly adapter: ElectronTerminalAdapter;
  readonly mountAbort: AbortController;
  surface: TerminalSurface | undefined;
  label: string;
  removed: boolean;
  startRequested: boolean;
}

function closePendingTab(tab: TerminalTab): void {
  tab.mountAbort.abort();
  tab.adapter.close();
}

export function createTerminalTabs(
  elements: TerminalTabsElements,
  options: TerminalTabsOptions,
): TerminalTabs {
  const document = elements.container.ownerDocument;
  const tabs: TerminalTab[] = [];
  let tabBarEnabled = options.showTabBar ?? true;
  let selectedIndex = -1;
  let zoomSteps = 0;
  let activeSurfaceOptions = options.surfaceOptions;
  let disposed = false;
  let pendingClose: TerminalTab | undefined;
  let closing = false;

  const notifyEmpty = (reason?: "rendering-failure") => {
    if (disposed || closing || tabs.length !== 0) return;
    // Commit last-tab closure: a later queued New Tab cannot resurrect it.
    closing = true;
    options.notifyEmpty?.(reason);
  };

  const selectedTab = (): TerminalTab | undefined => tabs[selectedIndex];
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
        // Sanitized display title pushed by main (ADR 0010); the literal
        // position stands in until the first push lands.
        button.textContent = tab.label || String(index + 1);
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

  const select = (index: number, passive = false) => {
    const tab = tabs[index];
    if (!tab) return;
    selectedIndex = index;
    for (const [position, candidate] of tabs.entries())
      candidate.container.hidden = position !== index;
    renderStrip();
    // Main tracks the selected session for close confirmations (a tab still
    // starting has no id yet and is reported once its session starts).
    const sessionId = tab.adapter.sessionId();
    if (sessionId !== undefined) options.notifySelection?.(sessionId);
    focusTab(tab, options, passive);
  };

  const removeTab = (tab: TerminalTab, notify = true) => {
    const index = tabs.indexOf(tab);
    if (tab.removed || index < 0) return;
    tab.removed = true;
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

  const onSessionEnd = (
    tab: TerminalTab,
    exit: { signal: number; startupFailed?: true },
  ) => {
    if (disposed || tab.removed) return;
    // An ordinary end removes the tab; an unexpected signal keeps the dead
    // tab visible until main acknowledges the failure and orders removal.
    if (exit.signal === 0 && !exit.startupFailed) removeTab(tab);
  };

  const replayZoom = (surface: TerminalSurface) => {
    for (let step = 0; step < Math.abs(zoomSteps); step += 1)
      surface.zoom(zoomSteps > 0 ? "in" : "out");
  };

  const createTab = async (): Promise<void> => {
    const tab = appendTab(elements.container, options.createAdapter);
    const { container, adapter } = tab;
    tabs.push(tab);
    select(tabs.length - 1);

    const sessionAdapter = tabSessionAdapter(tab, onSessionEnd, () => {
      if (disposed || tab.removed) return;
      const sessionId = adapter.sessionId();
      if (sessionId !== undefined) options.syncTitle?.(sessionId);
    });
    // Title and BEL events carry the emitting tab's session id; the Surface
    // itself stays tab-unaware. Events can only follow session output, so
    // the id is always known by the time they fire.
    const tabSurfaceOptions: TerminalSurfaceOptions = {
      ...activeSurfaceOptions,
      abortSignal: tab.mountAbort.signal,

      ...(options.notifyTitle
        ? {
            onTitleRequest: (request: string) => {
              if (disposed || tab.removed) return;
              const sessionId = adapter.sessionId();
              if (sessionId !== undefined)
                options.notifyTitle?.(sessionId, request);
            },
          }
        : {}),
      ...(options.notifyBell
        ? {
            onBell: () => {
              if (disposed || tab.removed) return;
              const sessionId = adapter.sessionId();
              if (sessionId !== undefined) options.notifyBell?.(sessionId);
            },
          }
        : {}),
    };

    const focus = observeMountFocus(document, tab.mountAbort.signal);
    let surface: TerminalSurface;
    try {
      surface = await options.mount(
        container,
        sessionAdapter,
        tabSurfaceOptions,
      );
    } catch (error) {
      // Once a native session exists, retain its failed tab through asynchronous
      // termination and main's acknowledgement. A close request is not an exit.
      if (adapter.sessionId() === undefined) {
        removeTab(tab, false);
        if (tab.startRequested) notifyEmpty();
        else if (!tab.mountAbort.signal.aborted)
          notifyEmpty("rendering-failure");
      }
      throw error;
    } finally {
      focus.dispose();
    }
    if (disposed || tab.removed) {
      surface.dispose();
      return;
    }
    tab.surface = surface;
    const latestConfiguration = completeConfiguration(activeSurfaceOptions);
    if (latestConfiguration) surface.applyConfiguration(latestConfiguration);
    replayZoom(surface);
    if (selectedTab() === tab) {
      const sessionId = tab.adapter.sessionId();
      if (sessionId !== undefined) options.notifySelection?.(sessionId);
      if (document.hasFocus()) focusTab(tab, options, true, focus.unchanged());
    }
  };

  return {
    ready: createTab(),
    setSessionTitle(sessionId, title) {
      if (disposed) return;
      const tab = findBySession(tabs, sessionId);
      if (!tab) return;
      tab.label = title;
      renderStrip();
    },
    applyConfiguration(configuration) {
      if (disposed) return;
      activeSurfaceOptions = { ...activeSurfaceOptions, ...configuration };
      zoomSteps = Math.max(1 - configuration.appearance.fontSize, zoomSteps);
      for (const tab of tabs) tab.surface?.applyConfiguration(configuration);
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
          closeTab(selectedTab(), removeTab);
          return;
        case "prepare-close":
          pendingClose = selectedTab();
          return;
        case "resolve-close": {
          const target = pendingClose;
          pendingClose = undefined;
          if (command.confirmed) closeTab(target, removeTab);
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
          closeTab(findBySession(tabs, command.sessionId), removeTab);
          return;
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
      for (const tab of tabs) tab.surface?.zoom(command);
    },
    clipboardAction(action) {
      const surface = selectedTab()?.surface;
      if (!surface) return;
      if (action === "copy") void surface.copy();
      else if (action === "paste") void surface.paste();
      else surface.selectAll();
    },
    find: () => selectedTab()?.surface?.find(),
    injectText(text) {
      void selectedTab()?.surface?.inject(text);
    },
    injectSnippet(body, injectOptions) {
      void selectedTab()?.surface?.inject(body, injectOptions);
    },
    toggleTabBar() {
      if (disposed) return;
      tabBarEnabled = !tabBarEnabled;
      renderStrip();
      focusTab(selectedTab(), options, true);
    },
    focusSelected() {
      focusTab(selectedTab(), options);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      pendingClose = undefined;
      tabDragging.dispose();
      for (const tab of [...tabs]) {
        tab.removed = true;
        if (tab.surface) tab.surface.dispose();
        else closePendingTab(tab);
      }
      tabs.length = 0;
    },
  };
}

function focusTab(
  tab: TerminalTab | undefined,
  options: TerminalTabsOptions,
  passive = false,
  unchangedFocus = false,
): void {
  if (
    options.canFocus?.() !== false &&
    (!passive || options.canAutoFocus?.(unchangedFocus) !== false)
  )
    tab?.surface?.focus();
}

function observeMountFocus(document: Document, signal: AbortSignal) {
  let unchanged = true;
  const changed = () => {
    unchanged = false;
  };
  document.addEventListener("focusin", changed, { once: true, signal });
  return {
    unchanged: () => unchanged,
    dispose: () => document.removeEventListener("focusin", changed),
  };
}

function appendTab(
  parent: HTMLElement,
  createAdapter: () => ElectronTerminalAdapter,
): TerminalTab {
  const container = parent.ownerDocument.createElement("main");
  container.className = "terminal-surface";
  container.setAttribute("aria-label", "Terminal Surface");
  parent.append(container);
  return {
    container,
    adapter: createAdapter(),
    mountAbort: new AbortController(),
    surface: undefined,
    label: "",
    removed: false,
    startRequested: false,
  };
}

function closeTab(
  tab: TerminalTab | undefined,
  removeTab: (tab: TerminalTab) => void,
): void {
  if (!tab || tab.removed) return;
  // Disposing the Surface closes its Terminal Adapter and session; a tab
  // still mounting has no Surface yet, so its adapter is closed directly.
  removeTab(tab);
  if (tab.surface) tab.surface.dispose();
  else closePendingTab(tab);
}

function tabSessionAdapter(
  tab: TerminalTab,
  onSessionEnd: (
    tab: TerminalTab,
    exit: { signal: number; startupFailed?: true },
  ) => void,
  onStarted: () => void,
): TerminalSessionAdapter {
  const { adapter } = tab;
  return {
    start: async (handlers: TerminalSessionHandlers) => {
      tab.startRequested = true;
      await adapter.start({
        onOutput: handlers.onOutput,
        onExit(exit) {
          handlers.onExit(exit);
          onSessionEnd(tab, exit);
        },
      });
      onStarted();
    },
    write: (data) => adapter.write(data),
    resize: (size) => adapter.resize(size),
    close: (reason) => adapter.close(reason),
  };
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

function completeConfiguration(
  options: TerminalSurfaceOptions,
): TerminalSurfaceConfiguration | undefined {
  if (
    options.appearance?.fontSize === undefined ||
    options.appearance.lineHeight === undefined ||
    options.appearance.ligatures === undefined ||
    options.padding === undefined ||
    options.scrollbackLines === undefined ||
    options.optionKeyMode === undefined ||
    options.theme === undefined
  )
    return undefined;
  return {
    appearance: {
      fontSize: options.appearance.fontSize,
      lineHeight: options.appearance.lineHeight,
      ligatures: options.appearance.ligatures,
      ...(options.appearance.systemFont
        ? { systemFont: options.appearance.systemFont }
        : {}),
    },
    padding: options.padding,
    scrollbackLines: options.scrollbackLines,
    optionKeyMode: options.optionKeyMode,
    theme: options.theme,
  };
}

function findBySession(
  tabs: readonly TerminalTab[],
  sessionId: TerminalSessionId,
): TerminalTab | undefined {
  return tabs.find((tab) => tab.adapter.sessionId() === sessionId);
}
