// @vitest-environment jsdom
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { createAboutBridge } from "../../src/preload/about-bridge";
import { createSettingsBridge } from "../../src/preload/settings-bridge";
import { aboutIpc } from "../../src/shared/about";
import { settingsIpc } from "../../src/shared/settings";
import { mountTerminalWindowPage } from "../../src/renderer/terminal-window-host";
import type { WindowChromeBridge } from "../../src/renderer/window-chrome";
import type {
  TerminalSurface,
  TerminalSurfaceOptions,
} from "../../src/terminal-surface/terminal-surface";
import {
  base,
  deferred,
  installSettingsDom,
} from "../fixtures/settings-dialog-dom";

beforeAll(installSettingsDom);
afterEach(() => {
  vi.restoreAllMocks();
  document.body.replaceChildren();
});

it.each([
  "normal-both",
  "early-both",
  "early-settings",
  "early-about",
] as const)(
  "%s uses first-open exclusion and publishes modal activity from the initial subscription",
  async (scenario) => {
    vi.spyOn(document, "hasFocus").mockReturnValue(true);
    const listeners = new Map<
      string,
      (event: unknown, payload: unknown) => void
    >();
    const ipc = {
      on: (
        channel: string,
        listener: (event: unknown, payload: unknown) => void,
      ) => {
        listeners.set(channel, listener);
      },
      removeListener: (channel: string) => {
        listeners.delete(channel);
      },
      invoke: async (channel: string): Promise<unknown> =>
        channel === aboutIpc.info
          ? { name: "OMXTerm", version: "1", copyright: "MIT" }
          : base,
    };
    const about = createAboutBridge(ipc);
    const settings = createSettingsBridge(ipc);
    const emit = (channel: string) => listeners.get(channel)!({}, undefined);
    if (scenario === "early-both" || scenario === "early-about")
      emit(aboutIpc.open);
    if (scenario === "early-both" || scenario === "early-settings")
      emit(settingsIpc.open);

    const commands: Parameters<WindowChromeBridge["windowChrome"]>[0][] = [];
    let toggleTitle!: () => void;
    const chrome: WindowChromeBridge = {
      windowChrome: (command) => {
        commands.push(command);
      },
      onWindowChrome(listener) {
        listener({
          style: "custom",
          title: "Synthetic",
          titleBarVisible: false,
          fullScreen: false,
          maximized: false,
          handleVisible: true,
        });
        return () => {};
      },
      onTitleBarToggle(listener) {
        toggleTitle = listener;
        return () => {};
      },
    };
    const mount = deferred<TerminalSurface>();
    let surfaceOptions!: TerminalSurfaceOptions;
    const hoverChanged = vi.fn();
    let removeHover: (() => void) | undefined;
    const focus = vi.fn();
    const surface: TerminalSurface = {
      focus,
      geometry: () => undefined,
      dispose: vi.fn(() => removeHover?.()),
      applyConfiguration: vi.fn(),
      applyTheme: vi.fn(),
      zoom: vi.fn(),
      inject: vi.fn(async () => {}),
      copy: vi.fn(async () => {}),
      paste: vi.fn(async () => {}),
      selectAll: vi.fn(),
      find: vi.fn(),
      exportText: vi.fn(() => ""),
    };
    const strip = document.createElement("nav");
    const content = document.createElement("div");
    const tabs = document.createElement("main");
    const panel = document.createElement("aside");
    content.append(tabs, panel);
    vi.spyOn(content, "getBoundingClientRect").mockReturnValue({
      width: 1000,
    } as DOMRect);
    document.body.append(strip, content);
    const loadSnippets = vi.fn(async () => ({ snippets: [] }));
    let togglePanel!: () => void;
    const host = mountTerminalWindowPage(
      { tabStrip: strip, tabsContainer: tabs },
      {
        page: window,
        about,
        settings,
        chrome,
        createAdapter: () => ({
          sessionId: () => "s1",
          start: async () => {},
          write() {},
          resize() {},
          close() {},
        }),
        mount: (_container, _adapter, options) => {
          surfaceOptions = options;
          removeHover = options.linkHoverAvailability!.subscribe(hoverChanged);
          return mount.promise;
        },
        loadLocalImage: async () => null,
        snippets: {
          element: panel,
          load: loadSnippets,
          subscribeToToggle(listener) {
            togglePanel = listener;
            return () => {};
          },
        },
      },
    );
    const assertModal = () => {
      const open = [
        ...document.querySelectorAll<HTMLDialogElement>("dialog[open]"),
      ];
      expect(open).toHaveLength(1);
      expect(open[0]!.className).toBe(
        scenario === "early-settings" ? "settings-dialog" : "about-dialog",
      );
      expect(
        document.querySelector<HTMLElement>(".window-drag-handle")!.hidden,
      ).toBe(true);
      expect(document.body.classList.contains("window-preview-active")).toBe(
        true,
      );
      expect(commands).toContain("preview-active");
      expect(surfaceOptions.linkHoverAvailability!.isEnabled()).toBe(false);
      toggleTitle();
      expect(commands).not.toContain("toggle-title-bar");
    };
    try {
      // Buffered onOpen callbacks replay synchronously during host construction,
      // before mount completion or aggregate assignment. Do not test only ready.
      if (scenario !== "normal-both") {
        assertModal();
        expect(hoverChanged).toHaveBeenCalled();
      }
      mount.resolve(surface);
      await host.ready;
      if (scenario === "normal-both") {
        focus.mockClear();
        emit(aboutIpc.open);
        emit(settingsIpc.open);
      }
      assertModal();
      expect(surface.focus).not.toHaveBeenCalled();
      togglePanel();
      await Promise.resolve();
      expect(loadSnippets).not.toHaveBeenCalled();
      // Closing the current owner publishes inactivity; a fresh competing intent
      // is then delivered normally, not discarded/queued by a startup shortcut.
      document
        .querySelector<HTMLButtonElement>(
          scenario === "early-settings" ? ".settings-close" : ".about-close",
        )!
        .click();
      expect(document.querySelectorAll("dialog[open]")).toHaveLength(0);
      expect(commands.at(-1)).toBe("preview-inactive");
      expect(surfaceOptions.linkHoverAvailability!.isEnabled()).toBe(true);
      togglePanel();
      await Promise.resolve();
      expect(loadSnippets).toHaveBeenCalledOnce();
      togglePanel();
      toggleTitle();
      expect(commands.at(-1)).toBe("toggle-title-bar");
      emit(scenario === "early-settings" ? aboutIpc.open : settingsIpc.open);
      expect(document.querySelectorAll("dialog[open]")).toHaveLength(1);
      expect(commands.at(-1)).toBe("preview-active");
      const count = commands.length;
      toggleTitle();
      expect(commands).toHaveLength(count);
    } finally {
      mount.resolve(surface);
      await host.ready;
      host.dispose();
    }
  },
);
