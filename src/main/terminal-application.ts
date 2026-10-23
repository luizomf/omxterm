import type {
  TerminalExit,
  TerminalFontZoom,
  TerminalClipboardAction,
  TerminalTabCommand,
} from "../shared/terminal-contract";
import type {
  TerminalSessionEndContext,
  TerminalSessionStartErrorContext,
} from "./terminal-ipc-controller";
import type { OperationalEventLog } from "./operational-events";
import { terminalSessionExitFailure } from "./terminal-session-failure";

export const DEFAULT_CONFIRM_CLOSE = true;
export const DEFAULT_ALWAYS_ON_TOP = false;

export interface NativeTerminalWindow {
  isDestroyed(): boolean;
  close(): void;
  isFullScreen(): boolean;
  setFullScreen(value: boolean): void;
  isAlwaysOnTop(): boolean;
  setAlwaysOnTop(value: boolean, level: "floating"): void;
}

export interface TerminalWindowLifecycle {
  readonly windowId: number;
  onWindowClosed(): void;
  onTabsEmpty(reason?: "rendering-failure"): void;
  onSessionStartError(context: TerminalSessionStartErrorContext): void;
  onSessionExit(exit: TerminalExit, context: TerminalSessionEndContext): void;
}

export type TerminalSessionFailure =
  | {
      readonly reason: "rendering";
      readonly launchKind: TerminalSessionEndContext["launchKind"];
    }
  | {
      readonly reason: "spawn";
      readonly launchKind: TerminalSessionStartErrorContext["launchKind"];
    }
  | {
      readonly reason: "signal";
      readonly launchKind: TerminalSessionEndContext["launchKind"];
      readonly signal: number | null;
    };

// Whether the window's sessions run a foreground child process (ADR 0017):
// close confirmations ask only for busy sessions, never for an idle shell.
export interface TerminalSessionActivity {
  hasBusySelectedSession(): boolean;
  hasBusySession(): boolean;
}

interface TerminalWindowInstance<Window extends NativeTerminalWindow> {
  readonly window: Window;
  readonly sessionActivity: TerminalSessionActivity;
  load(): Promise<void>;
}

interface TerminalWindowState {
  readonly sessionActivity: TerminalSessionActivity;
  pendingFailures: number;
  tabsEmpty: boolean;
  closeConfirmed: boolean;
  closeRequest: Promise<void> | undefined;
  tabCloseRequest: Promise<void> | undefined;
}

interface TerminalApplicationOptions<Window extends NativeTerminalWindow> {
  readonly confirmClose?: boolean;
  readonly alwaysOnTopDefault?: boolean;
  readonly createWindow: (
    lifecycle: TerminalWindowLifecycle,
  ) => TerminalWindowInstance<Window>;
  readonly getSelectedWindow: () => Window | undefined;
  readonly showQuitConfirmation: (
    window: Window | undefined,
  ) => Promise<boolean>;
  readonly showCloseWindowConfirmation: (window: Window) => Promise<boolean>;
  readonly showCloseTabConfirmation: (window: Window) => Promise<boolean>;
  readonly showSessionFailure: (
    window: Window,
    failure: TerminalSessionFailure,
  ) => Promise<void>;
  readonly sendFontZoom: (window: Window, command: TerminalFontZoom) => void;
  readonly sendClipboardAction: (
    window: Window,
    action: TerminalClipboardAction,
  ) => void;
  readonly sendSnippetsToggle: (window: Window) => void;
  readonly sendFind: (window: Window) => void;
  readonly sendTabBarToggle: (window: Window) => void;
  readonly sendTitleBarToggle: (window: Window) => void;
  readonly sendLocalImageOpen: (window: Window) => void;
  readonly toggleDeveloperTools: (window: Window) => void;
  readonly sendTabCommand: (
    window: Window,
    command: TerminalTabCommand,
  ) => void;
  readonly quit: () => void;
  readonly operationalEvents?: Pick<OperationalEventLog, "write">;
}

export interface TerminalApplication<
  Window extends NativeTerminalWindow = NativeTerminalWindow,
> {
  newWindow(): Promise<void>;
  closeSelectedWindow(): Promise<void>;
  requestWindowClose(window: Window): Promise<void>;
  mayCloseWindow(window: Window): boolean;
  forceCloseWindow(window: Window): void;
  requestQuit(): Promise<void>;
  newTabInSelectedWindow(): void;
  closeSelectedTab(): Promise<void>;
  selectNextTab(): void;
  selectPreviousTab(): void;
  selectTabInSelectedWindow(position: number): void;
  toggleSelectedFullScreen(): void;
  toggleSelectedAlwaysOnTop(): void;
  toggleSelectedDevTools(): void;
  zoomSelectedWindow(command: TerminalFontZoom): void;
  clipboardSelectedWindow(action: TerminalClipboardAction): void;
  findInSelectedWindow(): void;
  toggleSelectedSnippets(): void;
  toggleSelectedTabBar(): void;
  toggleSelectedTitleBar(): void;
  openLocalImageInSelectedWindow(): void;
  applyConfiguration(configuration: {
    readonly confirmClose: boolean;
    readonly alwaysOnTopDefault: boolean;
  }): void;
  isQuitting(): boolean;
}

export function startTerminalApplication<Window extends NativeTerminalWindow>(
  options: TerminalApplicationOptions<Window>,
): TerminalApplication<Window> {
  const windows = new Map<Window, TerminalWindowState>();
  let quitting = false;
  let quitRequest: Promise<void> | undefined;
  let nextWindowId = 1;
  let confirmCloseEnabled = options.confirmClose ?? DEFAULT_CONFIRM_CLOSE;
  let alwaysOnTopDefault = options.alwaysOnTopDefault ?? DEFAULT_ALWAYS_ON_TOP;

  const confirmClose = () => confirmCloseEnabled;

  const selectedWindow = () => {
    const selected = options.getSelectedWindow();
    return selected && windows.has(selected) && !selected.isDestroyed()
      ? selected
      : undefined;
  };

  const selectedWindowAction = (action: (window: Window) => void) => () => {
    const window = selectedWindow();
    if (window) action(window);
  };

  const quit = () => {
    if (quitting) return;
    quitting = true;
    options.quit();
  };

  const forceCloseWindow = (window: Window) => {
    const state = windows.get(window);
    if (state) state.closeConfirmed = true;
    if (!window.isDestroyed()) window.close();
  };

  const closeIfEmpty = (window: Window) => {
    const state = windows.get(window);
    if (state?.tabsEmpty && state.pendingFailures === 0)
      forceCloseWindow(window);
  };

  const retainFailure = (
    window: Window,
    failure: TerminalSessionFailure,
    sessionId?: string,
  ) => {
    const state = windows.get(window);
    if (!state || window.isDestroyed()) return;
    state.pendingFailures += 1;
    const acknowledged = () => {
      if (windows.get(window) !== state || window.isDestroyed()) return;
      state.pendingFailures -= 1;
      if (sessionId !== undefined)
        options.sendTabCommand(window, { action: "close-session", sessionId });
      closeIfEmpty(window);
    };
    void options
      .showSessionFailure(window, failure)
      .then(acknowledged, acknowledged);
  };

  const sendToSelected = (command: TerminalTabCommand) => {
    const window = selectedWindow();
    if (window) options.sendTabCommand(window, command);
  };

  return {
    async newWindow() {
      if (quitting) return;

      const windowId = nextWindowId;
      nextWindowId += 1;
      const openedAt = Date.now();
      let window: Window | undefined;
      const pendingLifecycleEvents: Array<() => void> = [];
      const dispatch = (event: () => void) => {
        if (window) event();
        else pendingLifecycleEvents.push(event);
      };
      const instance = options.createWindow({
        windowId,
        onWindowClosed() {
          dispatch(() => {
            windows.delete(instance.window);
            options.operationalEvents?.write({
              name: "window.closed",
              windowId,
              durationMs: elapsedMilliseconds(openedAt),
            });
            if (windows.size === 0) quit();
          });
        },
        onTabsEmpty(reason) {
          dispatch(() => {
            const state = windows.get(instance.window);
            if (!state || state.tabsEmpty) return;
            state.tabsEmpty = true;
            if (reason === "rendering-failure")
              retainFailure(instance.window, {
                reason: "rendering",
                launchKind: "default-shell",
              });
            closeIfEmpty(instance.window);
          });
        },
        onSessionStartError(context) {
          dispatch(() => {
            // Spawn rejection drops the renderer tab, but its acknowledgement
            // remains a window owner independently of every sibling session.
            retainFailure(instance.window, {
              reason: "spawn",
              launchKind: context.launchKind,
            });
          });
        },
        onSessionExit(exit, context) {
          dispatch(() => {
            // Only the renderer knows whether another tab is still mounting.
            // Its last-tab notification, not the native PTY count, closes an
            // ordinarily emptied window. Native shutdown still owns PTY drain.
            const failure = terminalSessionExitFailure(exit, context);
            if (!failure) return;
            // Even the last native session may have another failed or mounting
            // tab beside it. Acknowledgement removes only its own dead tab.
            retainFailure(instance.window, failure, context.sessionId);
          });
        },
      });
      window = instance.window;
      windows.set(window, {
        sessionActivity: instance.sessionActivity,
        pendingFailures: 0,
        tabsEmpty: false,
        closeConfirmed: false,
        closeRequest: undefined,
        tabCloseRequest: undefined,
      });
      options.operationalEvents?.write({ name: "window.opened", windowId });
      window.setAlwaysOnTop(alwaysOnTopDefault, "floating");
      for (const event of pendingLifecycleEvents) event();
      await instance.load();
    },
    closeSelectedWindow() {
      const window = selectedWindow();
      return window ? this.requestWindowClose(window) : Promise.resolve();
    },
    requestWindowClose(window) {
      const state = windows.get(window);
      if (!state || window.isDestroyed()) return Promise.resolve();
      if (this.mayCloseWindow(window)) {
        forceCloseWindow(window);
        return Promise.resolve();
      }
      if (state.closeRequest) return state.closeRequest;
      state.closeRequest = options
        .showCloseWindowConfirmation(window)
        .then((confirmed) => {
          if (confirmed) forceCloseWindow(window);
        })
        .finally(() => {
          state.closeRequest = undefined;
        });
      return state.closeRequest;
    },
    mayCloseWindow(window) {
      if (quitting || !confirmClose()) return true;
      const state = windows.get(window);
      return (
        state === undefined ||
        state.closeConfirmed ||
        !state.sessionActivity.hasBusySession()
      );
    },
    forceCloseWindow,
    requestQuit() {
      if (quitting) return Promise.resolve();
      if (quitRequest) return quitRequest;
      const anySessionBusy = [...windows.values()].some((state) =>
        state.sessionActivity.hasBusySession(),
      );
      if (!confirmClose() || windows.size === 0 || !anySessionBusy) {
        quit();
        return Promise.resolve();
      }

      quitRequest = options
        .showQuitConfirmation(selectedWindow())
        .then((confirmed) => {
          if (confirmed) quit();
        })
        .finally(() => {
          quitRequest = undefined;
        });
      return quitRequest;
    },
    newTabInSelectedWindow() {
      sendToSelected({ action: "new" });
    },
    closeSelectedTab() {
      const window = selectedWindow();
      if (!window) return Promise.resolve();
      const state = windows.get(window)!;
      if (state.tabCloseRequest) return state.tabCloseRequest;
      if (!confirmClose() || !state.sessionActivity.hasBusySelectedSession()) {
        options.sendTabCommand(window, { action: "close" });
        return Promise.resolve();
      }
      state.tabCloseRequest = confirmTabClose(
        window,
        options,
        () => !window.isDestroyed() && windows.has(window),
      ).finally(() => {
        state.tabCloseRequest = undefined;
      });
      return state.tabCloseRequest;
    },
    selectNextTab() {
      sendToSelected({ action: "next" });
    },
    selectPreviousTab() {
      sendToSelected({ action: "previous" });
    },
    selectTabInSelectedWindow(position) {
      sendToSelected({ action: "select", position });
    },
    toggleSelectedFullScreen() {
      const window = selectedWindow();
      if (window) window.setFullScreen(!window.isFullScreen());
    },
    toggleSelectedAlwaysOnTop() {
      const window = selectedWindow();
      if (window) window.setAlwaysOnTop(!window.isAlwaysOnTop(), "floating");
    },
    toggleSelectedDevTools: selectedWindowAction(options.toggleDeveloperTools),
    zoomSelectedWindow(command) {
      const window = selectedWindow();
      if (window) options.sendFontZoom(window, command);
    },
    clipboardSelectedWindow(action) {
      const window = selectedWindow();
      if (window) options.sendClipboardAction(window, action);
    },
    findInSelectedWindow: selectedWindowAction(options.sendFind),
    toggleSelectedTabBar: selectedWindowAction(options.sendTabBarToggle),
    toggleSelectedTitleBar: selectedWindowAction(options.sendTitleBarToggle),
    toggleSelectedSnippets: selectedWindowAction(options.sendSnippetsToggle),
    openLocalImageInSelectedWindow: selectedWindowAction(
      options.sendLocalImageOpen,
    ),
    applyConfiguration(configuration) {
      confirmCloseEnabled = configuration.confirmClose;
      alwaysOnTopDefault = configuration.alwaysOnTopDefault;
    },
    isQuitting: () => quitting,
  };
}

function confirmTabClose<Window extends NativeTerminalWindow>(
  window: Window,
  options: Pick<
    TerminalApplicationOptions<Window>,
    "sendTabCommand" | "showCloseTabConfirmation"
  >,
  isOwnerAlive: () => boolean,
): Promise<void> {
  // Capture in the tab owner before any asynchronous decision. Commands
  // share an ordered channel, including ordinary session-exit delivery.
  options.sendTabCommand(window, { action: "prepare-close" });
  const resolveClose = (confirmed: boolean) => {
    if (isOwnerAlive())
      options.sendTabCommand(window, { action: "resolve-close", confirmed });
  };
  return options
    .showCloseTabConfirmation(window)
    .then(resolveClose, (error: unknown) => {
      resolveClose(false);
      throw error;
    });
}

function elapsedMilliseconds(startedAt: number): number {
  return Math.max(0, Math.round(Date.now() - startedAt));
}
