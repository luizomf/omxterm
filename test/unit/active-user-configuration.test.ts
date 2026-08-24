import { expect, it, vi } from "vitest";
import {
  applyActiveUserConfiguration,
  terminalRendererConfiguration,
} from "../../src/main/active-user-configuration";
import type {
  NativeTerminalWindow,
  TerminalApplication,
} from "../../src/main/terminal-application";
import {
  DEFAULT_USER_CONFIGURATION,
  type LoadedUserConfiguration,
} from "../../src/main/user-configuration";
import type { ActiveUserConfiguration } from "../../src/main/user-configuration-reloader";
import { DEFAULT_TERMINAL_THEME } from "../../src/shared/terminal-theme";

function activeConfiguration(): ActiveUserConfiguration {
  return {
    configuration: {
      ...DEFAULT_USER_CONFIGURATION,
      confirmClose: false,
      alwaysOnTop: true,
      fontSize: 40,
      terminalTheme: {
        ...DEFAULT_TERMINAL_THEME,
        name: "reloaded",
        colors: { ...DEFAULT_TERMINAL_THEME.colors, background: "#123456" },
      },
    },
    userFileErrors: ["current warning"],
  };
}

it("commits applicable application state and current visual state without touching window toggles", () => {
  const state = activeConfiguration();
  const setBackgroundColor = vi.fn();
  const window = {
    isDestroyed: () => false,
    setBackgroundColor,
    close: vi.fn(),
    isFullScreen: () => false,
    setFullScreen: vi.fn(),
    isAlwaysOnTop: () => false,
    setAlwaysOnTop: vi.fn(),
  } satisfies NativeTerminalWindow & {
    setBackgroundColor(color: string): void;
  };
  const applyThemeUpdate = vi.fn();
  const applyConfiguration = vi.fn();
  const rebuildMenu = vi.fn();

  applyActiveUserConfiguration(
    state,
    true,
    { applyThemeUpdate },
    [window],
    { applyConfiguration } as unknown as TerminalApplication<typeof window>,
    rebuildMenu,
  );

  expect(applyThemeUpdate).toHaveBeenCalledWith({
    terminalTheme: state.configuration.terminalTheme,
    userFileErrors: ["current warning"],
  });
  expect(setBackgroundColor).toHaveBeenCalledWith("#123456");
  expect(applyConfiguration).toHaveBeenCalledWith({
    confirmClose: false,
    alwaysOnTopDefault: true,
  });
  expect(rebuildMenu).toHaveBeenCalledOnce();
  expect(window.setAlwaysOnTop).not.toHaveBeenCalled();
});

it("updates only visual notices on rejection and keeps future surfaces on startup non-theme values", () => {
  const state = activeConfiguration();
  const startup = {
    ...DEFAULT_USER_CONFIGURATION,
    fontSize: 18,
    scrollbackLines: 999,
    optionKeyMode: "left" as const,
  } satisfies LoadedUserConfiguration;
  const applyThemeUpdate = vi.fn();
  const applyConfiguration = vi.fn();
  const rebuildMenu = vi.fn();

  applyActiveUserConfiguration(
    state,
    false,
    { applyThemeUpdate },
    [],
    { applyConfiguration } as unknown as TerminalApplication,
    rebuildMenu,
  );
  const renderer = terminalRendererConfiguration(startup, state, 30);

  expect(applyThemeUpdate).toHaveBeenCalledOnce();
  expect(applyConfiguration).not.toHaveBeenCalled();
  expect(rebuildMenu).not.toHaveBeenCalled();
  expect(renderer).toMatchObject({
    fontSize: 18,
    scrollbackLines: 999,
    optionKeyMode: "left",
    nativeTitleInset: 30,
    terminalTheme: state.configuration.terminalTheme,
    userFileErrors: ["current warning"],
  });
});
