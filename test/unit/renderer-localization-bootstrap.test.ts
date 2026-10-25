// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, expect, it, vi } from "vitest";
import { harness } from "../fixtures/restty-surface-harness";
import { DEFAULT_TERMINAL_THEME } from "../../src/shared/terminal-theme";
import type { TerminalRendererConfiguration } from "../../src/shared/user-configuration";

const configuration: TerminalRendererConfiguration = {
  language: "pt-BR",
  transparency: 0,
  showTabBar: true,
  fontSize: 16,
  fontLineHeight: 1,
  fontLigatures: true,
  terminalPadding: { top: 0, right: 8, bottom: 8, left: 8 },
  scrollbackLines: 10_000,
  optionKeyMode: "none",
  nativeTitleInset: 0,
  terminalTheme: DEFAULT_TERMINAL_THEME,
  userFileErrors: [],
};
afterEach(() => {
  window.dispatchEvent(new Event("pagehide"));
  harness.instances.length = 0;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

it("keeps the production failure notice subscribed until page teardown after initial mount rejection", async () => {
  document.documentElement.innerHTML = readFileSync(
    "src/renderer/index.html",
    "utf8",
  );
  let update!: (value: TerminalRendererConfiguration) => void;
  const removed = vi.fn();
  const subscribe = () => () => {};
  const start = vi.fn();
  vi.stubGlobal("omxterm", {
    terminal: {
      configuration: async () => configuration,
      fontData: async () => {
        throw new Error("font lookup failed");
      },
      onConfigurationUpdate(listener: typeof update) {
        update = listener;
        return removed;
      },
      onWindowChrome: subscribe,
      onTitleBarToggle: subscribe,
      onLocalImageOpen: subscribe,
      onTabTitle: subscribe,
      windowChrome: vi.fn(),
      notifyTabsEmpty: vi.fn(),
      start,
      loadLocalImage: vi.fn(),
    },
  });
  await import("../../src/renderer/index");
  const banner = document.querySelector<HTMLElement>(
    "#terminal-surface-failure",
  )!;
  await vi.waitFor(() => expect(banner.hidden).toBe(false));
  // Let the bootstrap readiness-rejection handler run, not just the earlier
  // Surface callback that publishes the notice.
  for (let turn = 0; turn < 10; turn++) await Promise.resolve();
  expect(banner.textContent).toBe(
    "Falha ao inicializar a superfície do terminal do OMXTerm: font lookup failed",
  );
  expect(removed).not.toHaveBeenCalled();
  update({ ...configuration, language: "en-US" });
  expect(banner.textContent).toBe(
    "Failed to initialize the OMXTerm Terminal Surface: font lookup failed",
  );
  update(configuration);
  expect(banner.textContent).toBe(
    "Falha ao inicializar a superfície do terminal do OMXTerm: font lookup failed",
  );
  expect(start).not.toHaveBeenCalled();
  window.dispatchEvent(new Event("pagehide"));
  expect(removed).toHaveBeenCalledOnce();
  update({ ...configuration, language: "en-US" });
  expect(document.documentElement.lang).toBe("pt-BR");
  expect(banner.textContent).toBe(
    "Falha ao inicializar a superfície do terminal do OMXTerm: font lookup failed",
  );
});
