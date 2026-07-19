import { beforeAll, describe, expect, it, vi } from "vitest";
import { Terminal } from "@xterm/xterm";
import type { TerminalBridge } from "../../src/shared/terminal-bridge";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import { DEFAULT_TERMINAL_THEME } from "../../src/shared/terminal-theme";
import {
  registerTerminalIpcRouter,
  type IpcEvent,
  type IpcMainPort,
  type TrustedWebContents,
} from "../../src/main/terminal-ipc-controller";
import { createTerminalWindowTitleController } from "../../src/main/terminal-window-title";
import { registerTerminalTitleEvents } from "../../src/terminal-surface/terminal-title-events";

function write(terminal: Terminal, data: string): Promise<void> {
  return new Promise((resolve) => terminal.write(data, resolve));
}

const electron = vi.hoisted(() => {
  const listeners = new Map<
    string,
    (event: unknown, payload: unknown) => void
  >();
  return {
    bridge: undefined as TerminalBridge | undefined,
    listeners,
    send: vi.fn(),
    invoke: vi.fn(async (_channel?: string): Promise<unknown> => undefined),
    removeListener: vi.fn((channel: string) => listeners.delete(channel)),
  };
});

vi.mock("electron", () => ({
  contextBridge: {
    exposeInMainWorld(_key: string, value: { terminal: TerminalBridge }) {
      electron.bridge = value.terminal;
    },
  },
  ipcRenderer: {
    send: electron.send,
    invoke: electron.invoke,
    on(channel: string, listener: (event: unknown, payload: unknown) => void) {
      electron.listeners.set(channel, listener);
    },
    removeListener: electron.removeListener,
  },
}));

describe("isolated preload terminal bridge", () => {
  beforeAll(async () => {
    await import("../../src/preload/index");
  });

  it("validates outbound session-scoped input, resize, and close shapes", () => {
    const bridge = electron.bridge!;

    bridge.input("s1", "hello");
    bridge.resize("s1", { cols: 80, rows: 24 });
    bridge.close("s2");
    expect(() => bridge.input("s1", "")).toThrow(TypeError);
    expect(() => bridge.input("session-1", "hello")).toThrow(TypeError);
    expect(() => bridge.resize("s1", { cols: 0, rows: 24 })).toThrow(TypeError);
    expect(() => bridge.resize("", { cols: 80, rows: 24 })).toThrow(TypeError);
    expect(() => bridge.close("s0")).toThrow(TypeError);

    expect(electron.send).toHaveBeenCalledWith(terminalIpc.input, {
      sessionId: "s1",
      data: "hello",
    });
    expect(electron.send).toHaveBeenCalledWith(terminalIpc.resize, {
      sessionId: "s1",
      cols: 80,
      rows: 24,
    });
    expect(electron.send).toHaveBeenCalledWith(terminalIpc.close, {
      sessionId: "s2",
    });
  });

  it("returns only a validated Live Terminal Session identifier from start", async () => {
    const bridge = electron.bridge!;

    electron.invoke.mockResolvedValueOnce("s7");
    await expect(bridge.start()).resolves.toBe("s7");
    expect(electron.invoke).toHaveBeenCalledWith(terminalIpc.start);
    electron.invoke.mockResolvedValueOnce(undefined);
    await expect(bridge.start()).rejects.toThrow(TypeError);
    electron.invoke.mockResolvedValueOnce("session-1");
    await expect(bridge.start()).rejects.toThrow(TypeError);
  });

  it("exposes one-way title and payload-free BEL signals", () => {
    const bridge = electron.bridge!;

    bridge.title("");
    bridge.title("terminal title");
    bridge.bell();
    bridge.title("x".repeat(65_537));

    expect(electron.send).toHaveBeenCalledWith(terminalIpc.title, "");
    expect(electron.send).toHaveBeenCalledWith(
      terminalIpc.title,
      "terminal title",
    );
    expect(electron.send).toHaveBeenCalledWith(terminalIpc.bell);
    expect(electron.send).toHaveBeenCalledWith(
      terminalIpc.title,
      "x".repeat(65_537),
    );
  });

  it("sends an exact bounded External Link request without exposing Electron", () => {
    const bridge = electron.bridge!;
    bridge.openExternalLink("https://example.test/path");
    expect(() => bridge.openExternalLink("")).toThrow(TypeError);
    expect(electron.send).toHaveBeenCalledWith(
      terminalIpc.externalLink,
      "https://example.test/path",
    );
    expect(Object.keys(bridge)).not.toEqual(
      expect.arrayContaining(["shell", "navigate", "openWindow"]),
    );
  });

  it("delivers an oversized parser title through preload and main to the safe native fallback", async () => {
    const handlers = new Map<
      string,
      (event: IpcEvent, payload?: unknown) => unknown
    >();
    const listeners = new Map<
      string,
      (event: IpcEvent, payload?: unknown) => void
    >();
    const ipcMain: IpcMainPort = {
      handle: (channel, handler) => handlers.set(channel, handler),
      removeHandler: (channel) => handlers.delete(channel),
      on: (channel, listener) => listeners.set(channel, listener),
      removeListener: (channel) => listeners.delete(channel),
    };
    const frame = {};
    const webContents: TrustedWebContents = {
      mainFrame: frame,
      isDestroyed: () => false,
      send: vi.fn(),
    };
    const event = { sender: webContents, senderFrame: frame };
    const nativeTitles: string[] = [];
    const titleController = createTerminalWindowTitleController(
      {
        isFocused: () => true,
        setTitle: (title) => nativeTitles.push(title),
        on: vi.fn(),
        removeListener: vi.fn(),
      },
      vi.fn(),
    );
    const router = registerTerminalIpcRouter(ipcMain);
    const routed = router.registerController({
      configuration: {
        fontSize: 16,
        fontLineHeight: 1,
        terminalPadding: { top: 0, right: 8, bottom: 8, left: 8 },
        scrollbackLines: 10_000,
        optionKeyMode: "none",
        terminalTheme: DEFAULT_TERMINAL_THEME,
        userFileErrors: [],
      },
      webContents,
      createSession: vi.fn(() => ({
        write: vi.fn(),
        resize: vi.fn(),
        close: vi.fn(),
      })),
      onSessionStartError: vi.fn(),
      onSessionExit: vi.fn(),
      onTitleRequest: titleController.requestTitle,
      onBell: titleController.ringBell,
      onUserInteraction: titleController.resetAttention,
      openExternalLink: vi.fn(async () => {}),
      onExternalLinkOpenError: vi.fn(),
      writeClipboardText: vi.fn(),
      readClipboardText: vi.fn(() => ""),
      confirmPaste: vi.fn(async () => false),
      showClipboardContextMenu: vi.fn(),
      loadSnippets: vi.fn(async () => ({ snippets: [] })),
    });
    electron.send.mockImplementation((channel: string, payload?: unknown) =>
      listeners.get(channel)?.(event, payload),
    );
    const terminal = new Terminal();
    const ptyResponses: string[] = [];
    terminal.onData((data) => ptyResponses.push(data));
    registerTerminalTitleEvents(terminal, {
      onTitleRequest: electron.bridge!.title,
    });
    const canary = `CANARY${"x".repeat(65_537)}`;

    await write(terminal, `\u001b]0;${canary}\u0007`);

    expect(nativeTitles).toEqual(["OMXTerm", "OMXTerm"]);
    expect(JSON.stringify(nativeTitles)).not.toContain("CANARY");
    expect(ptyResponses).toEqual([]);

    terminal.dispose();
    routed.dispose();
    router.dispose();
    titleController.dispose();
    electron.send.mockReset();
  });

  it("exposes only a validated Snippets response and a payload-free toggle", async () => {
    const bridge = electron.bridge!;
    const valid = {
      snippets: [
        { name: "greet", body: "printf hi", execute: false },
        { name: "up", body: "brew update", description: "d", execute: true },
      ],
      error: "Snippets broke",
    };
    electron.invoke.mockResolvedValueOnce(valid);
    await expect(bridge.snippets()).resolves.toEqual(valid);
    expect(electron.invoke).toHaveBeenCalledWith(terminalIpc.snippets);
    for (const invalid of [
      undefined,
      { snippets: [{ name: "a", body: "b" }] },
      { snippets: [{ name: "a", body: "b", execute: "yes" }] },
      { snippets: [], error: "" },
      { snippets: [], extra: true },
    ]) {
      electron.invoke.mockResolvedValueOnce(invalid);
      await expect(bridge.snippets()).rejects.toThrow(TypeError);
    }

    const onToggle = vi.fn();
    const remove = bridge.onSnippetsToggle(onToggle);
    electron.listeners.get(terminalIpc.snippetsToggle)?.({}, undefined);
    electron.listeners.get(terminalIpc.snippetsToggle)?.({}, "payload");
    remove();
    expect(onToggle).toHaveBeenCalledOnce();
    expect(electron.removeListener).toHaveBeenCalledWith(
      terminalIpc.snippetsToggle,
      expect.any(Function),
    );
    electron.removeListener.mockClear();
  });

  it("delivers only valid bounded messages from main and removes subscriptions", () => {
    const bridge = electron.bridge!;
    const onOutput = vi.fn();
    const onExit = vi.fn();
    const removeOutput = bridge.onOutput(onOutput);
    const removeExit = bridge.onExit(onExit);

    electron.listeners.get(terminalIpc.output)?.(
      {},
      { sessionId: "s1", data: "output" },
    );
    electron.listeners.get(terminalIpc.output)?.(
      {},
      { sessionId: "s1", data: "" },
    );
    electron.listeners.get(terminalIpc.output)?.({}, "output");
    electron.listeners.get(terminalIpc.exit)?.(
      {},
      { sessionId: "s2", exitCode: 0, signal: 0 },
    );
    electron.listeners.get(terminalIpc.exit)?.({}, { exitCode: 0, signal: 0 });
    electron.listeners.get(terminalIpc.exit)?.(
      {},
      { sessionId: "s2", exitCode: "0", signal: 0 },
    );
    removeOutput();
    removeExit();

    expect(onOutput).toHaveBeenCalledOnce();
    expect(onOutput).toHaveBeenCalledWith("s1", "output");
    expect(onExit).toHaveBeenCalledOnce();
    expect(onExit).toHaveBeenCalledWith("s2", { exitCode: 0, signal: 0 });
    expect(electron.removeListener).toHaveBeenCalledTimes(2);
  });

  it("delivers only valid Window Font Zoom commands from main", () => {
    const bridge = electron.bridge!;
    const onFontZoom = vi.fn();
    const remove = bridge.onFontZoom(onFontZoom);

    electron.listeners.get(terminalIpc.fontZoom)?.({}, "in");
    electron.listeners.get(terminalIpc.fontZoom)?.({}, "application");
    electron.listeners.get(terminalIpc.fontZoom)?.({}, "reset");
    remove();

    expect(onFontZoom.mock.calls).toEqual([["in"], ["reset"]]);
    expect(electron.removeListener).toHaveBeenCalledWith(
      terminalIpc.fontZoom,
      expect.any(Function),
    );
  });

  it("exposes only a validated renderer configuration response", async () => {
    const bridge = electron.bridge!;
    electron.invoke.mockResolvedValueOnce({
      fontFamily: "SF Mono",
      fontSize: 18,
      fontLineHeight: 1.15,
      terminalPadding: { top: 0, right: 12, bottom: 8, left: 12 },
      scrollbackLines: 500,
      optionKeyMode: "right",
      terminalTheme: DEFAULT_TERMINAL_THEME,
      userFileErrors: [],
    });
    await expect(bridge.configuration()).resolves.toEqual({
      fontFamily: "SF Mono",
      fontSize: 18,
      fontLineHeight: 1.15,
      terminalPadding: { top: 0, right: 12, bottom: 8, left: 12 },
      scrollbackLines: 500,
      optionKeyMode: "right",
      terminalTheme: DEFAULT_TERMINAL_THEME,
      userFileErrors: [],
    });
    electron.invoke.mockResolvedValueOnce({ fontSize: "18" });
    await expect(bridge.configuration()).rejects.toThrow(TypeError);
    electron.invoke.mockResolvedValueOnce({
      fontSize: 18,
      fontLineHeight: 1,
      terminalPadding: { top: 0, right: 8, bottom: 8, left: 8 },
      scrollbackLines: 500,
      optionKeyMode: "none",
      terminalTheme: {
        ...DEFAULT_TERMINAL_THEME,
        colors: { ...DEFAULT_TERMINAL_THEME.colors, background: "black" },
      },
    });
    await expect(bridge.configuration()).rejects.toThrow(TypeError);
    electron.invoke.mockResolvedValueOnce({
      fontSize: 18,
      fontLineHeight: 1,
      terminalPadding: { top: 0, right: 8, bottom: 8, left: 129 },
      scrollbackLines: 500,
      optionKeyMode: "none",
    });
    await expect(bridge.configuration()).rejects.toThrow(TypeError);
    electron.invoke.mockResolvedValueOnce({
      fontSize: 18,
      fontLineHeight: 1,
      terminalPadding: { top: 0, right: 8, bottom: 8, left: 8 },
      scrollbackLines: 500,
      optionKeyMode: "none",
      terminalTheme: DEFAULT_TERMINAL_THEME,
      userFileErrors: [42],
    });
    await expect(bridge.configuration()).rejects.toThrow(TypeError);
    expect(electron.invoke).toHaveBeenCalledWith(terminalIpc.configuration);
  });

  it("exposes only text clipboard operations and validates both directions", async () => {
    const bridge = electron.bridge!;
    electron.invoke.mockImplementation(async (channel?: string) => {
      if (channel === terminalIpc.clipboardRead) return "pasted text";
      if (channel === terminalIpc.clipboardConfirmPaste) return true;
      return undefined;
    });

    await bridge.writeClipboardText("copied text");
    await expect(bridge.readClipboardText()).resolves.toBe("pasted text");
    await expect(bridge.confirmPaste("one\ntwo")).resolves.toBe(true);
    await expect(bridge.writeClipboardText("")).rejects.toThrow(TypeError);

    expect(electron.invoke).toHaveBeenCalledWith(
      terminalIpc.clipboardWrite,
      "copied text",
    );
    expect(electron.invoke).toHaveBeenCalledWith(terminalIpc.clipboardRead);
    expect(electron.invoke).toHaveBeenCalledWith(
      terminalIpc.clipboardConfirmPaste,
      "one\ntwo",
    );
    expect(Object.keys(bridge).some((key) => /image/i.test(key))).toBe(false);
  });
});
