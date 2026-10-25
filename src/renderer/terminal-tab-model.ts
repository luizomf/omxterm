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
import type { OutputHighlighter } from "./highlighting/output-highlighter";
import type { PaneLayout } from "./pane-layout";
import type { TabGroup } from "./tab-groups";
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
  highlighter: OutputHighlighter | undefined;
  label: string;
  removed: boolean;
  startRequested: boolean;
  ended: boolean;
  // When the Surface mounted and the session started, for tab tooltips.
  startedAt?: number | undefined;
}

export interface TerminalTab {
  readonly container: HTMLElement;
  // Set from the tab menu: a name that replaces the program's title, a
  // color, and a tab group.
  title?: string | undefined;
  color?: string | undefined;
  group?: TabGroup | undefined;
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
  // The accessible name of the terminal area, in the window's language.
  label = "Terminal Surface",
): TerminalPane {
  const container = document.createElement("main");
  container.className = "terminal-surface";
  container.setAttribute("aria-label", label);
  return {
    tab,
    container,
    adapter: launch.spec ? createAdapter(launch.spec) : createAdapter(),
    mountAbort: new AbortController(),
    launch,
    surface: undefined,
    highlighter: undefined,
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
  readonly solution: string;
}

export const DEFAULT_ENDED_BANNER_STRINGS: EndedBannerStrings = {
  ended: (exitCode) => `The session ended with exit code ${exitCode}.`,
  reconnect: "Reconnect",
  close: "Close",
  solution: "Solution",
};

// A further choice on an ended banner, such as switching a Saved Session to
// password authentication; Reconnect follows once apply resolves.
export interface EndedOffer {
  readonly message: string;
  readonly label: string;
  apply(): Promise<void>;
}

// Shown over a retained pane whose session failed; the final output stays.
// An SSH failure also gets a Solution button. The returned function adds an
// offer while the banner is still shown.
export function showEndedBanner(
  pane: TerminalPane,
  exitCode: number,
  strings: EndedBannerStrings,
  actions: {
    readonly reconnect: () => void;
    readonly close: () => void;
    readonly solution?: () => void;
  },
): (offer: EndedOffer) => void {
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
  if (actions.solution) {
    const solution = document.createElement("button");
    solution.type = "button";
    solution.className = "pane-ended-solution";
    solution.textContent = strings.solution;
    solution.addEventListener("click", actions.solution);
    banner.append(solution);
  }
  pane.container.append(banner);
  reconnect.focus();
  return (offer) => {
    if (!banner.isConnected) return;
    const question = document.createElement("span");
    question.className = "pane-ended-offer";
    question.textContent = offer.message;
    const accept = document.createElement("button");
    accept.type = "button";
    accept.textContent = offer.label;
    accept.addEventListener("click", () => {
      accept.disabled = true;
      offer.apply().then(actions.reconnect, () => {
        accept.disabled = false;
      });
    });
    banner.insertBefore(question, reconnect);
    banner.insertBefore(accept, reconnect);
    accept.focus();
  };
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
