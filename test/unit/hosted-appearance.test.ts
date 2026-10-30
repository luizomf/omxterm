import { expect, it, vi } from "vitest";
import {
  subscribeHostedAppearance,
  subscribeHostedLanguage,
} from "../../src/main/hosted-appearance";
import { createRendererConfigurationState } from "../../src/main/terminal-renderer-configuration";
import { DEFAULT_USER_CONFIGURATION } from "../../src/main/user-configuration";

it("publishes language independently of appearance, replays only within its owner and unsubscribes", () => {
  const owner = { mainFrame: {}, isDestroyed: () => false, send: vi.fn() };
  const language = vi.fn();
  const appearance = vi.fn();
  const other = vi.fn();
  const unsubscribe = subscribeHostedLanguage(owner, language);
  subscribeHostedAppearance(owner, appearance);
  const offOther = subscribeHostedLanguage({}, other);
  expect(language).not.toHaveBeenCalled();
  const configuration = {
    ...DEFAULT_USER_CONFIGURATION,
    nativeTitleInset: 0 as const,
    userFileErrors: [],
    language: "en-US" as const,
  };
  const state = createRendererConfigurationState(
    configuration,
    false,
    owner,
    () => 0,
  );
  expect(language).toHaveBeenCalledExactlyOnceWith("en-US");
  state.apply({ ...configuration, language: "pt-BR" });
  expect(language).toHaveBeenLastCalledWith("pt-BR");
  expect(appearance).toHaveBeenCalledTimes(1);
  state.apply({ ...configuration, language: "pt-BR", fontSize: 24 });
  expect(language).toHaveBeenCalledTimes(2);
  const replay = vi.fn();
  const offReplay = subscribeHostedLanguage(owner, replay);
  expect(replay).toHaveBeenCalledExactlyOnceWith("pt-BR");
  expect(other).not.toHaveBeenCalled();
  unsubscribe();
  offReplay();
  offOther();
  state.apply(configuration);
  expect(language).toHaveBeenCalledTimes(2);
  expect(replay).toHaveBeenCalledTimes(1);
});

it("projects only effective appearance, replays and deduplicates unrelated configuration updates", () => {
  const owner = { mainFrame: {}, isDestroyed: () => false, send: vi.fn() };
  const listener = vi.fn();
  const unsubscribe = subscribeHostedAppearance(owner, listener);
  expect(listener).not.toHaveBeenCalled();
  let effectiveTransparency = 0;
  const configuration = {
    ...DEFAULT_USER_CONFIGURATION,
    nativeTitleInset: 0 as const,
    userFileErrors: [],
    transparency: 0.7,
  };
  const state = createRendererConfigurationState(
    configuration,
    false,
    owner,
    () => effectiveTransparency,
  );
  const expected = {
    background: configuration.terminalTheme.colors.background,
    foreground: configuration.terminalTheme.colors.foreground,
    opacity: 1,
  };
  expect(listener).toHaveBeenCalledExactlyOnceWith(expected);
  expect(Object.isFrozen(listener.mock.calls[0]![0])).toBe(true);
  const late = vi.fn();
  const offLate = subscribeHostedAppearance(owner, late);
  expect(late).toHaveBeenCalledExactlyOnceWith(expected);
  state.apply({ ...configuration, fontSize: 24 });
  state.applyFullScreen(true);
  expect(listener).toHaveBeenCalledTimes(1);
  effectiveTransparency = 0.75;
  state.apply(configuration);
  expect(listener).toHaveBeenLastCalledWith({ ...expected, opacity: 0.25 });
  expect(state.current().transparency).toBe(0.7);
  unsubscribe();
  offLate();
  state.apply({
    ...configuration,
    terminalTheme: {
      ...configuration.terminalTheme,
      colors: {
        ...configuration.terminalTheme.colors,
        background: "#ffffff",
        foreground: "#101010",
      },
    },
  });
  expect(listener).toHaveBeenCalledTimes(2);
  const current = vi.fn();
  subscribeHostedAppearance(owner, current)();
  expect(current).toHaveBeenCalledExactlyOnceWith({
    background: "#ffffff",
    foreground: "#101010",
    opacity: 0.25,
  });
});
