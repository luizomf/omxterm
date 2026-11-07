// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { EventEmitter } from "node:events";
import { createWindowBackgroundEffects } from "../../src/main/window-background-effects";
import { createRendererConfigurationState } from "../../src/main/terminal-renderer-configuration";
import { DEFAULT_USER_CONFIGURATION } from "../../src/main/user-configuration";
import { mountTerminalWindowPage } from "../../src/renderer/terminal-window-host";
import { DEFAULT_TERMINAL_THEME } from "../../src/shared/terminal-theme";
import type { TerminalRendererConfiguration } from "../../src/shared/user-configuration";

const configuration: TerminalRendererConfiguration = {
  fontSize: 16,
  fontLineHeight: 1,
  fontLigatures: true,
  terminalPadding: { top: 0, right: 8, bottom: 8, left: 8 },
  scrollbackLines: 10000,
  optionKeyMode: "none",
  nativeTitleInset: 0,
  showTabBar: true,
  transparency: 0,
  terminalTheme: DEFAULT_TERMINAL_THEME,
  userFileErrors: [],
};
function harness(initial = configuration) {
  document.body.replaceChildren();
  const tabStrip = document.createElement("nav");
  const tabsContainer = document.createElement("main");
  document.body.append(tabStrip, tabsContainer);
  const surface = {
    geometry: () => undefined,
    focus: vi.fn(),
    dispose: vi.fn(),
    applyConfiguration: vi.fn(),
    applyTheme: vi.fn(),
    zoom: vi.fn(),
    selectAll: vi.fn(),
    find: vi.fn(),
    exportText: vi.fn(() => ""),
    copy: vi.fn(async () => {}),
    paste: vi.fn(async () => {}),
    inject: vi.fn(async () => {}),
  };
  const mount = vi.fn(async () => surface);
  const createAdapter = vi.fn(() => ({
    sessionId: () => "background-fixture",
    start: vi.fn(async () => {}),
    close: vi.fn(),
    resize: vi.fn(),
    write: vi.fn(),
  }));
  let listener!: (configuration: TerminalRendererConfiguration) => void;
  const host = mountTerminalWindowPage(
    { tabStrip, tabsContainer },
    {
      configuration: initial,
      createAdapter,
      mount,
      page: window,
      subscribeToConfigurationUpdates(next) {
        listener = next;
        return () => {};
      },
    },
  );
  return {
    host,
    surface,
    mount,
    createAdapter,
    tabsContainer,
    update: (next: TerminalRendererConfiguration) => listener(next),
  };
}

it("paints live background transparency without replacing or reconfiguring its Surface or Adapter", async () => {
  const { host, surface, mount, createAdapter, update } = harness();
  await host.ready;
  // Tab mounting commits its initial snapshot; transparency-only reloads must not.
  surface.applyConfiguration.mockClear();
  expect(
    document.documentElement.style.getPropertyValue(
      "--terminal-background-opacity",
    ),
  ).toBe("1");
  update({ ...configuration, transparency: 0.375 });
  expect(
    document.documentElement.style.getPropertyValue(
      "--terminal-background-opacity",
    ),
  ).toBe("0.625");
  update({ ...configuration, transparency: 1 });
  expect(
    document.documentElement.style.getPropertyValue(
      "--terminal-background-opacity",
    ),
  ).toBe("0");
  expect(mount).toHaveBeenCalledOnce();
  expect(createAdapter).toHaveBeenCalledOnce();
  expect(surface.applyConfiguration).not.toHaveBeenCalled();
  expect(surface.dispose).not.toHaveBeenCalled();
  host.dispose();
});

it.each([
  ["win32", 0, "1"],
  ["darwin", 0.25, "0.75"],
  ["linux", 0.25, "0.75"],
] as const)(
  "paints the appearance fixture's blur-disabled request using effective transparency on %s",
  async (platform, effectiveTransparency, opacity) => {
    const requested = Object.freeze({
      ...DEFAULT_USER_CONFIGURATION,
      blur: false,
      transparency: 0.25,
    });
    const nativeWindow = Object.assign(new EventEmitter(), {
      show() {},
      isVisible: () => true,
      isDestroyed: () => false,
      getNativeWindowHandle: () => Buffer.alloc(8),
      setVibrancy: vi.fn(),
      setBackgroundMaterial: vi.fn(),
      setBackgroundColor: vi.fn(),
    });
    const effects = createWindowBackgroundEffects(nativeWindow, {
      platform,
      windowsVersion: "10.0.26200",
    });
    const rendererRequest = { ...configuration, transparency: 0.25 };
    const state = createRendererConfigurationState(
      configuration,
      false,
      { mainFrame: {}, isDestroyed: () => false, send: vi.fn() },
      effects.transparency,
    );
    const { host, surface, update } = harness(state.effective());
    await host.ready;
    try {
      surface.applyConfiguration.mockClear();
      // Match the native fixture's effects-before-snapshot reload ordering.
      effects.apply(requested);
      state.apply(rendererRequest);
      const snapshot = state.effective();
      update(snapshot);
      expect(snapshot.transparency).toBe(effectiveTransparency);
      expect(
        document.documentElement.style.getPropertyValue(
          "--terminal-background-opacity",
        ),
      ).toBe(opacity);
      expect(requested).toMatchObject({ blur: false, transparency: 0.25 });
      expect(state.current().transparency).toBe(0.25);
      expect(surface.applyConfiguration).not.toHaveBeenCalled();
    } finally {
      host.dispose();
      effects.dispose();
    }
  },
);

it("applies the native title inset and a non-black theme to the page and mount options", async () => {
  const theme = {
    ...DEFAULT_TERMINAL_THEME,
    name: "non-black",
    colors: {
      ...DEFAULT_TERMINAL_THEME.colors,
      background: "#1e1e2e",
      foreground: "#d9e1f2",
    },
  };
  const { host, tabsContainer, mount } = harness({
    ...configuration,
    terminalTheme: theme,
  });
  await host.ready;
  expect(
    document.documentElement.style.getPropertyValue("--native-title-inset"),
  ).toBe("0px");
  expect(
    document.documentElement.style.getPropertyValue("--terminal-background"),
  ).toBe("#1e1e2e");
  expect(document.body.style.getPropertyValue("--terminal-background")).toBe(
    "#1e1e2e",
  );
  expect(
    document.documentElement.style.getPropertyValue("--terminal-foreground"),
  ).toBe("#d9e1f2");
  expect(tabsContainer.style.getPropertyValue("--terminal-background")).toBe(
    "#1e1e2e",
  );
  expect(mount).toHaveBeenCalledWith(
    expect.any(HTMLElement),
    expect.any(Object),
    expect.objectContaining({ theme, background: "host" }),
  );
  host.dispose();
});
