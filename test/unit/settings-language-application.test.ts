// @vitest-environment jsdom
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { beforeAll, expect, it, vi } from "vitest";
import { createSettingsService } from "../../src/main/settings-service";
import { loadUserConfiguration } from "../../src/main/user-configuration";
import { createUserConfigurationReloader } from "../../src/main/user-configuration-reloader";
import {
  applyActiveUserConfiguration,
  terminalRendererConfiguration,
} from "../../src/main/active-user-configuration";
import { registerTerminalIpcRouter } from "../../src/main/terminal-ipc-controller";
import { startSettings } from "../../src/main/settings-wiring";
import { createSettingsBridge } from "../../src/preload/settings-bridge";
import { terminalApplicationMenuTemplate } from "../../src/main/application-menu";
import { translatorFor } from "../../src/shared/i18n";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import {
  isTerminalRendererConfiguration,
  type TerminalRendererConfiguration,
} from "../../src/shared/user-configuration";
import { mountTerminalWindowPage } from "../../src/renderer/terminal-window-host";
import { createFakeSurface } from "../fixtures/terminal-tabs-harness";
import type { ElectronTerminalAdapter } from "../../src/renderer/electron-terminal-adapter";
import type { TerminalTabCommand } from "../../src/shared/terminal-contract";
import {
  createIpcHarness,
  clipboardOptions,
} from "../fixtures/terminal-ipc-harness";
import { installSettingsDom } from "../fixtures/settings-dialog-dom";

beforeAll(installSettingsDom);
it("saves the selector through validated IPC, reloader, menu and two retained window hosts", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "omxterm-composed-language-"));
  const ipc = createIpcHarness();
  const router = registerTerminalIpcRouter(ipc.ipcMain);
  const loadOptions = {
    environment: { XDG_CONFIG_HOME: root },
    homeDirectory: root,
    getInstalledFontFamilyMetrics: async () => undefined,
  };
  const initial = await loadUserConfiguration(loadOptions);
  let menu: ReturnType<typeof terminalApplicationMenuTemplate> = [];
  let applicationFails = false;
  type Actions = Parameters<typeof terminalApplicationMenuTemplate>[1];
  const actions = Object.fromEntries(
    [
      "newWindow",
      "closeSelectedWindow",
      "newTabInSelectedWindow",
      "closeSelectedTab",
      "selectNextTab",
      "selectPreviousTab",
      "selectTabInSelectedWindow",
      "requestQuit",
      "toggleSelectedFullScreen",
      "toggleSelectedAlwaysOnTop",
      "toggleSelectedDevTools",
      "zoomInSelectedWindow",
      "zoomOutSelectedWindow",
      "resetSelectedWindowZoom",
      "copySelectedTerminal",
      "pasteSelectedTerminal",
      "selectAllSelectedTerminal",
      "findInSelectedTerminal",
      "toggleSelectedSnippets",
      "toggleSelectedTabBar",
      "toggleSelectedTitleBar",
      "reloadUserConfiguration",
      "openLocalImage",
      "showAbout",
      "showSettings",
      "splitSelectedPane",
      "closeSelectedPane",
      "focusSelectedPane",
      "equalizeSelectedPanes",
    ].map((key) => [key, vi.fn()]),
  ) as unknown as Actions;
  const reloader = createUserConfigurationReloader({
    initial: { configuration: initial.configuration, userFileErrors: [] },
    load: () => loadUserConfiguration(loadOptions),
    apply(state, committed) {
      applyActiveUserConfiguration(state, committed, router, [], undefined, {
        platform: "linux",
        nativeTitleInset: 0,
        rebuildMenu: () => {
          menu = terminalApplicationMenuTemplate(
            "OMXTerm",
            actions,
            state.configuration.keybinds,
            translatorFor(state.configuration.language).t,
          );
        },
      });
      if (committed && applicationFails) throw new Error("consumer failure");
    },
  });
  const service = createSettingsService({
    loadOptions,
    reload: reloader.reload,
  });
  const contents: {
    mainFrame: object;
    isDestroyed: () => boolean;
    send: (channel: string, payload?: unknown) => void;
  }[] = [];
  let selected = 0;
  const settings = startSettings({
    ipcMain: ipc.ipcMain,
    service,
    isTrustedSender: (event) =>
      contents.includes(event.sender as (typeof contents)[number]) &&
      event.senderFrame === event.sender.mainFrame,
    selectedContents: () => contents[selected],
  });
  const windows = [];
  try {
    for (let index = 0; index < 2; index += 1) {
      const doc = document.implementation.createHTMLDocument(`window ${index}`);
      Object.defineProperty(doc, "defaultView", { value: window });
      const callbacks = new Map<
        string,
        (event: unknown, payload: unknown) => void
      >();
      let update:
        ((configuration: TerminalRendererConfiguration) => void) | undefined;
      const published: TerminalRendererConfiguration[] = [];
      const webContents = {
        mainFrame: {},
        isDestroyed: () => false,
        send(channel: string, payload?: unknown) {
          if (
            channel === terminalIpc.configurationUpdate &&
            isTerminalRendererConfiguration(payload)
          ) {
            published.push(payload);
            update?.(payload);
          }
          callbacks.get(channel)?.({}, payload);
        },
      };
      contents.push(webContents);
      const configuration = terminalRendererConfiguration(
        reloader.current(),
        0,
      );
      router.registerController({
        ...clipboardOptions(),
        configuration,
        webContents,
        createSession: vi.fn(),
        onSessionStartError: vi.fn(),
        onSessionExit: vi.fn(),
      });
      const bridge = createSettingsBridge({
        invoke: (channel, payload) =>
          Promise.resolve(
            ipc.handlers.get(channel)!(
              { sender: webContents, senderFrame: webContents.mainFrame },
              payload,
            ),
          ),
        on: (channel, callback) => {
          callbacks.set(channel, callback);
        },
        removeListener: (channel) => {
          callbacks.delete(channel);
        },
      });
      const tabs = doc.createElement("nav");
      const container = doc.createElement("main");
      doc.body.append(tabs, container);
      const adapters: ReturnType<typeof createAdapter>[] = [];
      const surfaces: ReturnType<typeof createFakeSurface>[] = [];
      function createAdapter(): ElectronTerminalAdapter {
        const id = `s${index}-${adapters.length}`;
        const adapter = {
          sessionId: () => id,
          start: vi.fn(async () => {}),
          write: vi.fn(),
          resize: vi.fn(),
          close: vi.fn(),
        };
        adapters.push(adapter);
        return adapter;
      }
      let command!: (command: TerminalTabCommand) => void;
      const pageEvents = new EventTarget();
      const host = mountTerminalWindowPage(
        { tabStrip: tabs, tabsContainer: container },
        {
          page: {
            document: doc,
            addEventListener: pageEvents.addEventListener.bind(pageEvents),
            removeEventListener:
              pageEvents.removeEventListener.bind(pageEvents),
          },
          configuration,
          settings: bridge,
          createAdapter,
          subscribeToTabCommands(listener) {
            command = listener;
            return () => {};
          },
          mount: async (pane, mountedAdapter) => {
            vi.spyOn(
              pane.closest<HTMLElement>(".terminal-tab")!,
              "getBoundingClientRect",
            ).mockReturnValue({ width: 1200, height: 800 } as DOMRect);
            await mountedAdapter.start({
              onOutput: () => {},
              onExit: () => {},
            });
            mountedAdapter.resize({ cols: 120, rows: 40 });
            const surface = createFakeSurface();
            surfaces.push(surface);
            return surface;
          },
          subscribeToConfigurationUpdates: (listener) => {
            update = listener;
            return () => {
              update = undefined;
            };
          },
        },
      );
      await host.ready;
      command({ action: "split", direction: "right" });
      await vi.waitFor(() => expect(surfaces).toHaveLength(2));
      selected = index;
      settings.show();
      await vi.waitFor(() =>
        expect(doc.querySelector("textarea")).not.toBeNull(),
      );
      windows.push({ doc, host, bridge, published, adapters, surfaces });
    }
    const first = windows[0]!;
    const second = windows[1]!;
    const secondDraft =
      second.doc.querySelector<HTMLTextAreaElement>("textarea")!;
    secondDraft.value = "other window dirty draft";
    secondDraft.dispatchEvent(new Event("input"));
    const selector = first.doc.querySelector<HTMLSelectElement>("select")!;
    selector.value = "pt-BR";
    selector.dispatchEvent(new Event("change"));
    await service.snapshot();
    await vi.waitFor(() =>
      expect(first.doc.querySelector(".settings-status")!.textContent).toBe(
        "Salvo.",
      ),
    );
    for (const view of windows) {
      expect(view.doc.documentElement.lang).toBe("pt-BR");
      expect(view.doc.querySelector("h2")!.textContent).toBe("Configurações");
      expect(view.published.at(-1)!.language).toBe("pt-BR");
      expect(view.adapters).toHaveLength(2);
      for (const adapter of view.adapters) {
        expect(adapter.start).toHaveBeenCalledOnce();
        expect(adapter.close).not.toHaveBeenCalled();
      }
      for (const surface of view.surfaces) {
        expect(surface.dispose).not.toHaveBeenCalled();
        expect(
          surface.applyConfiguration.mock.calls.at(-1)?.[0].labels
            ?.searchPlaceholder,
        ).toBe("Buscar no histórico");
      }
      expect(
        view.doc
          .querySelector(".terminal-pane-divider")!
          .getAttribute("aria-label"),
      ).toBe("Redimensionar painéis");
    }
    expect(secondDraft.value).toBe("other window dirty draft");
    const appMenu = menu[0]!.submenu;
    expect(
      Array.isArray(appMenu) &&
        appMenu.some((item) => item.label === "Configurações…"),
    ).toBe(true);
    const revision = (await service.snapshot()).revision;
    expect(
      await first.bridge.saveText('{"version":1,"language":"pt-br"}', revision),
    ).toMatchObject({ status: "rejected" });
    expect(reloader.current().configuration.language).toBe("pt-BR");
    applicationFails = true;
    selector.value = "en-US";
    selector.dispatchEvent(new Event("change"));
    await service.snapshot();
    await vi.waitFor(() =>
      expect(
        first.doc.querySelector(".settings-status")!.textContent,
      ).toContain("Saved to config.json, but it could not be applied:"),
    );
    expect(
      JSON.parse(
        await readFile(path.join(root, "omxterm/config.json"), "utf8"),
      ),
    ).toEqual({ version: 1, language: "en-US" });
    expect(secondDraft.value).toBe("other window dirty draft");
  } finally {
    for (const view of windows) view.host.dispose();
    settings.dispose();
    router.dispose();
    await rm(root, { recursive: true, force: true });
  }
});
