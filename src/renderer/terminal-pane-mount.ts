import type {
  TerminalContextMenuTarget,
  TerminalSessionId,
} from "../shared/terminal-contract";
import type {
  TerminalClipboard,
  TerminalSurface,
  TerminalSurfaceConfiguration,
  TerminalSurfaceOptions,
} from "../terminal-surface/terminal-surface";
import type { TerminalTabsOptions } from "./terminal-tabs";
import { forwardFieldContextMenu } from "./field-context-menu";
import { paneLayoutBox } from "./pane-geometry";
import type { TerminalHostClipboard } from "./terminal-pane-context-menu";
import {
  endPane,
  paneSessionAdapter,
  tabPanes,
  type TerminalPane,
  type TerminalTab,
} from "./terminal-panes";

// Mounts one pane's Terminal Surface and starts its session. Failures before a
// native session exists drop the pane; the last pane follows the last-tab path.
export function createPaneMount(deps: {
  readonly document: Document;
  readonly routeKeyInput?: (pane: TerminalPane, data: string) => boolean;
  readonly onSemanticInput?: (pane: TerminalPane) => void;
  readonly options: TerminalTabsOptions;
  readonly surfaceOptions: () => TerminalTabsOptions["surfaceOptions"];
  readonly zoomSteps: () => number;
  readonly disposed: () => boolean;
  readonly selectedTab: () => TerminalTab | undefined;
  readonly onSessionEnd: (
    pane: TerminalPane,
    exit: import("../shared/terminal-contract").TerminalExit,
  ) => void;
  readonly notifyFocus: (tab: TerminalTab) => void;
  readonly removePane: (pane: TerminalPane, notify: boolean) => void;
  readonly notifyEmpty: (reason?: "rendering-failure") => void;
  readonly focus: (pane: TerminalPane, unchangedFocus: boolean) => void;
  readonly focusClicked: (pane: TerminalPane) => void;
  readonly captureContextMenuTarget: (
    pane: TerminalPane,
    hasSelection: boolean,
  ) => TerminalContextMenuTarget | undefined;
  readonly fieldClipboard: (
    clipboard?: TerminalHostClipboard,
  ) => TerminalClipboard | undefined;
  // OSC 9;4 progress, and any attention (BEL or notification) from the pane.
  readonly onProgress?: (pane: TerminalPane, active: boolean) => void;
  readonly onAttention?: (pane: TerminalPane) => void;
}) {
  const { document, options } = deps;
  return async (pane: TerminalPane): Promise<void> => {
    const { container, adapter } = pane;
    const withSession =
      <Rest extends unknown[]>(
        callback: (sessionId: TerminalSessionId, ...rest: Rest) => void,
      ) =>
      (...rest: Rest) => {
        if (deps.disposed() || pane.removed) return;
        const sessionId = adapter.sessionId();
        if (sessionId !== undefined) callback(sessionId, ...rest);
      };
    const sessionAdapter = paneSessionAdapter(pane, deps.onSessionEnd, () => {
      withSession((sessionId) => options.syncTitle?.(sessionId))();
      // The tab's session set grew; main counts it for Close Tab.
      deps.notifyFocus(pane.tab);
    });
    // Title and BEL events carry the emitting pane's session id;
    // the Surface itself stays pane-unaware. Events can only follow session
    // output, so the id is always known by the time they fire.
    const { clipboard, ...baseSurfaceOptions } = deps.surfaceOptions();
    const forwardFieldRequest = clipboard
      ? forwardFieldContextMenu(clipboard, deps.fieldClipboard)
      : undefined;
    const paneSurfaceOptions: TerminalSurfaceOptions = {
      ...baseSurfaceOptions,
      routeKeyInput: (data) =>
        deps.routeKeyInput?.(pane, data) ||
        deps.surfaceOptions().routeKeyInput?.(data) ||
        false,
      onSemanticInput: () => {
        deps.onSemanticInput?.(pane);
        deps.surfaceOptions().onSemanticInput?.();
      },
      // Focus also applies to padding and suppressed terminal popups.
      onContextMenu() {
        if (!deps.disposed() && !pane.removed && !pane.ended)
          deps.focusClicked(pane);
      },
      // Capture this pane and its live Surface for one popup;
      // a split pane's menu also offers Close Pane.
      ...(clipboard
        ? {
            clipboard: {
              ...clipboard,
              requestContextMenu(request) {
                if (deps.disposed() || pane.removed || pane.ended) return;
                if (request.target === "field") {
                  forwardFieldRequest?.(request);
                  return;
                }
                const target = deps.captureContextMenuTarget(
                  pane,
                  request.hasSelection,
                );
                if (!target) return;
                clipboard.requestContextMenu({
                  ...target,
                  hasSelection: request.hasSelection,
                  ...(tabPanes(pane.tab).length > 1 ? { closePane: true } : {}),
                });
              },
            },
          }
        : {}),
      abortSignal: pane.mountAbort.signal,
      estimatedBox: () => estimatedPaneBox(pane),
      onFatalError(failure) {
        endPane(pane);
        deps.surfaceOptions().onFatalError?.(failure);
      },
      ...(options.notifyTitle
        ? { onTitleRequest: withSession(options.notifyTitle) }
        : {}),
      onBell: () => {
        if (deps.disposed() || pane.removed) return;
        deps.onAttention?.(pane);
        if (options.notifyBell) withSession(options.notifyBell)();
      },
      onProgress: (active) => {
        if (!deps.disposed() && !pane.removed) deps.onProgress?.(pane, active);
      },
      onDesktopNotification: (notification) => {
        if (deps.disposed() || pane.removed) return;
        deps.onAttention?.(pane);
        if (options.notifyDesktop)
          withSession(options.notifyDesktop)(notification);
      },
    };

    const focus = observeMountFocus(document, pane.mountAbort.signal);
    let surface: TerminalSurface;
    try {
      surface = await options.mount(
        container,
        sessionAdapter,
        paneSurfaceOptions,
      );
    } catch (error) {
      endPane(pane);
      // Once a native session exists, retain its failed pane through
      // asynchronous termination and main's acknowledgement. A close request
      // is not an exit.
      if (adapter.sessionId() === undefined) {
        const lastPane = tabPanes(pane.tab).length <= 1;
        deps.removePane(pane, false);
        if (lastPane) {
          if (pane.startRequested) deps.notifyEmpty();
          else if (!pane.mountAbort.signal.aborted)
            deps.notifyEmpty("rendering-failure");
        }
      }
      throw error;
    } finally {
      focus.dispose();
    }
    if (deps.disposed() || pane.removed) {
      surface.dispose();
      return;
    }
    pane.surface = surface;
    pane.geometry = surface.geometry();
    const latestConfiguration = completeConfiguration(deps.surfaceOptions());
    if (latestConfiguration) surface.applyConfiguration(latestConfiguration);
    const steps = deps.zoomSteps();
    for (let step = 0; step < Math.abs(steps); step += 1)
      surface.zoom(steps > 0 ? "in" : "out");
    if (deps.selectedTab() === pane.tab && pane.tab.focused === pane) {
      deps.notifyFocus(pane.tab);
      if (document.hasFocus()) deps.focus(pane, focus.unchanged());
    }
  };
}

// A pane in a background tab has no layout box. Its tab would fill the tabs
// area, as the selected tab does, and split it by the tab's layout (#1041).
function estimatedPaneBox(pane: TerminalPane) {
  const tab = pane.tab.container;
  const area = tab.parentElement?.getBoundingClientRect();
  if (!area || area.width <= 0 || area.height <= 0) return undefined;
  const px = (value: string) => Number.parseFloat(value) || 0;
  const padding = (element: HTMLElement) => {
    const style = getComputedStyle(element);
    return {
      width: px(style.paddingLeft) + px(style.paddingRight),
      height: px(style.paddingTop) + px(style.paddingBottom),
    };
  };
  const tabPadding = padding(tab);
  return paneLayoutBox(
    pane.tab.layout,
    pane,
    area.width - tabPadding.width,
    area.height - tabPadding.height,
    padding(pane.container),
  );
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

function completeConfiguration(
  options: TerminalTabsOptions["surfaceOptions"],
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
    ...(options.labels ? { labels: options.labels } : {}),
    appearance: {
      fontSize: options.appearance.fontSize,
      lineHeight: options.appearance.lineHeight,
      ligatures: options.appearance.ligatures,
      ...(options.appearance.systemFont
        ? { systemFont: options.appearance.systemFont }
        : {}),
    },
    contextMenuEnabled: options.contextMenuEnabled ?? true,
    padding: options.padding,
    scrollbackLines: options.scrollbackLines,
    optionKeyMode: options.optionKeyMode,
    theme: options.theme,
  };
}
