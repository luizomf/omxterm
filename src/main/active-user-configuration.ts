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
  applyTerminalWindowConfiguration,
  type ConfigurableTerminalWindow,
} from "./terminal-window";

export function applyActiveUserConfiguration<
  Window extends NativeTerminalWindow & ConfigurableTerminalWindow,
>(
  state: ActiveUserConfiguration,
  committed: boolean,
  router: Pick<TerminalIpcRouter, "applyConfiguration">,
  windows: readonly Window[],
  application: TerminalApplication<Window> | undefined,
  options: {
    readonly rebuildMenu: () => void;
    readonly nativeTitleInset: 0 | 30;
    readonly platform: string;
  },
): void {
  const rendererConfiguration = terminalRendererConfiguration(
    state,
    options.nativeTitleInset,
  );
  router.applyConfiguration(rendererConfiguration);
  applyTerminalThemeToNativeWindows(
    windows,
    rendererConfiguration.terminalTheme,
  );
  if (!committed) return;
  applyTerminalWindowConfiguration(
    windows,
    state.configuration,
    options.platform,
  );
  application?.applyConfiguration({
    confirmClose: state.configuration.confirmClose,
    alwaysOnTopDefault: state.configuration.alwaysOnTop,
  });
  options.rebuildMenu();
}

export function terminalRendererConfiguration(
  active: ActiveUserConfiguration,
  nativeTitleInset: 0 | 30,
): TerminalRendererConfiguration {
  const configuration: LoadedUserConfiguration = active.configuration;
  return Object.freeze({
    ...(configuration.fontFamily
      ? { fontFamily: configuration.fontFamily }
      : {}),
    fontSize: configuration.fontSize,
    fontLineHeight: configuration.fontLineHeight,
    fontLigatures: configuration.fontLigatures,
    terminalPadding: configuration.terminalPadding,
    scrollbackLines: configuration.scrollbackLines,
    optionKeyMode: configuration.optionKeyMode,
    nativeTitleInset,
    terminalTheme: active.configuration.terminalTheme,
    userFileErrors: active.userFileErrors,
  });
}
