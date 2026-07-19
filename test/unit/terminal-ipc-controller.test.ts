import { describe, expect, it, vi } from "vitest";
import {
  registerTerminalIpcRouter,
  type IpcEvent,
  type IpcMainPort,
  type TrustedWebContents,
} from "../../src/main/terminal-ipc-controller";
import type { LocalTerminalSession } from "../../src/main/local-terminal-session";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import { DEFAULT_TERMINAL_THEME } from "../../src/shared/terminal-theme";

function createIpcHarness() {
  const handlers = new Map<
    string,
    (event: IpcEvent, payload?: unknown) => void
  >();
  const listeners = new Map<
    string,
    (event: IpcEvent, payload?: unknown) => void
  >();
  const ipcMain: IpcMainPort = {
    handle: (channel, handler) => handlers.set(channel, handler),
    removeHandler: (channel) => void handlers.delete(channel),
    on: (channel, listener) => void listeners.set(channel, listener),
    removeListener: (channel, listener) => {
      if (listeners.get(channel) === listener) listeners.delete(channel);
    },
  };
  return { ipcMain, handlers, listeners };
}

function clipboardOptions() {
  return {
    configuration: {
      fontSize: 16,
      fontLineHeight: 1,
      terminalPadding: { top: 0, right: 8, bottom: 8, left: 8 },
      scrollbackLines: 10_000,
      optionKeyMode: "none" as const,
      terminalTheme: DEFAULT_TERMINAL_THEME,
      userFileErrors: [],
    },
    writeClipboardText: vi.fn(),
    readClipboardText: vi.fn(() => "clipboard text"),
    confirmPaste: vi.fn(async () => true),
    showClipboardContextMenu: vi.fn(),
    onTitleRequest: vi.fn(),
    onBell: vi.fn(),
    onUserInteraction: vi.fn(),
    openExternalLink: vi.fn(async () => {}),
    onExternalLinkOpenError: vi.fn(),
  };
}

describe("terminal IPC controller", () => {
  it("routes two Terminal Windows to independent Live Terminal Sessions", () => {
    const ipc = createIpcHarness();
    const router = registerTerminalIpcRouter(ipc.ipcMain);
    const firstFrame = {};
    const secondFrame = {};
    const firstWebContents: TrustedWebContents = {
      mainFrame: firstFrame,
      isDestroyed: () => false,
      send: vi.fn(),
    };
    const secondWebContents: TrustedWebContents = {
      mainFrame: secondFrame,
      isDestroyed: () => false,
      send: vi.fn(),
    };
    const firstSession: LocalTerminalSession = {
      write: vi.fn(),
      resize: vi.fn(),
      close: vi.fn(),
    };
    const secondSession: LocalTerminalSession = {
      write: vi.fn(),
      resize: vi.fn(),
      close: vi.fn(),
    };

    router.registerController({
      ...clipboardOptions(),
      webContents: firstWebContents,
      createSession: vi.fn(() => firstSession),
      onSessionStartError: vi.fn(),
      onSessionExit: vi.fn(),
    });
    router.registerController({
      ...clipboardOptions(),
      webContents: secondWebContents,
      createSession: vi.fn(() => secondSession),
      onSessionStartError: vi.fn(),
      onSessionExit: vi.fn(),
    });

    ipc.handlers.get(terminalIpc.start)!({
      sender: firstWebContents,
      senderFrame: firstFrame,
    });
    ipc.handlers.get(terminalIpc.start)!({
      sender: secondWebContents,
      senderFrame: secondFrame,
    });
    ipc.listeners.get(terminalIpc.input)?.(
      { sender: secondWebContents, senderFrame: secondFrame },
      "second window input",
    );
    ipc.listeners.get(terminalIpc.close)?.({
      sender: firstWebContents,
      senderFrame: firstFrame,
    });

    expect(firstSession.write).not.toHaveBeenCalled();
    expect(secondSession.write).toHaveBeenCalledWith("second window input");
    expect(firstSession.close).toHaveBeenCalledOnce();
    expect(secondSession.close).not.toHaveBeenCalled();
    expect(ipc.handlers.size).toBe(5);
    expect(ipc.listeners.size).toBe(7);
  });

  it("returns the complete immutable startup spacing configuration to its bound renderer", () => {
    const ipc = createIpcHarness();
    const mainFrame = {};
    const webContents: TrustedWebContents = {
      mainFrame,
      isDestroyed: () => false,
      send: vi.fn(),
    };
    const configuration = Object.freeze({
      fontSize: 18,
      fontLineHeight: 1.15,
      terminalPadding: Object.freeze({
        top: 4,
        right: 12,
        bottom: 6,
        left: 14,
      }),
      scrollbackLines: 500,
      optionKeyMode: "right" as const,
      terminalTheme: DEFAULT_TERMINAL_THEME,
      userFileErrors: [],
    });
    const router = registerTerminalIpcRouter(ipc.ipcMain);
    router.registerController({
      ...clipboardOptions(),
      configuration,
      webContents,
      createSession: vi.fn(() => ({
        write: vi.fn(),
        resize: vi.fn(),
        close: vi.fn(),
      })),
      onSessionStartError: vi.fn(),
      onSessionExit: vi.fn(),
    });

    expect(
      ipc.handlers.get(terminalIpc.configuration)!({
        sender: webContents,
        senderFrame: mainFrame,
      }),
    ).toBe(configuration);
  });

  it("reports a normalized shell startup failure without disclosing the cause", () => {
    const ipc = createIpcHarness();
    const mainFrame = {};
    const webContents: TrustedWebContents = {
      mainFrame,
      isDestroyed: () => false,
      send: vi.fn(),
    };
    const failure = new Error("spawn failed: TERMINAL_PAYLOAD_CANARY");
    const onSessionStartError = vi.fn();
    const router = registerTerminalIpcRouter(ipc.ipcMain);
    router.registerController({
      ...clipboardOptions(),
      webContents,
      createSession() {
        throw failure;
      },
      onSessionStartError,
      onSessionExit: vi.fn(),
    });

    expect(() =>
      ipc.handlers.get(terminalIpc.start)!({
        sender: webContents,
        senderFrame: mainFrame,
      }),
    ).toThrow("The Default Shell could not be started");
    expect(onSessionStartError).toHaveBeenCalledWith();
    expect(JSON.stringify(onSessionStartError.mock.calls)).not.toContain(
      "TERMINAL_PAYLOAD_CANARY",
    );
  });

  it("accepts only the bound web contents and its main frame", () => {
    const ipc = createIpcHarness();
    const mainFrame = {};
    const webContents: TrustedWebContents = {
      mainFrame,
      isDestroyed: () => false,
      send: vi.fn(),
    };
    const session: LocalTerminalSession = {
      write: vi.fn(),
      resize: vi.fn(),
      close: vi.fn(),
    };
    const createSession = vi.fn(() => session);
    const router = registerTerminalIpcRouter(ipc.ipcMain);
    router.registerController({
      ...clipboardOptions(),
      webContents,
      createSession,
      onSessionStartError: vi.fn(),
      onSessionExit: vi.fn(),
    });

    const start = ipc.handlers.get(terminalIpc.start)!;
    expect(() =>
      start({
        sender: { ...webContents, mainFrame: {} },
        senderFrame: mainFrame,
      }),
    ).toThrow("untrusted sender");
    expect(() => start({ sender: webContents, senderFrame: {} })).toThrow(
      "untrusted sender",
    );
    expect(() =>
      start(
        { sender: webContents, senderFrame: mainFrame },
        { unexpected: true },
      ),
    ).toThrow("Invalid terminal start payload");
    start({ sender: webContents, senderFrame: mainFrame });

    const trustedEvent = { sender: webContents, senderFrame: mainFrame };
    ipc.listeners.get(terminalIpc.input)?.(trustedEvent, "hello");
    ipc.listeners.get(terminalIpc.input)?.(trustedEvent, "x".repeat(65_537));
    ipc.listeners.get(terminalIpc.resize)?.(trustedEvent, {
      cols: 100,
      rows: 30,
    });
    ipc.listeners.get(terminalIpc.resize)?.(trustedEvent, {
      cols: -1,
      rows: 30,
    });

    expect(createSession).toHaveBeenCalledOnce();
    expect(session.write).toHaveBeenCalledOnce();
    expect(session.write).toHaveBeenCalledWith("hello");
    expect(session.resize).toHaveBeenCalledOnce();
    expect(session.resize).toHaveBeenCalledWith({ cols: 100, rows: 30 });
  });

  it("routes title, BEL, and terminal interaction only to the owning window", () => {
    const ipc = createIpcHarness();
    const frame = {};
    const webContents: TrustedWebContents = {
      mainFrame: frame,
      isDestroyed: () => false,
      send: vi.fn(),
    };
    const otherFrame = {};
    const otherWebContents: TrustedWebContents = {
      mainFrame: otherFrame,
      isDestroyed: () => false,
      send: vi.fn(),
    };
    const title = vi.fn();
    const bell = vi.fn();
    const interaction = vi.fn();
    const session: LocalTerminalSession = {
      write: vi.fn(),
      resize: vi.fn(),
      close: vi.fn(),
    };
    const router = registerTerminalIpcRouter(ipc.ipcMain);
    router.registerController({
      ...clipboardOptions(),
      webContents,
      createSession: () => session,
      onSessionStartError: vi.fn(),
      onSessionExit: vi.fn(),
      onTitleRequest: title,
      onBell: bell,
      onUserInteraction: interaction,
    });
    const trusted = { sender: webContents, senderFrame: frame };
    const forged = { sender: otherWebContents, senderFrame: otherFrame };

    ipc.listeners.get(terminalIpc.title)?.(trusted, "owned title");
    ipc.listeners.get(terminalIpc.title)?.(trusted, "x".repeat(65_537));
    ipc.listeners.get(terminalIpc.title)?.(trusted, { canary: "CANARY" });
    ipc.listeners.get(terminalIpc.title)?.(forged, "forged title");
    ipc.listeners.get(terminalIpc.bell)?.(trusted);
    ipc.listeners.get(terminalIpc.bell)?.(trusted, "malformed");
    ipc.listeners.get(terminalIpc.input)?.(trusted, "key");

    expect(title.mock.calls).toEqual([["owned title"], ["x".repeat(65_537)]]);
    expect(JSON.stringify(title.mock.calls)).not.toContain("CANARY");
    expect(bell).toHaveBeenCalledOnce();
    expect(interaction).toHaveBeenCalledOnce();
    expect(session.write).not.toHaveBeenCalled();
  });

  it("validates clipboard senders and payloads without clipboard or PTY side effects", async () => {
    const ipc = createIpcHarness();
    const mainFrame = {};
    const webContents: TrustedWebContents = {
      mainFrame,
      isDestroyed: () => false,
      send: vi.fn(),
    };
    const session: LocalTerminalSession = {
      write: vi.fn(),
      resize: vi.fn(),
      close: vi.fn(),
    };
    const clipboard = clipboardOptions();
    const router = registerTerminalIpcRouter(ipc.ipcMain);
    router.registerController({
      ...clipboard,
      webContents,
      createSession: () => session,
      onSessionStartError: vi.fn(),
      onSessionExit: vi.fn(),
    });
    const trusted = { sender: webContents, senderFrame: mainFrame };
    const forged = { sender: webContents, senderFrame: {} };

    expect(() =>
      ipc.handlers.get(terminalIpc.clipboardWrite)!(forged, "stolen"),
    ).toThrow("untrusted sender");
    expect(() =>
      ipc.handlers.get(terminalIpc.clipboardWrite)!(trusted, ""),
    ).toThrow(TypeError);
    expect(() =>
      ipc.handlers.get(terminalIpc.clipboardRead)!(trusted, { forged: true }),
    ).toThrow(TypeError);
    await expect(
      ipc.handlers.get(terminalIpc.clipboardConfirmPaste)!(trusted, null),
    ).rejects.toThrow(TypeError);
    await expect(
      ipc.handlers.get(terminalIpc.clipboardConfirmPaste)!(
        trusted,
        "safe single line",
      ),
    ).rejects.toThrow(TypeError);

    expect(clipboard.writeClipboardText).not.toHaveBeenCalled();
    expect(clipboard.readClipboardText).not.toHaveBeenCalled();
    expect(clipboard.confirmPaste).not.toHaveBeenCalled();
    expect(session.write).not.toHaveBeenCalled();
  });

  it("opens only exact stable lowercase HTTP(S) requests from the owning main frame with one-call-per-request cardinality", () => {
    const ipc = createIpcHarness();
    const mainFrame = {};
    const webContents: TrustedWebContents = {
      mainFrame,
      isDestroyed: () => false,
      send: vi.fn(),
    };
    const options = clipboardOptions();
    const router = registerTerminalIpcRouter(ipc.ipcMain);
    router.registerController({
      ...options,
      webContents,
      createSession: vi.fn(),
      onSessionStartError: vi.fn(),
      onSessionExit: vi.fn(),
    });
    const request = ipc.listeners.get(terminalIpc.externalLink)!;
    const trusted = { sender: webContents, senderFrame: mainFrame };
    const forged = { sender: webContents, senderFrame: {} };

    request(trusted, "https://example.test/a?x=%2F#fragment");
    request(trusted, "https://example.test/a?x=%2F#fragment");
    request(trusted, "http://example.test");
    request(
      trusted,
      "https://example.test:8443/path?name=Luiz%20Otavio#section",
    );
    request(trusted, "https://example.test:443/path");
    request(trusted, "https://münchen.example/path");
    for (const rejected of [
      "HTTP://example.test",
      "HTTPS://example.test",
      "%68ttp://example.test",
      "\u0000https://example.test",
      "https://example.test/\u0001path",
      "https://example.test/trailing ",
      "\u0085https://example.test",
      "https://example.test/\u009fpath",
      "https://example.test/zero\u200bwidth",
      "https://example.test\\@evil.test",
      "//example.test/path",
      "https://",
      "not a URL",
      "file:///tmp/example",
      "custom://example.test",
      "http:///missing-host",
    ])
      request(trusted, rejected);
    request(forged, "https://forged.test");

    expect(options.openExternalLink.mock.calls).toEqual([
      ["https://example.test/a?x=%2F#fragment"],
      ["https://example.test/a?x=%2F#fragment"],
      ["http://example.test"],
      ["https://example.test:8443/path?name=Luiz%20Otavio#section"],
      ["https://example.test:443/path"],
      ["https://münchen.example/path"],
    ]);
    expect(webContents.send).not.toHaveBeenCalled();
  });

  it("observes one opener rejection without retrying or exposing link content", async () => {
    const ipc = createIpcHarness();
    const mainFrame = {};
    const webContents: TrustedWebContents = {
      mainFrame,
      isDestroyed: () => false,
      send: vi.fn(),
    };
    const rejectedUrl = "https://private.example.test/secret";
    const options = clipboardOptions();
    const write = vi.fn(() => true);
    options.openExternalLink.mockRejectedValueOnce(new Error(rejectedUrl));
    const router = registerTerminalIpcRouter(ipc.ipcMain, { write });
    router.registerController({
      ...options,
      webContents,
      createSession: vi.fn(),
      onSessionStartError: vi.fn(),
      onSessionExit: vi.fn(),
    });

    ipc.listeners.get(terminalIpc.externalLink)!(
      { sender: webContents, senderFrame: mainFrame },
      rejectedUrl,
    );
    await Promise.resolve();

    expect(options.openExternalLink).toHaveBeenCalledOnce();
    expect(options.onExternalLinkOpenError).toHaveBeenCalledWith();
    expect(write).toHaveBeenCalledWith({
      name: "application.failure",
      stage: "external-link-open",
    });
    expect(webContents.send).not.toHaveBeenCalled();
    expect(
      JSON.stringify(options.onExternalLinkOpenError.mock.calls),
    ).not.toContain(rejectedUrl);
    expect(JSON.stringify(write.mock.calls)).not.toContain(rejectedUrl);
  });

  it("consumes malformed and forged context-menu IPC without side effects", () => {
    const ipc = createIpcHarness();
    const mainFrame = {};
    const webContents: TrustedWebContents = {
      mainFrame,
      isDestroyed: () => false,
      send: vi.fn(),
    };
    const session: LocalTerminalSession = {
      write: vi.fn(),
      resize: vi.fn(),
      close: vi.fn(),
    };
    const clipboard = clipboardOptions();
    const router = registerTerminalIpcRouter(ipc.ipcMain);
    router.registerController({
      ...clipboard,
      webContents,
      createSession: () => session,
      onSessionStartError: vi.fn(),
      onSessionExit: vi.fn(),
    });
    const contextMenu = ipc.listeners.get(terminalIpc.clipboardContextMenu)!;

    expect(() =>
      contextMenu(
        { sender: webContents, senderFrame: mainFrame },
        { malformed: true },
      ),
    ).not.toThrow();
    expect(() =>
      contextMenu({ sender: webContents, senderFrame: {} }),
    ).not.toThrow();

    expect(clipboard.showClipboardContextMenu).not.toHaveBeenCalled();
    expect(clipboard.writeClipboardText).not.toHaveBeenCalled();
    expect(clipboard.readClipboardText).not.toHaveBeenCalled();
    expect(clipboard.confirmPaste).not.toHaveBeenCalled();
    expect(session.write).not.toHaveBeenCalled();

    contextMenu({ sender: webContents, senderFrame: mainFrame });
    expect(clipboard.showClipboardContextMenu).toHaveBeenCalledOnce();
  });

  it("forwards bounded output/exit and disposes session and IPC listeners once", () => {
    const ipc = createIpcHarness();
    const mainFrame = {};
    const send = vi.fn();
    const webContents: TrustedWebContents = {
      mainFrame,
      isDestroyed: () => false,
      send,
    };
    const close = vi.fn();
    const router = registerTerminalIpcRouter(ipc.ipcMain);
    let callbacks:
      | Parameters<
          Parameters<typeof router.registerController>[0]["createSession"]
        >[0]
      | undefined;
    const onSessionExit = vi.fn();
    const controller = router.registerController({
      ...clipboardOptions(),
      webContents,
      createSession(value) {
        callbacks = value;
        return { write: vi.fn(), resize: vi.fn(), close };
      },
      onSessionStartError: vi.fn(),
      onSessionExit,
    });

    ipc.handlers.get(terminalIpc.start)!({
      sender: webContents,
      senderFrame: mainFrame,
    });
    callbacks!.onOutput("output");
    callbacks!.onExit({ exitCode: 0, signal: 0 });
    ipc.listeners.get(terminalIpc.close)?.({
      sender: webContents,
      senderFrame: mainFrame,
    });
    controller.dispose();
    controller.dispose();
    router.dispose();

    expect(send).toHaveBeenNthCalledWith(1, terminalIpc.output, "output");
    expect(send).toHaveBeenNthCalledWith(2, terminalIpc.exit, {
      exitCode: 0,
      signal: 0,
    });
    expect(onSessionExit).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(ipc.handlers.size).toBe(0);
    expect(ipc.listeners.size).toBe(0);
  });

  it("closes a session returned after reentrant exit disposal exactly once", () => {
    const ipc = createIpcHarness();
    const mainFrame = {};
    const webContents: TrustedWebContents = {
      mainFrame,
      isDestroyed: () => true,
      send: vi.fn(),
    };
    const close = vi.fn();
    const router = registerTerminalIpcRouter(ipc.ipcMain);
    let controller: ReturnType<typeof router.registerController>;
    controller = router.registerController({
      ...clipboardOptions(),
      webContents,
      createSession(callbacks) {
        callbacks.onExit({ exitCode: 0, signal: 0 });
        return { write: vi.fn(), resize: vi.fn(), close };
      },
      onSessionStartError: vi.fn(),
      onSessionExit() {
        controller.dispose();
      },
    });

    ipc.handlers.get(terminalIpc.start)!({
      sender: webContents,
      senderFrame: mainFrame,
    });
    controller.dispose();
    router.dispose();

    expect(close).toHaveBeenCalledOnce();
    expect(ipc.handlers.size).toBe(0);
    expect(ipc.listeners.size).toBe(0);
    expect(webContents.send).not.toHaveBeenCalled();
  });

  it("emits only normalized content-free IPC, PTY control, resize, duration, and failure metadata", () => {
    const ipc = createIpcHarness();
    const frame = {};
    const webContents: TrustedWebContents = {
      mainFrame: frame,
      isDestroyed: () => false,
      send: vi.fn(),
    };
    const write = vi.fn(() => true);
    const router = registerTerminalIpcRouter(ipc.ipcMain, { write });
    let callbacks:
      | Parameters<
          Parameters<typeof router.registerController>[0]["createSession"]
        >[0]
      | undefined;
    router.registerController({
      ...clipboardOptions(),
      windowId: 7,
      webContents,
      createSession(value) {
        callbacks = value;
        return { write: vi.fn(), resize: vi.fn(), close: vi.fn() };
      },
      onSessionStartError: vi.fn(),
      onSessionExit: vi.fn(),
    });
    const trusted = { sender: webContents, senderFrame: frame };
    const terminalPayload = "TERMINAL_PAYLOAD_CANARY";

    ipc.handlers.get(terminalIpc.start)!(trusted);
    ipc.listeners.get(terminalIpc.input)?.(trusted, terminalPayload);
    ipc.listeners.get(terminalIpc.resize)?.(trusted, { cols: 120, rows: 40 });
    ipc.listeners.get(terminalIpc.title)?.(trusted, { title: "TITLE_CANARY" });
    ipc.listeners.get(terminalIpc.externalLink)?.(
      trusted,
      "file:///URL_CANARY",
    );
    expect(() =>
      ipc.handlers.get(terminalIpc.clipboardWrite)!(trusted, {
        text: "CLIPBOARD_CANARY",
      }),
    ).toThrow(TypeError);
    callbacks!.onExit({ exitCode: 23, signal: 0 });

    expect(write.mock.calls).toEqual(
      expect.arrayContaining([
        [{ name: "pty.control", windowId: 7, action: "started" }],
        [{ name: "pty.resize", windowId: 7, cols: 120, rows: 40 }],
        [
          {
            name: "boundary.rejected",
            boundary: "title",
            reason: "invalid-payload",
          },
        ],
        [
          {
            name: "boundary.rejected",
            boundary: "external-link",
            reason: "invalid-value",
          },
        ],
        [
          {
            name: "boundary.rejected",
            boundary: "clipboard",
            reason: "invalid-payload",
          },
        ],
      ]),
    );
    expect(write.mock.calls).toContainEqual([
      expect.objectContaining({
        name: "pty.exit",
        windowId: 7,
        outcome: "clean",
        code: 23,
        durationMs: expect.any(Number),
      }),
    ]);
    callbacks!.onExit({ exitCode: 0, signal: 15 });
    expect(write.mock.calls).toContainEqual([
      expect.objectContaining({
        name: "pty.exit",
        windowId: 7,
        outcome: "signal",
        code: 15,
        durationMs: expect.any(Number),
      }),
    ]);
    expect(JSON.stringify(write.mock.calls)).not.toContain(terminalPayload);
    expect(JSON.stringify(write.mock.calls)).not.toContain("TITLE_CANARY");
    expect(JSON.stringify(write.mock.calls)).not.toContain("URL_CANARY");
    expect(JSON.stringify(write.mock.calls)).not.toContain("CLIPBOARD_CANARY");
  });
});
