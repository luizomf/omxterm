import { vi, type Mock } from "vitest";
import { mountTerminalWindowPage } from "../../src/renderer/terminal-window-host";
import type { TerminalTabCommand } from "../../src/shared/terminal-contract";
import type { TerminalSnippetsResponse } from "../../src/shared/terminal-snippets";
import type { LocalImageData } from "../../src/shared/local-image";
import type {
  TerminalSessionAdapter,
  TerminalSessionHandlers,
} from "../../src/terminal-surface/terminal-session-adapter";
import { createSemanticInputDelivery } from "../../src/terminal-surface/semantic-input-delivery";
import type { TerminalSurfaceOptions } from "../../src/terminal-surface/terminal-surface";
import { DEFAULT_USER_CONFIGURATION } from "../../src/main/user-configuration";
import { terminalRendererConfiguration } from "../../src/main/active-user-configuration";
import type { TerminalRendererConfiguration } from "../../src/shared/user-configuration";
import type { SupportedLanguage } from "../../src/shared/i18n";
import { base, saved, installSettingsDom } from "./settings-dialog-dom";

const cleanups: Array<() => void> = [];
export function cleanupSnippetsWindows() {
  for (const cleanup of cleanups.splice(0)) cleanup();
  vi.restoreAllMocks();
  document.body.replaceChildren();
}

export async function snippetsWindow() {
  installSettingsDom();
  const content = document.createElement("div"),
    root = document.createElement("aside"),
    tabsContainer = document.createElement("main"),
    tabStrip = document.createElement("nav");
  content.append(tabsContainer, root);
  document.body.append(tabStrip, content);
  vi.spyOn(content, "getBoundingClientRect").mockReturnValue({
    width: 1000,
  } as DOMRect);
  vi.spyOn(document, "hasFocus").mockReturnValue(true);
  let toggle!: () => void, about!: () => void, image!: () => void;
  let clipboardAction!: (action: "copy" | "paste" | "select-all") => void;
  let tabCommand!: (command: TerminalTabCommand) => void;
  let tabBar!: () => void;
  let settingsOpen!: () => void;
  let update!: (configuration: TerminalRendererConfiguration) => void;
  const configuration = terminalRendererConfiguration(
    { configuration: DEFAULT_USER_CONFIGURATION, userFileErrors: [] },
    0,
  );
  const settingsChange = vi.fn(async () =>
    saved({
      ...base,
      values: { ...base.values, "font.family": "pastedquery" },
    }),
  );
  const clipboard = {
    readText: vi.fn(async () => "pasted\nquery"),
    writeText: vi.fn(async () => {}),
    confirmPaste: vi.fn(async () => false),
    requestContextMenu: vi.fn(),
  };
  const surfaces: ReturnType<typeof surface>[] = [];
  function surface(container: HTMLElement, adapter: TerminalSessionAdapter) {
    const input = document.createElement("textarea");
    container.append(input);
    const delivery = createSemanticInputDelivery({
      isLive: () => true,
      isBracketedPasteEnabled: () => false,
      confirmPaste: clipboard.confirmPaste,
      write: adapter.write,
    });
    return {
      geometry: () => ({
        cellWidth: 10,
        cellHeight: 20,
        insetWidth: 0,
        insetHeight: 0,
      }),
      dispose: vi.fn(() => delivery.dispose()),
      focus: vi.fn(() => input.focus()),
      applyTheme: vi.fn(),
      applyConfiguration: vi.fn(),
      inject: vi.fn(
        async (text: string, options?: { readonly submit?: boolean }) => {
          await delivery.deliver(text, options);
        },
      ),
      zoom: vi.fn(),
      copy: vi.fn(async () => {}),
      paste: vi.fn(async () => {}),
      selectAll: vi.fn(),
      find: vi.fn(),
    };
  }
  const sessionHandlers: TerminalSessionHandlers[] = [];
  const surfaceOptions: TerminalSurfaceOptions[] = [];
  const failure = vi.fn();
  const transportWrites: Mock<(data: string) => void>[] = [];
  let nextSession = 0;
  const adapters = vi.fn(() => {
    const sessionId = `s${++nextSession}`;
    const write = vi.fn<(data: string) => void>();
    transportWrites.push(write);
    return {
      sessionId: () => sessionId,
      start: async (handlers: TerminalSessionHandlers) => {
        sessionHandlers.push(handlers);
      },
      write,
      resize: vi.fn(),
      close: vi.fn(),
    };
  });
  const load = vi
    .fn<() => Promise<TerminalSnippetsResponse>>()
    .mockResolvedValue({
      snippets: [{ name: "literal", body: " a  b\n$VALUE\n", execute: true }],
    });
  const loadImage = vi
    .fn<() => Promise<LocalImageData | null>>()
    .mockResolvedValue(null);
  const host = mountTerminalWindowPage(
    { tabsContainer, tabStrip },
    {
      page: window,
      configuration,
      subscribeToConfigurationUpdates(listener) {
        update = listener;
        return vi.fn();
      },
      settings: {
        snapshot: async () => base,
        change: settingsChange,
        saveText: vi.fn(),
        changeKeybind: vi.fn(),
        captureShortcut: vi.fn(() => () => {}),
        onOpen(listener) {
          settingsOpen = listener;
          return vi.fn();
        },
      },
      createAdapter: adapters,
      mount: async (container, adapter, options) => {
        vi.spyOn(
          container.closest<HTMLElement>(".terminal-tab")!,
          "getBoundingClientRect",
        ).mockReturnValue({ width: 1200, height: 800 } as DOMRect);
        const value = surface(container, adapter);
        surfaces.push(value);
        surfaceOptions.push(options);
        await adapter.start({ onOutput() {}, onExit: () => value.dispose() });
        adapter.resize({ cols: 120, rows: 40 });
        return value;
      },
      onSurfaceFailure: failure,
      clipboard,
      snippets: {
        element: root,
        load,
        subscribeToToggle(listener) {
          toggle = listener;
          return vi.fn();
        },
      },
      subscribeToClipboardActions(listener) {
        clipboardAction = listener;
        return vi.fn();
      },
      subscribeToTabCommands(listener) {
        tabCommand = listener;
        return vi.fn();
      },
      subscribeToTabBarToggle(listener) {
        tabBar = listener;
        return vi.fn();
      },
      about: {
        info: async () => ({ name: "OMXTerm", version: "1", copyright: "MIT" }),
        openLink: async () => {},
        onOpen(listener) {
          about = listener;
          return vi.fn();
        },
      },
      loadLocalImage: loadImage,
      subscribeToLocalImageOpen(listener) {
        image = listener;
        return vi.fn();
      },
    },
  );
  cleanups.push(host.dispose);
  await host.ready;
  return {
    root,
    host,
    toggle,
    about,
    image,
    load,
    loadImage,
    clipboard,
    clipboardAction,
    tabCommand,
    tabBar,
    surfaces,
    adapters,
    sessionHandlers,
    transportWrites,
    surfaceOptions,
    failure,
    settingsOpen,
    settingsChange,
    setLanguage: (language: SupportedLanguage) =>
      update({ ...configuration, language }),
  };
}
