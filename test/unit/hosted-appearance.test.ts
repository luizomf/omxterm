import { expect, it, vi } from "vitest";
import { subscribeHostedAppearance } from "../../src/main/hosted-appearance";
import { createRendererConfigurationState } from "../../src/main/terminal-renderer-configuration";
import { DEFAULT_USER_CONFIGURATION } from "../../src/main/user-configuration";

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
