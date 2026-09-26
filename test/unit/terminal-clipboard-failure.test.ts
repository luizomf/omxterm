import { expect, it, vi } from "vitest";
import {
  registerTerminalIpcRouter,
  type IpcEvent,
  type IpcMainPort,
  type TrustedWebContents,
} from "../../src/main/terminal-ipc-controller";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import { DEFAULT_TERMINAL_THEME } from "../../src/shared/terminal-theme";

it("reports host clipboard failures without exposing payload", async () => {
  const handlers = new Map<
    string,
    (event: IpcEvent, payload?: unknown) => unknown
  >();
  const ipcMain: IpcMainPort = {
    handle: (channel, handler) => handlers.set(channel, handler),
    removeHandler: (channel) => void handlers.delete(channel),
    on: vi.fn(),
    removeListener: vi.fn(),
  };
  const mainFrame = {};
  const webContents: TrustedWebContents = {
    mainFrame,
    isDestroyed: () => false,
    send: vi.fn(),
  };
  const payload = "private clipboard payload";
  const onClipboardError = vi.fn();
  const operationalWrite = vi.fn(() => true);
  const router = registerTerminalIpcRouter(ipcMain, {
    write: operationalWrite,
  });
  router.registerController({
    configuration: {
      fontSize: 16,
      fontLineHeight: 1,
      fontLigatures: true,
      terminalPadding: { top: 0, right: 8, bottom: 8, left: 8 },
      scrollbackLines: 10_000,
      optionKeyMode: "none",
      nativeTitleInset: 0,
      showTabBar: true,
      transparency: 0,
      terminalTheme: DEFAULT_TERMINAL_THEME,
      userFileErrors: [],
    },
    webContents,
    createSession: vi.fn(),
    onSessionStartError: vi.fn(),
    onSessionExit: vi.fn(),
    onSessionStarted: vi.fn(),
    onSessionSelected: vi.fn(),
    onTitleRequest: vi.fn(),
    onBell: vi.fn(),
    onUserInteraction: vi.fn(),
    openExternalLink: vi.fn(async () => undefined),
    onExternalLinkOpenError: vi.fn(),
    writeClipboardText: () => {
      throw new Error(payload);
    },
    readClipboardText: () => {
      throw new Error(payload);
    },
    confirmPaste: async () => {
      throw new Error(payload);
    },
    onClipboardError,
    showClipboardContextMenu: vi.fn(),
    loadSnippets: vi.fn(async () => ({ snippets: [] })),
    loadLocalImage: vi.fn(async () => null),
  });
  const trusted = { sender: webContents, senderFrame: mainFrame };

  expect(
    handlers.get(terminalIpc.clipboardWrite)!(trusted, payload),
  ).toBeUndefined();
  expect(handlers.get(terminalIpc.clipboardRead)!(trusted)).toBe("");
  await expect(
    handlers.get(terminalIpc.clipboardConfirmPaste)!(trusted, "first\nsecond"),
  ).resolves.toBe(false);

  expect(onClipboardError).toHaveBeenCalledTimes(3);
  expect(onClipboardError.mock.calls).toEqual([[], [], []]);
  expect(JSON.stringify(operationalWrite.mock.calls)).not.toContain(payload);
  expect(webContents.send).not.toHaveBeenCalled();
  router.dispose();
});
