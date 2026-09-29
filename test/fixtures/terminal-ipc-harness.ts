import { vi } from "vitest";
import type { IpcMainPort } from "../../src/main/terminal-ipc-controller";
import { DEFAULT_TERMINAL_THEME } from "../../src/shared/terminal-theme";

export function createIpcHarness() {
  const handlers = new Map<string, Parameters<IpcMainPort["handle"]>[1]>();
  const listeners = new Map<string, Parameters<IpcMainPort["on"]>[1]>();
  const ipcMain: IpcMainPort = {
    handle: (channel, handler) => {
      handlers.set(channel, handler);
    },
    removeHandler: (channel) => {
      handlers.delete(channel);
    },
    on: (channel, listener) => {
      listeners.set(channel, listener);
    },
    removeListener: (channel, listener) => {
      if (listeners.get(channel) === listener) listeners.delete(channel);
    },
  };
  return { ipcMain, handlers, listeners };
}

export function clipboardOptions() {
  return {
    configuration: {
      fontSize: 16,
      fontLineHeight: 1,
      fontLigatures: true,
      terminalPadding: { top: 0, right: 8, bottom: 8, left: 8 },
      scrollbackLines: 10_000,
      optionKeyMode: "none" as const,
      nativeTitleInset: 0 as const,
      transparency: 0,
      showTabBar: true,
      terminalTheme: DEFAULT_TERMINAL_THEME,
      userFileErrors: [],
    },
    writeClipboardText: vi.fn(),
    readClipboardText: vi.fn(() => "clipboard text"),
    confirmPaste: vi.fn(async () => true),
    onClipboardError: vi.fn(),
    showClipboardContextMenu: vi.fn(),
    onTitleRequest: vi.fn(),
    onBell: vi.fn(),
    onSessionStarted: vi.fn(),
    onSessionSelected: vi.fn(),
    onUserInteraction: vi.fn(),
    openExternalLink: vi.fn(async () => {}),
    onExternalLinkOpenError: vi.fn(),
    loadSnippets: vi.fn(async () => ({ snippets: [] })),
    loadLocalImage: vi.fn(async () => null),
  };
}
