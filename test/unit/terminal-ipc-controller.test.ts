import { describe, expect, it, vi } from "vitest";
import {
  registerTerminalIpcRouter,
  type IpcEvent,
  type TerminalIpcControllerOptions,
  type TrustedWebContents,
} from "../../src/main/terminal-ipc-controller";
import {
  LocalTerminalSessionStartError,
  type LocalTerminalSession,
} from "../../src/main/local-terminal-session";
import type { OperationalEvent } from "../../src/main/operational-events";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import { DEFAULT_TERMINAL_THEME } from "../../src/shared/terminal-theme";

import {
  createIpcHarness,
  clipboardOptions,
} from "../fixtures/terminal-ipc-harness";

describe("rendering failure IPC", () => {
  it("carries only an owned fixed rendering failure through session termination", () => {
    const ipc = createIpcHarness();
    const router = registerTerminalIpcRouter(ipc.ipcMain);
    const frame = {};
    const webContents: TrustedWebContents = {
      mainFrame: frame,
      isDestroyed: () => false,
      send: vi.fn(),
    };
    const onSessionExit = vi.fn();
    const close = vi.fn();
    router.registerController({
      ...clipboardOptions(),
      webContents,
      onSessionStartError: vi.fn(),
      onSessionExit,
      createSession(callbacks) {
        close.mockImplementation(() =>
          callbacks.onExit({ exitCode: 0, signal: 0 }),
        );
        return {
          close,
          write: vi.fn(),
          resize: vi.fn(),
          hasForegroundChildProcess: () => false,
        };
      },
    });
    const owner = { sender: webContents, senderFrame: frame };
    ipc.handlers.get(terminalIpc.start)!(owner);
    const sendClose = ipc.listeners.get(terminalIpc.close)!;
    sendClose(
      { ...owner, senderFrame: {} },
      { sessionId: "s1", reason: "rendering-failure" },
    );
    sendClose(owner, { sessionId: "s2", reason: "rendering-failure" });
    sendClose(owner, { sessionId: "s1", reason: "arbitrary message" });
    sendClose(owner, {
      sessionId: "s1",
      reason: "rendering-failure",
      message: "untrusted",
    });
    expect(close).not.toHaveBeenCalled();
    sendClose(owner, { sessionId: "s1", reason: "rendering-failure" });
    sendClose(owner, { sessionId: "s1", reason: "rendering-failure" });
    expect(close).toHaveBeenCalledOnce();
    expect(onSessionExit).toHaveBeenCalledExactlyOnceWith(
      { exitCode: 0, signal: 0 },
      {
        sessionId: "s1",
        launchKind: "default-shell",
        closeRequested: true,
        closeReason: "rendering-failure",
        liveSessions: 0,
      },
    );
    router.dispose();
  });
});

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
      hasForegroundChildProcess: () => false,
      close: vi.fn(),
    };
    const secondSession: LocalTerminalSession = {
      write: vi.fn(),
      resize: vi.fn(),
      hasForegroundChildProcess: () => false,
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

    expect(
      ipc.handlers.get(terminalIpc.start)!({
        sender: firstWebContents,
        senderFrame: firstFrame,
      }),
    ).toBe("s1");
    expect(
      ipc.handlers.get(terminalIpc.start)!({
        sender: secondWebContents,
        senderFrame: secondFrame,
      }),
    ).toBe("s1");
    ipc.listeners.get(terminalIpc.input)?.(
      { sender: secondWebContents, senderFrame: secondFrame },
      { sessionId: "s1", data: "second window input" },
    );
    ipc.listeners.get(terminalIpc.close)?.(
      { sender: firstWebContents, senderFrame: firstFrame },
      { sessionId: "s1" },
    );

    expect(firstSession.write).not.toHaveBeenCalled();
    expect(secondSession.write).toHaveBeenCalledWith("second window input");
    expect(firstSession.close).toHaveBeenCalledOnce();
    expect(secondSession.close).not.toHaveBeenCalled();
    expect(ipc.handlers.size).toBe(10);
    expect(ipc.listeners.size).toBe(13);
  });

  it("associates each started session with its selected shell fallback title", () => {
    const ipc = createIpcHarness();
    const router = registerTerminalIpcRouter(ipc.ipcMain);
    const mainFrame = {};
    const webContents: TrustedWebContents = {
      mainFrame,
      isDestroyed: () => false,
      send: vi.fn(),
    };
    const fallbackTitles = ["powershell.exe", "bash.exe"];
    let sessionIndex = 0;
    const onSessionStarted = vi.fn();
    router.registerController({
      ...clipboardOptions(),
      webContents,
      createSession: vi.fn(() => ({
        fallbackTitle: fallbackTitles[sessionIndex++]!,
        write: vi.fn(),
        resize: vi.fn(),
        hasForegroundChildProcess: () => false,
        close: vi.fn(),
      })),
      onSessionStarted,
      onSessionStartError: vi.fn(),
      onSessionExit: vi.fn(),
    });
    const start = () =>
      ipc.handlers.get(terminalIpc.start)!({
        sender: webContents,
        senderFrame: mainFrame,
      });

    expect(start()).toBe("s1");
    expect(start()).toBe("s2");
    expect(onSessionStarted.mock.calls).toEqual([
      ["s1", "powershell.exe"],
      ["s2", "bash.exe"],
    ]);
  });

  it("validates and broadcasts complete configuration updates without touching sessions", () => {
    const ipc = createIpcHarness();
    const router = registerTerminalIpcRouter(ipc.ipcMain);
    const mainFrame = {};
    const webContents: TrustedWebContents = {
      mainFrame,
      isDestroyed: () => false,
      send: vi.fn(),
    };
    const session = {
      write: vi.fn(),
      resize: vi.fn(),
      hasForegroundChildProcess: () => false,
      close: vi.fn(),
    };
    router.registerController({
      ...clipboardOptions(),
      webContents,
      createSession: vi.fn(() => session),
      onSessionStartError: vi.fn(),
      onSessionExit: vi.fn(),
    });
    const updatedTheme = {
      ...DEFAULT_TERMINAL_THEME,
      name: "updated",
      colors: {
        ...DEFAULT_TERMINAL_THEME.colors,
        background: "#123456",
      },
    };
    const update = {
      ...clipboardOptions().configuration,
      fontSize: 24,
      terminalTheme: updatedTheme,
      userFileErrors: ["unrelated warning"],
    };

    router.applyConfiguration(update);

    expect(webContents.send).toHaveBeenCalledExactlyOnceWith(
      terminalIpc.configurationUpdate,
      { ...update, fontConfigurationId: expect.any(String) as unknown },
    );
    expect(
      ipc.handlers.get(terminalIpc.configuration)!({
        sender: webContents,
        senderFrame: mainFrame,
      }),
    ).toEqual(expect.objectContaining(update));
    expect(session.close).not.toHaveBeenCalled();
    expect(session.write).not.toHaveBeenCalled();
    expect(() =>
      router.applyConfiguration({
        ...update,
        terminalTheme: {
          ...updatedTheme,
          colors: { ...updatedTheme.colors, background: "black" },
        },
      }),
    ).toThrow(TypeError);
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
      fontLigatures: true,
      terminalPadding: Object.freeze({
        top: 4,
        right: 12,
        bottom: 6,
        left: 14,
      }),
      scrollbackLines: 500,
      optionKeyMode: "right" as const,
      nativeTitleInset: 30 as const,
      transparency: 0,
      showTabBar: true,
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
        hasForegroundChildProcess: () => false,
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
    ).toEqual({
      ...configuration,
      fontConfigurationId: expect.any(String) as unknown,
    });
  });

  it("serves an on-demand snippets read to its bound renderer and rejects payloads", async () => {
    const ipc = createIpcHarness();
    const mainFrame = {};
    const webContents: TrustedWebContents = {
      mainFrame,
      isDestroyed: () => false,
      send: vi.fn(),
    };
    const firstResponse = {
      snippets: [{ name: "greet", body: "printf hi", execute: false }],
    };
    const secondResponse = { snippets: [], error: "Snippets broke" };
    const loadSnippets = vi
      .fn()
      .mockResolvedValueOnce(firstResponse)
      .mockResolvedValueOnce(secondResponse);
    const router = registerTerminalIpcRouter(ipc.ipcMain);
    router.registerController({
      ...clipboardOptions(),
      loadSnippets,
      webContents,
      createSession: vi.fn(() => ({
        write: vi.fn(),
        resize: vi.fn(),
        hasForegroundChildProcess: () => false,
        close: vi.fn(),
      })),
      onSessionStartError: vi.fn(),
      onSessionExit: vi.fn(),
    });
    const event = { sender: webContents, senderFrame: mainFrame };

    await expect(ipc.handlers.get(terminalIpc.snippets)!(event)).resolves.toBe(
      firstResponse,
    );
    await expect(ipc.handlers.get(terminalIpc.snippets)!(event)).resolves.toBe(
      secondResponse,
    );
    expect(loadSnippets).toHaveBeenCalledTimes(2);
    await expect(
      ipc.handlers.get(terminalIpc.snippets)!(event, { name: "x" }),
    ).rejects.toThrow(TypeError);
    expect(() =>
      ipc.handlers.get(terminalIpc.snippets)!({
        sender: { mainFrame: {}, isDestroyed: () => false, send: vi.fn() },
        senderFrame: {},
      }),
    ).toThrow("untrusted");
  });

  it("reports a normalized Live Terminal Session startup failure without disclosing the cause", () => {
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
    expect(onSessionStartError).toHaveBeenCalledWith({
      launchKind: "default-shell",
      liveSessions: 0,
    });
    expect(JSON.stringify(onSessionStartError.mock.calls)).not.toContain(
      "TERMINAL_PAYLOAD_CANARY",
    );
  });

  it("reports an explicit-command startup failure without disclosing launch data", () => {
    const ipc = createIpcHarness();
    const mainFrame = {};
    const webContents: TrustedWebContents = {
      mainFrame,
      isDestroyed: () => false,
      send: vi.fn(),
    };
    const onSessionStartError = vi.fn();
    const router = registerTerminalIpcRouter(ipc.ipcMain);
    router.registerController({
      ...clipboardOptions(),
      webContents,
      createSession() {
        throw new LocalTerminalSessionStartError(
          "explicit-command",
          "PRIVATE_LAUNCH_CANARY",
        );
      },
      onSessionStartError,
      onSessionExit: vi.fn(),
    });

    expect(() =>
      ipc.handlers.get(terminalIpc.start)!({
        sender: webContents,
        senderFrame: mainFrame,
      }),
    ).toThrow("The requested command could not be started");
    expect(onSessionStartError).toHaveBeenCalledWith({
      launchKind: "explicit-command",
      liveSessions: 0,
    });
    expect(JSON.stringify(onSessionStartError.mock.calls)).not.toContain(
      "PRIVATE_LAUNCH_CANARY",
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
      hasForegroundChildProcess: () => false,
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
    expect(start({ sender: webContents, senderFrame: mainFrame })).toBe("s1");

    const trustedEvent = { sender: webContents, senderFrame: mainFrame };
    ipc.listeners.get(terminalIpc.input)?.(trustedEvent, {
      sessionId: "s1",
      data: "hello",
    });
    ipc.listeners.get(terminalIpc.input)?.(trustedEvent, {
      sessionId: "s1",
      data: "x".repeat(65_537),
    });
    ipc.listeners.get(terminalIpc.input)?.(trustedEvent, "hello");
    ipc.listeners.get(terminalIpc.resize)?.(trustedEvent, {
      sessionId: "s1",
      cols: 100,
      rows: 30,
    });
    ipc.listeners.get(terminalIpc.resize)?.(trustedEvent, {
      sessionId: "s1",
      cols: -1,
      rows: 30,
    });
    ipc.listeners.get(terminalIpc.resize)?.(trustedEvent, {
      cols: 100,
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
      hasForegroundChildProcess: () => false,
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

    ipc.handlers.get(terminalIpc.start)!(trusted);
    ipc.listeners.get(terminalIpc.title)?.(trusted, {
      sessionId: "s1",
      title: "owned title",
    });
    ipc.listeners.get(terminalIpc.title)?.(trusted, {
      sessionId: "s1",
      title: "x".repeat(65_537),
    });
    ipc.listeners.get(terminalIpc.title)?.(trusted, "bare title");
    ipc.listeners.get(terminalIpc.title)?.(trusted, { canary: "CANARY" });
    ipc.listeners.get(terminalIpc.title)?.(trusted, {
      sessionId: "s9",
      title: "unknown session title",
    });
    ipc.listeners.get(terminalIpc.title)?.(forged, {
      sessionId: "s1",
      title: "forged title",
    });
    ipc.listeners.get(terminalIpc.bell)?.(trusted, { sessionId: "s1" });
    ipc.listeners.get(terminalIpc.bell)?.(trusted, "malformed");
    ipc.listeners.get(terminalIpc.bell)?.(trusted, { sessionId: "s9" });
    ipc.listeners.get(terminalIpc.input)?.(trusted, {
      sessionId: "s1",
      data: "key",
    });

    expect(title.mock.calls).toEqual([
      ["s1", "owned title"],
      ["s1", "x".repeat(65_537)],
    ]);
    expect(JSON.stringify(title.mock.calls)).not.toContain("CANARY");
    expect(JSON.stringify(title.mock.calls)).not.toContain("unknown session");
    expect(bell).toHaveBeenCalledExactlyOnceWith("s1");
    expect(interaction).toHaveBeenCalledOnce();
    expect(session.write).toHaveBeenCalledOnce();
    expect(session.write).toHaveBeenCalledWith("key");
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
      hasForegroundChildProcess: () => false,
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
    await expect(
      ipc.handlers.get(terminalIpc.localImage)!(forged, { source: "picker" }),
    ).rejects.toThrow("untrusted sender");

    expect(clipboard.writeClipboardText).not.toHaveBeenCalled();
    expect(clipboard.readClipboardText).not.toHaveBeenCalled();
    expect(clipboard.confirmPaste).not.toHaveBeenCalled();
    expect(clipboard.loadLocalImage).not.toHaveBeenCalled();
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
      "https://example.test:8443/path?name=%E4%BE%8B%E7%A4%BA%20User#section",
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
      ["https://example.test:8443/path?name=%E4%BE%8B%E7%A4%BA%20User#section"],
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
      hasForegroundChildProcess: () => false,
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

    contextMenu(
      { sender: webContents, senderFrame: mainFrame },
      { hasSelection: true },
    );
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
        return {
          write: vi.fn(),
          resize: vi.fn(),
          hasForegroundChildProcess: () => false,
          close,
        };
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
    ipc.listeners.get(terminalIpc.close)?.(
      { sender: webContents, senderFrame: mainFrame },
      { sessionId: "s1" },
    );
    controller.dispose();
    controller.dispose();
    router.dispose();

    expect(send).toHaveBeenNthCalledWith(1, terminalIpc.output, {
      sessionId: "s1",
      data: "output",
      end: 6,
    });
    expect(send).toHaveBeenNthCalledWith(2, terminalIpc.exit, {
      sessionId: "s1",
      exitCode: 0,
      signal: 0,
    });
    expect(onSessionExit).toHaveBeenCalledOnce();
    // Actual exit has retired the session; late close/disposal cannot route it.
    expect(close).not.toHaveBeenCalled();
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
        return {
          write: vi.fn(),
          resize: vi.fn(),
          hasForegroundChildProcess: () => false,
          close,
        };
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
        return {
          write: vi.fn(),
          resize: vi.fn(),
          hasForegroundChildProcess: () => false,
          close: vi.fn(),
        };
      },
      onSessionStartError: vi.fn(),
      onSessionExit: vi.fn(),
    });
    const trusted = { sender: webContents, senderFrame: frame };
    const terminalPayload = "TERMINAL_PAYLOAD_CANARY";

    ipc.handlers.get(terminalIpc.start)!(trusted);
    ipc.listeners.get(terminalIpc.input)?.(trusted, {
      sessionId: "s1",
      data: terminalPayload,
    });
    ipc.listeners.get(terminalIpc.resize)?.(trusted, {
      sessionId: "s1",
      cols: 120,
      rows: 40,
    });
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
        durationMs: expect.any(Number) as unknown,
      }),
    ]);
    callbacks!.onExit({ exitCode: 0, signal: 15 });
    expect(write.mock.calls).toContainEqual([
      expect.objectContaining({
        name: "pty.exit",
        windowId: 7,
        outcome: "signal",
        code: 15,
        durationMs: expect.any(Number) as unknown,
      }),
    ]);
    expect(JSON.stringify(write.mock.calls)).not.toContain(terminalPayload);
    expect(JSON.stringify(write.mock.calls)).not.toContain("TITLE_CANARY");
    expect(JSON.stringify(write.mock.calls)).not.toContain("URL_CANARY");
    expect(JSON.stringify(write.mock.calls)).not.toContain("CLIPBOARD_CANARY");
  });

  it("routes several Live Terminal Sessions inside one Terminal Window independently", () => {
    const ipc = createIpcHarness();
    const mainFrame = {};
    const send = vi.fn();
    const webContents: TrustedWebContents = {
      mainFrame,
      isDestroyed: () => false,
      send,
    };
    const firstSession: LocalTerminalSession = {
      write: vi.fn(),
      resize: vi.fn(),
      hasForegroundChildProcess: () => false,
      close: vi.fn(),
    };
    const secondSession: LocalTerminalSession = {
      write: vi.fn(),
      resize: vi.fn(),
      hasForegroundChildProcess: () => false,
      close: vi.fn(),
    };
    const router = registerTerminalIpcRouter(ipc.ipcMain);
    const sessionInstances = [firstSession, secondSession];
    const sessionCallbacks: Array<
      Parameters<
        Parameters<typeof router.registerController>[0]["createSession"]
      >[0]
    > = [];
    const createSession = vi.fn(
      (
        callbacks: Parameters<
          Parameters<typeof router.registerController>[0]["createSession"]
        >[0],
      ) => {
        sessionCallbacks.push(callbacks);
        return sessionInstances[sessionCallbacks.length - 1]!;
      },
    );
    router.registerController({
      ...clipboardOptions(),
      webContents,
      createSession,
      onSessionStartError: vi.fn(),
      onSessionExit: vi.fn(),
    });
    const trusted = { sender: webContents, senderFrame: mainFrame };

    expect(ipc.handlers.get(terminalIpc.start)!(trusted)).toBe("s1");
    expect(ipc.handlers.get(terminalIpc.start)!(trusted)).toBe("s2");
    ipc.listeners.get(terminalIpc.input)?.(trusted, {
      sessionId: "s2",
      data: "second tab input",
    });
    ipc.listeners.get(terminalIpc.resize)?.(trusted, {
      sessionId: "s1",
      cols: 90,
      rows: 25,
    });
    sessionCallbacks[0]!.onOutput("first output");
    sessionCallbacks[1]!.onOutput("second output");
    ipc.listeners.get(terminalIpc.close)?.(trusted, { sessionId: "s1" });

    expect(firstSession.write).not.toHaveBeenCalled();
    expect(secondSession.write).toHaveBeenCalledWith("second tab input");
    expect(firstSession.resize).toHaveBeenCalledWith({ cols: 90, rows: 25 });
    expect(secondSession.resize).not.toHaveBeenCalled();
    expect(send).toHaveBeenCalledWith(terminalIpc.output, {
      sessionId: "s1",
      data: "first output",
      end: 12,
    });
    expect(send).toHaveBeenCalledWith(terminalIpc.output, {
      sessionId: "s2",
      data: "second output",
      end: 13,
    });
    expect(firstSession.close).toHaveBeenCalledOnce();
    expect(secondSession.close).not.toHaveBeenCalled();
  });

  it("reports each session end with its identity, close origin, and remaining live sessions", () => {
    const ipc = createIpcHarness();
    const mainFrame = {};
    const webContents: TrustedWebContents = {
      mainFrame,
      isDestroyed: () => false,
      send: vi.fn(),
    };
    const router = registerTerminalIpcRouter(ipc.ipcMain);
    const sessionCallbacks: Array<
      Parameters<
        Parameters<typeof router.registerController>[0]["createSession"]
      >[0]
    > = [];
    const onSessionExit = vi.fn();
    router.registerController({
      ...clipboardOptions(),
      webContents,
      createSession(callbacks) {
        sessionCallbacks.push(callbacks);
        return {
          write: vi.fn(),
          resize: vi.fn(),
          hasForegroundChildProcess: () => false,
          close: vi.fn(),
        };
      },
      onSessionStartError: vi.fn(),
      onSessionExit,
    });
    const trusted = { sender: webContents, senderFrame: mainFrame };

    ipc.handlers.get(terminalIpc.start)!(trusted);
    ipc.handlers.get(terminalIpc.start)!(trusted);
    ipc.listeners.get(terminalIpc.close)?.(trusted, { sessionId: "s1" });
    sessionCallbacks[0]!.onExit({ exitCode: 0, signal: 1 });
    sessionCallbacks[1]!.onExit({ exitCode: 5, signal: 0 });

    expect(onSessionExit.mock.calls).toEqual([
      [
        { exitCode: 0, signal: 1 },
        {
          sessionId: "s1",
          launchKind: "default-shell",
          closeRequested: true,
          liveSessions: 1,
        },
      ],
      [
        { exitCode: 5, signal: 0 },
        {
          sessionId: "s2",
          launchKind: "default-shell",
          closeRequested: false,
          liveSessions: 0,
        },
      ],
    ]);
  });

  it("tracks the renderer-selected session for Busy Session queries", () => {
    const ipc = createIpcHarness();
    const write = vi.fn((_event: OperationalEvent) => true);
    const mainFrame = {};
    const webContents: TrustedWebContents = {
      mainFrame,
      isDestroyed: () => false,
      send: vi.fn(),
    };
    const busyBySession = new Map<number, boolean>([
      [1, false],
      [2, true],
    ]);
    let created = 0;
    const router = registerTerminalIpcRouter(ipc.ipcMain, { write });
    const controller = router.registerController({
      ...clipboardOptions(),
      webContents,
      createSession() {
        created += 1;
        const index = created;
        return {
          write: vi.fn(),
          resize: vi.fn(),
          hasForegroundChildProcess: () => busyBySession.get(index) ?? false,
          close: vi.fn(),
        };
      },
      onSessionStartError: vi.fn(),
      onSessionExit: vi.fn(),
    });
    const trusted = { sender: webContents, senderFrame: mainFrame };

    ipc.handlers.get(terminalIpc.start)!(trusted);
    ipc.handlers.get(terminalIpc.start)!(trusted);
    // No selection reported yet: any live Busy Session counts.
    expect(controller.hasBusySelectedSession()).toBe(true);
    expect(controller.hasBusySession()).toBe(true);

    ipc.listeners.get(terminalIpc.tabSelected)?.(trusted, { sessionId: "s1" });
    expect(controller.hasBusySelectedSession()).toBe(false);
    ipc.listeners.get(terminalIpc.tabSelected)?.(trusted, { sessionId: "s2" });
    expect(controller.hasBusySelectedSession()).toBe(true);

    ipc.listeners.get(terminalIpc.tabSelected)?.(trusted, { sessionId: "s9" });
    expect(controller.hasBusySelectedSession()).toBe(true);
    expect(write.mock.calls).toContainEqual([
      {
        name: "boundary.rejected",
        boundary: "ipc",
        reason: "unknown-session",
      },
    ]);
    ipc.listeners.get(terminalIpc.tabSelected)?.(trusted, "s1");
    expect(write.mock.calls).toContainEqual([
      {
        name: "boundary.rejected",
        boundary: "ipc",
        reason: "invalid-payload",
      },
    ]);

    ipc.listeners.get(terminalIpc.close)?.(trusted, { sessionId: "s2" });
    expect(controller.hasBusySelectedSession()).toBe(false);
    expect(controller.hasBusySession()).toBe(false);
  });

  it("rejects session-scoped payloads with unknown or foreign session ids", () => {
    const ipc = createIpcHarness();
    const write = vi.fn((_event: OperationalEvent) => true);
    const mainFrame = {};
    const webContents: TrustedWebContents = {
      mainFrame,
      isDestroyed: () => false,
      send: vi.fn(),
    };
    const otherFrame = {};
    const otherWebContents: TrustedWebContents = {
      mainFrame: otherFrame,
      isDestroyed: () => false,
      send: vi.fn(),
    };
    const session: LocalTerminalSession = {
      write: vi.fn(),
      resize: vi.fn(),
      hasForegroundChildProcess: () => false,
      close: vi.fn(),
    };
    const foreignSecondSession: LocalTerminalSession = {
      write: vi.fn(),
      resize: vi.fn(),
      hasForegroundChildProcess: () => false,
      close: vi.fn(),
    };
    const interaction = vi.fn();
    const router = registerTerminalIpcRouter(ipc.ipcMain, { write });
    router.registerController({
      ...clipboardOptions(),
      webContents,
      createSession: () => session,
      onSessionStartError: vi.fn(),
      onSessionExit: vi.fn(),
      onUserInteraction: interaction,
    });
    const foreignCreateSession = vi
      .fn()
      .mockImplementationOnce(() => ({
        write: vi.fn(),
        resize: vi.fn(),
        hasForegroundChildProcess: () => false,
        close: vi.fn(),
      }))
      .mockImplementationOnce(() => foreignSecondSession);
    router.registerController({
      ...clipboardOptions(),
      webContents: otherWebContents,
      createSession: foreignCreateSession,
      onSessionStartError: vi.fn(),
      onSessionExit: vi.fn(),
    });
    const trusted = { sender: webContents, senderFrame: mainFrame };
    const foreign = { sender: otherWebContents, senderFrame: otherFrame };

    ipc.handlers.get(terminalIpc.start)!(trusted);
    ipc.handlers.get(terminalIpc.start)!(foreign);
    // "s2" exists only in the other Terminal Window.
    expect(ipc.handlers.get(terminalIpc.start)!(foreign)).toBe("s2");
    ipc.listeners.get(terminalIpc.input)?.(trusted, {
      sessionId: "s2",
      data: "foreign session input",
    });
    ipc.listeners.get(terminalIpc.input)?.(trusted, {
      sessionId: "s9",
      data: "unknown session input",
    });
    ipc.listeners.get(terminalIpc.resize)?.(trusted, {
      sessionId: "s9",
      cols: 80,
      rows: 24,
    });
    ipc.listeners.get(terminalIpc.close)?.(trusted, { sessionId: "s9" });

    expect(session.write).not.toHaveBeenCalled();
    expect(session.resize).not.toHaveBeenCalled();
    expect(session.close).not.toHaveBeenCalled();
    expect(foreignSecondSession.write).not.toHaveBeenCalled();
    expect(interaction).not.toHaveBeenCalled();
    expect(
      write.mock.calls.filter(
        ([event]) =>
          event.name === "boundary.rejected" &&
          event.boundary === "ipc" &&
          event.reason === "unknown-session",
      ),
    ).toHaveLength(4);
    expect(JSON.stringify(write.mock.calls)).not.toContain("session input");
  });

  it("disposes every Live Terminal Session in the window when the window closes", () => {
    const ipc = createIpcHarness();
    const mainFrame = {};
    const webContents: TrustedWebContents = {
      mainFrame,
      isDestroyed: () => false,
      send: vi.fn(),
    };
    const sessions: LocalTerminalSession[] = [];
    const router = registerTerminalIpcRouter(ipc.ipcMain);
    const controller = router.registerController({
      ...clipboardOptions(),
      webContents,
      createSession() {
        const session: LocalTerminalSession = {
          write: vi.fn(),
          resize: vi.fn(),
          hasForegroundChildProcess: () => false,
          close: vi.fn(),
        };
        sessions.push(session);
        return session;
      },
      onSessionStartError: vi.fn(),
      onSessionExit: vi.fn(),
    });
    const trusted = { sender: webContents, senderFrame: mainFrame };
    const start = ipc.handlers.get(terminalIpc.start)!;

    start(trusted);
    start(trusted);
    start(trusted);
    controller.dispose();
    controller.dispose();

    expect(sessions).toHaveLength(3);
    for (const session of sessions)
      expect(session.close).toHaveBeenCalledOnce();
    expect(() => start(trusted)).toThrow("untrusted sender");
    router.dispose();
  });
});

describe("Terminal Font IPC", () => {
  it("reads bytes only for the active configured family and a trusted main frame", async () => {
    const ipc = createIpcHarness();
    const loadFontData = vi.fn(async (family: string | undefined) => ({
      ...(family === undefined
        ? {}
        : { configured: { family, data: new Uint8Array([0, 1, 0, 0]) } }),
      fallbacks: [],
    }));
    const router = registerTerminalIpcRouter(
      ipc.ipcMain,
      undefined,
      loadFontData,
    );
    const mainFrame = {};
    const webContents: TrustedWebContents = {
      mainFrame,
      isDestroyed: () => false,
      send: vi.fn(),
    };
    const controller = router.registerController({
      ...clipboardOptions(),
      configuration: {
        ...clipboardOptions().configuration,
        fontFamily: "Exact Família",
      },
      webContents,
      createSession: vi.fn(),
      onSessionStartError: vi.fn(),
      onSessionExit: vi.fn(),
    });
    const handler = ipc.handlers.get(terminalIpc.fontData)! as unknown as (
      event: IpcEvent,
      payload?: unknown,
    ) => Promise<unknown>;
    const trusted = { sender: webContents, senderFrame: mainFrame };

    await expect(handler(trusted, "Exact Família")).resolves.toMatchObject({
      configured: { family: "Exact Família" },
      fallbacks: [],
    });
    await expect(handler(trusted, "/tmp/arbitrary.ttf")).rejects.toThrow(
      "does not match",
    );
    expect(() =>
      handler({ sender: webContents, senderFrame: {} }, "Exact Família"),
    ).toThrow("untrusted sender");
    expect(loadFontData).toHaveBeenCalledExactlyOnceWith("Exact Família");

    let finishLookup: (
      value: Awaited<ReturnType<typeof loadFontData>>,
    ) => void = () => {};
    loadFontData.mockImplementationOnce(
      (family) =>
        new Promise((resolve) => {
          finishLookup = resolve;
          expect(family).toBe("Exact Família");
        }),
    );
    const firstConcurrent = handler(trusted, "Exact Família");
    const secondConcurrent = handler(trusted, "Exact Família");
    expect(loadFontData).toHaveBeenCalledTimes(2);
    const sharedResult = {
      configured: {
        family: "Exact Família",
        data: new Uint8Array([0, 1, 0, 0]),
      },
      fallbacks: [],
    };
    finishLookup(sharedResult);
    await expect(firstConcurrent).resolves.toBe(sharedResult);
    await expect(secondConcurrent).resolves.toBe(sharedResult);
    expect(loadFontData).toHaveBeenCalledTimes(2);

    const finishChangedLoads: Array<
      (value: Awaited<ReturnType<typeof loadFontData>>) => void
    > = [];
    loadFontData.mockImplementation(
      () =>
        new Promise((resolve) => {
          finishChangedLoads.push(resolve);
        }),
    );
    const stale = handler(trusted, "Exact Família");
    controller.applyConfiguration({
      ...clipboardOptions().configuration,
      fontFamily: "Other Family",
    });
    controller.applyConfiguration({
      ...clipboardOptions().configuration,
      fontFamily: "Exact Família",
    });
    const current = handler(trusted, "Exact Família");
    expect(loadFontData).toHaveBeenCalledTimes(3);
    finishChangedLoads[0]!(sharedResult);
    await expect(stale).rejects.toThrow("superseded");
    await vi.waitFor(() => expect(loadFontData).toHaveBeenCalledTimes(4));
    finishChangedLoads[1]!(sharedResult);
    await expect(current).resolves.toBe(sharedResult);
    router.dispose();
  });

  it("reports the restart-only font settings of every live Terminal Surface", () => {
    const ipc = createIpcHarness();
    const router = registerTerminalIpcRouter(ipc.ipcMain);
    const mainFrame = {};
    const webContents: TrustedWebContents = {
      mainFrame,
      isDestroyed: () => false,
      send: vi.fn(),
    };
    let onExit:
      ((exit: { exitCode: number; signal: number }) => void) | undefined;
    const controller = router.registerController({
      ...clipboardOptions(),
      configuration: {
        ...clipboardOptions().configuration,
        fontFamily: "Initial Family",
        fontLineHeight: 1.25,
        fontLigatures: true,
      },
      webContents,
      createSession: vi.fn(
        (
          callbacks: Parameters<
            TerminalIpcControllerOptions["createSession"]
          >[0],
        ) => {
          onExit = callbacks.onExit;
          return {
            write: vi.fn(),
            resize: vi.fn(),
            hasForegroundChildProcess: () => false,
            close: vi.fn(),
          };
        },
      ),
      onSessionStartError: vi.fn(),
      onSessionExit: vi.fn(),
    });
    const trusted = { sender: webContents, senderFrame: mainFrame };
    ipc.handlers.get(terminalIpc.start)!(trusted);

    expect(router.activeTerminalSurfaceFontConfigurations()).toEqual([
      { fontFamily: "Initial Family", fontLineHeight: 1.25 },
    ]);
    onExit?.({ exitCode: 0, signal: 0 });
    expect(router.activeTerminalSurfaceFontConfigurations()).toEqual([]);

    controller.dispose();
    router.dispose();
  });
});
