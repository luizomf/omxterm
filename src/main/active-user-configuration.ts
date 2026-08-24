import type { TerminalRendererConfiguration } from "../shared/user-configuration";
import type { TerminalIpcRouter } from "./terminal-ipc-controller";
import type { LoadedUserConfiguration } from "./user-configuration";
import type { ActiveUserConfiguration } from "./user-configuration-reloader";
import type {
  NativeTerminalWindow,
  TerminalApplication,
} from "./terminal-application";
import {
  applyTerminalThemeToNativeWindows,
  type ThemeableTerminalWindow,
} from "./terminal-window";

export function applyActiveUserConfiguration<
  Window extends NativeTerminalWindow & ThemeableTerminalWindow,
>(
  state: ActiveUserConfiguration,
  committed: boolean,
  router: Pick<TerminalIpcRouter, "applyThemeUpdate">,
  windows: readonly Window[],
  application: TerminalApplication<Window> | undefined,
  rebuildMenu: () => void,
): void {
  const update = {
    terminalTheme: state.configuration.terminalTheme,
    userFileErrors: state.userFileErrors,
  };
  router.applyThemeUpdate(update);
  applyTerminalThemeToNativeWindows(windows, update.terminalTheme);
  if (!committed) return;
  application?.applyConfiguration({
    confirmClose: state.configuration.confirmClose,
    alwaysOnTopDefault: state.configuration.alwaysOnTop,
  });
  rebuildMenu();
}

export function terminalRendererConfiguration(
  startup: LoadedUserConfiguration,
  active: ActiveUserConfiguration,
  nativeTitleInset: 0 | 30,
): TerminalRendererConfiguration {
  return Object.freeze({
    ...(startup.fontFamily ? { fontFamily: startup.fontFamily } : {}),
    fontSize: startup.fontSize,
    fontLineHeight: startup.fontLineHeight,
    terminalPadding: startup.terminalPadding,
    scrollbackLines: startup.scrollbackLines,
    optionKeyMode: startup.optionKeyMode,
    nativeTitleInset,
    terminalTheme: active.configuration.terminalTheme,
    userFileErrors: active.userFileErrors,
  });
}
