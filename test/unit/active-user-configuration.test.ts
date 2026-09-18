import { expect, it, vi } from "vitest";
import {
  applyActiveUserConfiguration,
  terminalRendererConfiguration,
} from "../../src/main/active-user-configuration";
import type {
  NativeTerminalWindow,
  TerminalApplication,
} from "../../src/main/terminal-application";
import { DEFAULT_USER_CONFIGURATION } from "../../src/main/user-configuration";
import type { ActiveUserConfiguration } from "../../src/main/user-configuration-reloader";
import { DEFAULT_TERMINAL_THEME } from "../../src/shared/terminal-theme";

function activeConfiguration(): ActiveUserConfiguration {
  return {
    configuration: {
      ...DEFAULT_USER_CONFIGURATION,
      confirmClose: false,
      alwaysOnTop: true,
      fontSize: 40,
      fontLigatures: false,
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
    setMinimumSize: vi.fn(),
    close: vi.fn(),
    isFullScreen: () => false,
    setFullScreen: vi.fn(),
    isAlwaysOnTop: () => false,
    setAlwaysOnTop: vi.fn(),
  } satisfies NativeTerminalWindow & {
    setBackgroundColor(color: string): void;
    setMinimumSize(width: number, height: number): void;
  };
  const applyRendererConfiguration = vi.fn();
  const applyConfiguration = vi.fn();
  const rebuildMenu = vi.fn();

  applyActiveUserConfiguration(
    state,
    true,
    { applyConfiguration: applyRendererConfiguration },
    [window],
    { applyConfiguration } as unknown as TerminalApplication<typeof window>,
    {
      rebuildMenu,
      nativeTitleInset: 30,
      platform: "darwin",
    },
  );

  expect(applyRendererConfiguration).toHaveBeenCalledWith(
    expect.objectContaining({
      fontSize: 40,
      fontLigatures: false,
      terminalTheme: state.configuration.terminalTheme,
      userFileErrors: ["current warning"],
    }),
  );
  expect(setBackgroundColor).toHaveBeenCalledWith("#123456");
  expect(window.setMinimumSize).toHaveBeenCalledWith(320, 200);
  expect(applyConfiguration).toHaveBeenCalledWith({
    confirmClose: false,
    alwaysOnTopDefault: true,
  });
  expect(rebuildMenu).toHaveBeenCalledOnce();
  expect(window.setAlwaysOnTop).not.toHaveBeenCalled();
});

it("keeps the complete last-valid renderer snapshot on rejection", () => {
  const state = activeConfiguration();
  const applyRendererConfiguration = vi.fn();
  const applyConfiguration = vi.fn();
  const rebuildMenu = vi.fn();

  applyActiveUserConfiguration(
    state,
    false,
    { applyConfiguration: applyRendererConfiguration },
    [],
    { applyConfiguration } as unknown as TerminalApplication,
    {
      rebuildMenu,
      nativeTitleInset: 30,
      platform: "darwin",
    },
  );
  const renderer = terminalRendererConfiguration(state, 30);

  expect(applyRendererConfiguration).toHaveBeenCalledOnce();
  expect(applyConfiguration).not.toHaveBeenCalled();
  expect(rebuildMenu).not.toHaveBeenCalled();
  expect(renderer).toMatchObject({
    fontSize: 40,
    fontLigatures: false,
    scrollbackLines: 10_000,
    optionKeyMode: "none",
    nativeTitleInset: 30,
    terminalTheme: state.configuration.terminalTheme,
    userFileErrors: ["current warning"],
  });
});
