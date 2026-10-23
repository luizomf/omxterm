import type { TerminalRendererConfiguration } from "../shared/user-configuration";
import type { TerminalIpcRouter } from "./terminal-ipc-controller";
import type { LoadedUserConfiguration } from "./user-configuration";
import type { ActiveUserConfiguration } from "./user-configuration-reloader";
import type {
  NativeTerminalWindow,
  TerminalApplication,
} from "./terminal-application";
import {
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
    readonly applyBackgroundEffects?: (
      configuration: LoadedUserConfiguration,
    ) => void;
  },
): void {
  const rendererConfiguration = terminalRendererConfiguration(
    state,
    options.nativeTitleInset,
  );
  if (committed) options.applyBackgroundEffects?.(state.configuration);
  router.applyConfiguration(rendererConfiguration);
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
    nativeTitleInset: configuration.showTitleBar ? nativeTitleInset : 0,
    showTabBar: configuration.showTabBar,
    ...(configuration.cornerRadius > 0
      ? { cornerRadius: configuration.cornerRadius }
      : {}),
    ...(configuration.autoHideTitleBar ? { autoHideTitleBar: true } : {}),
    transparency: configuration.transparency,
    terminalTheme: active.configuration.terminalTheme,
    userFileErrors: active.userFileErrors,
  });
}
