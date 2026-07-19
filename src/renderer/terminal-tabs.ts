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
  TerminalSurfaceOptions,
} from "../terminal-surface/terminal-surface";
import type { ElectronTerminalAdapter } from "./electron-terminal-adapter";

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
  readonly notifySelection?: (sessionId: TerminalSessionId) => void;
}

export interface TerminalTabs {
  readonly ready: Promise<void>;
  handleCommand(command: TerminalTabCommand): void;
  zoom(command: TerminalFontZoom): void;
  clipboardAction(action: TerminalClipboardAction): void;
  injectSnippet(body: string, options: { readonly submit: boolean }): void;
  focusSelected(): void;
  dispose(): void;
}

interface TerminalTab {
  readonly container: HTMLElement;
  readonly adapter: ElectronTerminalAdapter;
  surface: TerminalSurface | undefined;
  removed: boolean;
}

export function createTerminalTabs(
  elements: TerminalTabsElements,
  options: TerminalTabsOptions,
): TerminalTabs {
  const document = elements.container.ownerDocument;
  const tabs: TerminalTab[] = [];
  let selectedIndex = -1;
  let zoomSteps = 0;
  let disposed = false;

  const selectedTab = (): TerminalTab | undefined => tabs[selectedIndex];

  const renderStrip = () => {
    const visible = tabs.length >= 2;
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
        // Interim label: the literal position Cmd+1..9 selects. The
        // per-session Terminal Title replaces it in the titles slice.
        button.textContent = String(index + 1);
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

  const select = (index: number) => {
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
    tab.surface?.focus();
  };

  const removeTab = (tab: TerminalTab) => {
    const index = tabs.indexOf(tab);
    if (tab.removed || index < 0) return;
    tab.removed = true;
    tabs.splice(index, 1);
    tab.container.remove();
    if (tabs.length === 0) {
      selectedIndex = -1;
      renderStrip();
      return;
    }
    if (index < selectedIndex) selectedIndex -= 1;
    select(Math.min(Math.max(selectedIndex, index), tabs.length - 1));
  };

  const closeTab = (tab: TerminalTab | undefined) => {
    if (!tab || tab.removed) return;
    // Disposing the Surface closes its Terminal Adapter and session; a tab
    // still mounting has no Surface yet, so its adapter is closed directly.
    removeTab(tab);
    if (tab.surface) tab.surface.dispose();
    else tab.adapter.close();
  };

  const onSessionEnd = (tab: TerminalTab, exit: { signal: number }) => {
    if (disposed || tab.removed) return;
    // An ordinary end removes the tab; an unexpected signal keeps the dead
    // tab visible until main acknowledges the failure and orders removal.
    if (exit.signal === 0) removeTab(tab);
  };

  const replayZoom = (surface: TerminalSurface) => {
    for (let step = 0; step < Math.abs(zoomSteps); step += 1)
      surface.zoom(zoomSteps > 0 ? "in" : "out");
  };

  const createTab = async (): Promise<void> => {
    const container = document.createElement("main");
    container.className = "terminal-surface";
    container.setAttribute("aria-label", "Terminal Surface");
    elements.container.append(container);
    const adapter = options.createAdapter();
    const tab: TerminalTab = {
      container,
      adapter,
      surface: undefined,
      removed: false,
    };
    tabs.push(tab);
    select(tabs.length - 1);

    const sessionAdapter: TerminalSessionAdapter = {
      start: (handlers: TerminalSessionHandlers) =>
        adapter.start({
          onOutput: handlers.onOutput,
          onExit(exit) {
            handlers.onExit(exit);
            onSessionEnd(tab, exit);
          },
        }),
      write: (data) => adapter.write(data),
      resize: (size) => adapter.resize(size),
      close: () => adapter.close(),
    };

    let surface: TerminalSurface;
    try {
      surface = await options.mount(
        container,
        sessionAdapter,
        options.surfaceOptions,
      );
    } catch (error) {
      removeTab(tab);
      throw error;
    }
    if (disposed || tab.removed) {
      surface.dispose();
      return;
    }
    tab.surface = surface;
    replayZoom(surface);
    if (selectedTab() === tab) {
      const sessionId = tab.adapter.sessionId();
      if (sessionId !== undefined) options.notifySelection?.(sessionId);
      if (document.hasFocus()) surface.focus();
    }
  };

  const ready = createTab();

  return {
    ready,
    handleCommand(command) {
      if (disposed) return;
      switch (command.action) {
        case "new":
          // A failed additional spawn already dropped its tab; main shows
          // the native failure dialog, so the renderer only swallows here.
          void createTab().catch(() => {});
          return;
        case "close":
          closeTab(selectedTab());
          return;
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
          closeTab(findBySession(tabs, command.sessionId));
          return;
      }
    },
    zoom(command) {
      zoomSteps =
        command === "reset" ? 0 : zoomSteps + (command === "in" ? 1 : -1);
      for (const tab of tabs) tab.surface?.zoom(command);
    },
    clipboardAction(action) {
      const surface = selectedTab()?.surface;
      if (!surface) return;
      if (action === "copy") void surface.copy();
      else if (action === "paste") void surface.paste();
      else surface.selectAll();
    },
    injectSnippet(body, injectOptions) {
      void selectedTab()?.surface?.inject(body, {
        submit: injectOptions.submit,
      });
    },
    focusSelected() {
      selectedTab()?.surface?.focus();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const tab of [...tabs]) {
        tab.removed = true;
        if (tab.surface) tab.surface.dispose();
        else tab.adapter.close();
      }
      tabs.length = 0;
    },
  };
}

function findBySession(
  tabs: readonly TerminalTab[],
  sessionId: TerminalSessionId,
): TerminalTab | undefined {
  return tabs.find((tab) => tab.adapter.sessionId() === sessionId);
}
