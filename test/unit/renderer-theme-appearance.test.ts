// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { mountTerminalWindowPage } from "../../src/renderer/terminal-window-host";
import { DEFAULT_TERMINAL_THEME } from "../../src/shared/terminal-theme";
import type { TerminalRendererConfiguration } from "../../src/shared/user-configuration";

it("repaints independent theme roles across custom, hidden and default reloads without touching the Surface", async () => {
  document.body.innerHTML = "";
  const tabStrip = document.createElement("nav");
  const tabsContainer = document.createElement("div");
  document.body.append(tabStrip, tabsContainer);
  const configuration = {
    transparency: 0,
    showTabBar: true,
    fontSize: 16,
    fontLineHeight: 1,
    fontLigatures: true,
    terminalPadding: { top: 0, right: 8, bottom: 8, left: 8 },
    scrollbackLines: 10_000,
    optionKeyMode: "none",
    nativeTitleInset: 0,
    terminalTheme: {
      ...DEFAULT_TERMINAL_THEME,
      appearance: {
        paneDivider: "#123456",
        auxiliaryPanelDivider: "#654321",
        activePaneHighlight: "#000000",
      },
    },
    userFileErrors: [],
  } as const;
  let update!: (configuration: TerminalRendererConfiguration) => void;
  const surface = {
    geometry: () => undefined,
    dispose: vi.fn(),
    focus: vi.fn(),
    applyTheme: vi.fn(),
    applyConfiguration: vi.fn(),
    zoom: vi.fn(),
    copy: vi.fn(),
    paste: vi.fn(),
    selectAll: vi.fn(),
    find: vi.fn(),
    exportText: vi.fn(() => ""),
    inject: vi.fn(),
  };
  const mount = vi.fn(async () => surface);
  const host = mountTerminalWindowPage(
    { tabStrip, tabsContainer },
    {
      createAdapter: () => ({
        sessionId: () => "s1",
        start: async () => {},
        write() {},
        resize() {},
        close() {},
      }),
      configuration,
      page: window,
      mount,
      subscribeToConfigurationUpdates(listener) {
        update = listener;
        return () => {};
      },
    },
  );
  await host.ready;
  const style = document.documentElement.style;
  const paint = () =>
    [
      "--terminal-pane-divider-color",
      "--auxiliary-panel-divider-color",
      "--terminal-pane-accent",
    ].map((property) => style.getPropertyValue(property));
  // Explicit highlight remains exact even with zero contrast against black.
  expect(paint()).toEqual(["#123456", "#654321", "#000000"]);
  surface.applyConfiguration.mockClear();
  surface.focus.mockClear();
  update({
    ...configuration,
    terminalTheme: {
      ...DEFAULT_TERMINAL_THEME,
      appearance: {
        paneDivider: null,
        auxiliaryPanelDivider: null,
        activePaneHighlight: null,
      },
    },
  });
  expect(paint()).toEqual(["transparent", "transparent", "transparent"]);
  update({
    ...configuration,
    terminalTheme: {
      ...DEFAULT_TERMINAL_THEME,
      appearance: { auxiliaryPanelDivider: "#abcdef" },
    },
  });
  expect(paint()).toEqual(["", "#abcdef", "#80d4ff"]);
  update({ ...configuration, terminalTheme: DEFAULT_TERMINAL_THEME });
  expect(paint()).toEqual(["", "", "#80d4ff"]);
  expect(surface.applyConfiguration).not.toHaveBeenCalled();
  expect(surface.focus).not.toHaveBeenCalled();
  expect(surface.dispose).not.toHaveBeenCalled();
  expect(mount).toHaveBeenCalledOnce();
  update({
    ...configuration,
    terminalTheme: {
      ...DEFAULT_TERMINAL_THEME,
      colors: {
        ...DEFAULT_TERMINAL_THEME.colors,
        background: "#f5f5f5",
        foreground: "#161616",
      },
    },
  });
  expect(paint()).toEqual(["", "", "#161616"]);
  host.dispose();
});
