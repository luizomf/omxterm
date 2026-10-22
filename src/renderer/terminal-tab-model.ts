import type {
  TerminalSessionAdapter,
  TerminalSessionHandlers,
} from "../terminal-surface/terminal-session-adapter";
import type {
  TerminalSurface,
  TerminalSurfaceConfiguration,
  TerminalSurfaceOptions,
} from "../terminal-surface/terminal-surface";
import type { ElectronTerminalAdapter } from "./electron-terminal-adapter";
import type { PaneLayout } from "./pane-layout";
import type { TerminalLaunchSpec } from "../shared/terminal-launch";
import type { TerminalExit } from "../shared/terminal-contract";

// How a pane was opened: reused for Reconnect and shown as the tab color.
export interface PaneLaunch {
  readonly spec?: TerminalLaunchSpec;
  readonly color?: string;
  readonly label?: string;
  // Saved and Quick Connect sessions keep a failed screen readable.
  readonly retainOnExit?: boolean;
}

// One Terminal Surface and its Live Terminal Session inside a Terminal Tab.
export interface TerminalPane {
  readonly tab: TerminalTab;
  readonly container: HTMLElement;
  readonly adapter: ElectronTerminalAdapter;
  readonly mountAbort: AbortController;
  readonly launch: PaneLaunch;
  surface: TerminalSurface | undefined;
  label: string;
  removed: boolean;
  startRequested: boolean;
  ended: boolean;
}

export interface TerminalTab {
  readonly container: HTMLElement;
  layout: PaneLayout<TerminalPane>;
  focused: TerminalPane;
  maximized: TerminalPane | undefined;
  removed: boolean;
}

export function createPane(
  tab: TerminalTab,
  document: Document,
  createAdapter: (launch?: TerminalLaunchSpec) => ElectronTerminalAdapter,
  launch: PaneLaunch = {},
): TerminalPane {
  const container = document.createElement("main");
  container.className = "terminal-surface";
  container.setAttribute("aria-label", "Terminal Surface");
  return {
    tab,
    container,
    adapter: launch.spec ? createAdapter(launch.spec) : createAdapter(),
    mountAbort: new AbortController(),
    launch,
    surface: undefined,
    label: launch.label ?? "",
    removed: false,
    startRequested: false,
    ended: false,
  };
}

export interface EndedBannerStrings {
  readonly ended: (exitCode: number) => string;
  readonly reconnect: string;
  readonly close: string;
}

export const DEFAULT_ENDED_BANNER_STRINGS: EndedBannerStrings = {
  ended: (exitCode) => `The session ended with exit code ${exitCode}.`,
  reconnect: "Reconnect",
  close: "Close",
};

// Shown over a retained pane whose session failed; the final output stays.
export function showEndedBanner(
  pane: TerminalPane,
  exitCode: number,
  strings: EndedBannerStrings,
  actions: { readonly reconnect: () => void; readonly close: () => void },
): void {
  const document = pane.container.ownerDocument;
  const banner = document.createElement("div");
  banner.className = "pane-ended-banner";
  banner.setAttribute("role", "status");
  const message = document.createElement("span");
  message.textContent = strings.ended(exitCode);
  const reconnect = document.createElement("button");
  reconnect.type = "button";
  reconnect.textContent = strings.reconnect;
  reconnect.addEventListener("click", actions.reconnect);
  const close = document.createElement("button");
  close.type = "button";
  close.textContent = strings.close;
  close.addEventListener("click", actions.close);
  banner.append(message, reconnect, close);
  pane.container.append(banner);
  reconnect.focus();
}

export function closePendingPane(pane: TerminalPane): void {
  pane.mountAbort.abort();
  pane.adapter.close();
}

export function paneSessionAdapter(
  pane: TerminalPane,
  onSessionEnd: (pane: TerminalPane, exit: TerminalExit) => void,
  onStarted: () => void,
): TerminalSessionAdapter {
  const { adapter } = pane;
  return {
    start: async (handlers: TerminalSessionHandlers) => {
      pane.startRequested = true;
      await adapter.start({
        onOutput: handlers.onOutput,
        onExit(exit) {
          handlers.onExit(exit);
          onSessionEnd(pane, exit);
        },
      });
      onStarted();
    },
    write: (data) => adapter.write(data),
    resize: (size) => adapter.resize(size),
    close: (reason) => adapter.close(reason),
  };
}

export function completeConfiguration(
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
