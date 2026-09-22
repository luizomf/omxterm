import { describe, expect, it, vi } from "vitest";
import {
  registerTerminalIpcRouter,
  type IpcEvent,
  type IpcMainPort,
  type TrustedWebContents,
} from "../../src/main/terminal-ipc-controller";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import { DEFAULT_TERMINAL_THEME } from "../../src/shared/terminal-theme";

function createIpcHarness() {
  const handlers = new Map<
    string,
    (event: IpcEvent, payload?: unknown) => unknown
  >();
  const listeners = new Map<
    string,
    (event: IpcEvent, payload?: unknown) => void
  >();
  const ipcMain: IpcMainPort = {
    handle: (channel, handler) => void handlers.set(channel, handler),
    removeHandler: (channel) => void handlers.delete(channel),
    on: (channel, listener) => void listeners.set(channel, listener),
    removeListener: (channel, listener) => {
      if (listeners.get(channel) === listener) listeners.delete(channel);
    },
  };
  return { ipcMain, handlers };
}

function controllerOptions() {
  return {
    configuration: {
      fontSize: 16,
      fontLineHeight: 1,
      fontLigatures: true,
      terminalPadding: { top: 0, right: 8, bottom: 8, left: 8 },
      scrollbackLines: 10_000,
      optionKeyMode: "none" as const,
      nativeTitleInset: 30 as const,
      terminalTheme: DEFAULT_TERMINAL_THEME,
      userFileErrors: [],
    },
    createSession: vi.fn(() => ({
      write: vi.fn(),
      resize: vi.fn(),
      hasForegroundChildProcess: () => false,
      close: vi.fn(),
    })),
    onSessionStartError: vi.fn(),
    onSessionExit: vi.fn(),
    onSessionStarted: vi.fn(),
    onSessionSelected: vi.fn(),
    writeClipboardText: vi.fn(),
    readClipboardText: vi.fn(() => ""),
    confirmPaste: vi.fn(async () => false),
    showClipboardContextMenu: vi.fn(),
    onTitleRequest: vi.fn(),
    onBell: vi.fn(),
    onUserInteraction: vi.fn(),
    openExternalLink: vi.fn(async () => {}),
    onExternalLinkOpenError: vi.fn(),
    loadSnippets: vi.fn(async () => ({ snippets: [] })),
    loadLocalImage: vi.fn(async () => null),
  };
}

describe("Terminal Window fullscreen configuration", () => {
  it("derives independent insets across initialization, reload, and cleanup", () => {
    const ipc = createIpcHarness();
    const router = registerTerminalIpcRouter(ipc.ipcMain);
    const createOwner = (
      initialFullScreen: boolean,
      nativeTitleInset: 0 | 30 = 30,
    ) => {
      const mainFrame = {};
      const webContents: TrustedWebContents = {
        mainFrame,
        isDestroyed: () => false,
        send: vi.fn(),
      };
      const options = controllerOptions();
      const controller = router.registerController({
        ...options,
        configuration: { ...options.configuration, nativeTitleInset },
        initialFullScreen,
        webContents,
      });
      return { controller, mainFrame, options, webContents };
    };
    const first = createOwner(true);
    const second = createOwner(false);
    const otherPlatform = createOwner(false, 0);
    const requestConfiguration = (owner: typeof first) =>
      ipc.handlers.get(terminalIpc.configuration)!({
        sender: owner.webContents,
        senderFrame: owner.mainFrame,
      }) as { nativeTitleInset: number; fontSize: number };

    expect(requestConfiguration(first).nativeTitleInset).toBe(0);
    expect(requestConfiguration(second).nativeTitleInset).toBe(30);
    for (const fullScreen of [true, false, true]) {
      otherPlatform.controller.applyFullScreen(fullScreen);
      expect(requestConfiguration(otherPlatform).nativeTitleInset).toBe(0);
    }
    first.controller.applyFullScreen(true);
    expect(first.webContents.send).not.toHaveBeenCalled();

    first.controller.applyFullScreen(false);
    expect(first.webContents.send).toHaveBeenLastCalledWith(
      terminalIpc.configurationUpdate,
      expect.objectContaining({ nativeTitleInset: 30 }),
    );
    expect(second.webContents.send).not.toHaveBeenCalled();

    first.controller.applyFullScreen(true);
    first.controller.applyConfiguration({
      ...first.options.configuration,
      fontSize: 18,
    });
    expect(first.webContents.send).toHaveBeenLastCalledWith(
      terminalIpc.configurationUpdate,
      expect.objectContaining({ fontSize: 18, nativeTitleInset: 0 }),
    );

    expect(requestConfiguration(first)).toMatchObject({
      fontSize: 18,
      nativeTitleInset: 0,
      terminalPadding: first.options.configuration.terminalPadding,
    });
    expect(requestConfiguration(second).nativeTitleInset).toBe(30);
    expect(first.options.createSession).not.toHaveBeenCalled();

    const sentBeforeDisposal = vi.mocked(first.webContents.send).mock.calls
      .length;
    first.controller.dispose();
    first.controller.applyFullScreen(false);
    expect(first.webContents.send).toHaveBeenCalledTimes(sentBeforeDisposal);
    router.dispose();
  });
});
