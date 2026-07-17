import type {
  TerminalExit,
  TerminalFontZoom,
} from "../shared/terminal-contract";

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
  onWindowClosed(): void;
  onSessionStartError(): void;
  onSessionExit(exit: TerminalExit): void;
}

export type TerminalSessionFailure =
  | { readonly reason: "spawn" }
  | { readonly reason: "nonzero-exit"; readonly exitCode: number | null }
  | { readonly reason: "signal"; readonly signal: number | null };

interface TerminalWindowInstance<Window extends NativeTerminalWindow> {
  readonly window: Window;
  load(): Promise<void>;
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
  readonly showSessionFailure: (
    window: Window,
    failure: TerminalSessionFailure,
  ) => Promise<void>;
  readonly sendFontZoom: (window: Window, command: TerminalFontZoom) => void;
  readonly quit: () => void;
}

export interface TerminalApplication {
  newWindow(): Promise<void>;
  closeSelectedWindow(): void;
  requestQuit(): Promise<void>;
  toggleSelectedFullScreen(): void;
  toggleSelectedAlwaysOnTop(): void;
  zoomSelectedWindow(command: TerminalFontZoom): void;
  isQuitting(): boolean;
}

export function startTerminalApplication<Window extends NativeTerminalWindow>(
  options: TerminalApplicationOptions<Window>,
): TerminalApplication {
  const windows = new Map<Window, { failurePending: boolean }>();
  let quitting = false;
  let quitRequest: Promise<void> | undefined;

  const selectedWindow = () => {
    const selected = options.getSelectedWindow();
    return selected && windows.has(selected) && !selected.isDestroyed()
      ? selected
      : undefined;
  };

  const quit = () => {
    if (quitting) return;
    quitting = true;
    options.quit();
  };

  const closeAfterFailure = (
    window: Window,
    failure: TerminalSessionFailure,
  ) => {
    const state = windows.get(window);
    if (!state || state.failurePending) return;
    state.failurePending = true;
    const closeWindow = () => {
      if (!window.isDestroyed()) window.close();
    };
    void options
      .showSessionFailure(window, failure)
      .then(closeWindow, closeWindow);
  };

  return {
    async newWindow() {
      if (quitting) return;

      let window: Window | undefined;
      const pendingLifecycleEvents: Array<() => void> = [];
      const dispatch = (event: () => void) => {
        if (window) event();
        else pendingLifecycleEvents.push(event);
      };
      const instance = options.createWindow({
        onWindowClosed() {
          dispatch(() => {
            windows.delete(instance.window);
            if (windows.size === 0) quit();
          });
        },
        onSessionStartError() {
          dispatch(() =>
            closeAfterFailure(instance.window, { reason: "spawn" }),
          );
        },
        onSessionExit(exit) {
          dispatch(() => {
            if (exit.exitCode === 0 && exit.signal === 0) {
              if (!instance.window.isDestroyed()) instance.window.close();
              return;
            }
            if (exit.signal !== 0) {
              closeAfterFailure(instance.window, {
                reason: "signal",
                signal: normalizeLifecycleCode(exit.signal),
              });
              return;
            }
            closeAfterFailure(instance.window, {
              reason: "nonzero-exit",
              exitCode: normalizeLifecycleCode(exit.exitCode),
            });
          });
        },
      });
      window = instance.window;
      windows.set(window, { failurePending: false });
      window.setAlwaysOnTop(
        options.alwaysOnTopDefault ?? DEFAULT_ALWAYS_ON_TOP,
        "floating",
      );
      for (const event of pendingLifecycleEvents) event();
      await instance.load();
    },
    closeSelectedWindow() {
      selectedWindow()?.close();
    },
    requestQuit() {
      if (quitting) return Promise.resolve();
      if (quitRequest) return quitRequest;
      if (
        (options.confirmClose ?? DEFAULT_CONFIRM_CLOSE) === false ||
        windows.size === 0
      ) {
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
    toggleSelectedFullScreen() {
      const window = selectedWindow();
      if (window) window.setFullScreen(!window.isFullScreen());
    },
    toggleSelectedAlwaysOnTop() {
      const window = selectedWindow();
      if (window) window.setAlwaysOnTop(!window.isAlwaysOnTop(), "floating");
    },
    zoomSelectedWindow(command) {
      const window = selectedWindow();
      if (window) options.sendFontZoom(window, command);
    },
    isQuitting: () => quitting,
  };
}

function normalizeLifecycleCode(value: number): number | null {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}
