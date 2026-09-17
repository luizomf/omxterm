import { describe, expect, it, vi } from "vitest";
import {
  registerTerminalIpcRouter,
  type IpcEvent,
  type IpcMainPort,
  type TerminalIpcControllerOptions,
  type TrustedWebContents,
} from "../../src/main/terminal-ipc-controller";
import type { OperationalEvent } from "../../src/main/operational-events";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import { DEFAULT_TERMINAL_THEME } from "../../src/shared/terminal-theme";

function harness() {
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
    removeHandler: (channel) => void handlers.delete(channel),
    on: (channel, listener) => void listeners.set(channel, listener),
    removeListener: (channel, listener) => {
      if (listeners.get(channel) === listener) listeners.delete(channel);
    },
  };
  return { ipcMain, handlers, listeners };
}

function options(): Omit<
  TerminalIpcControllerOptions,
  "webContents" | "createSession" | "onSessionStartError" | "onSessionExit"
> {
  return {
    configuration: {
      terminalSurface: "xterm",
      fontSize: 16,
      fontLineHeight: 1,
      terminalPadding: { top: 0, right: 8, bottom: 8, left: 8 },
      scrollbackLines: 10_000,
      optionKeyMode: "none",
      nativeTitleInset: 0,
      terminalTheme: DEFAULT_TERMINAL_THEME,
      userFileErrors: [],
    },
    writeClipboardText: vi.fn(),
    readClipboardText: vi.fn(() => ""),
    confirmPaste: vi.fn(async () => true),
    showClipboardContextMenu: vi.fn(),
    onTitleRequest: vi.fn(),
    onBell: vi.fn(),
    onSessionStarted: vi.fn(),
    onSessionSelected: vi.fn(),
    onUserInteraction: vi.fn(),
    openExternalLink: vi.fn(async () => undefined),
    onExternalLinkOpenError: vi.fn(),
    loadSnippets: vi.fn(async () => ({ snippets: [] })),
  };
}

describe("terminal output IPC", () => {
  it("accepts only cumulative progress from the owning session and sender", () => {
    const ipc = harness();
    const frame = {};
    const send = vi.fn();
    const webContents: TrustedWebContents = {
      mainFrame: frame,
      isDestroyed: () => false,
      send,
    };
    const acknowledgeOutput = vi.fn(() => true);
    let callbacks:
      Parameters<TerminalIpcControllerOptions["createSession"]>[0] | undefined;
    const write = vi.fn((_event: OperationalEvent) => true);
    const router = registerTerminalIpcRouter(ipc.ipcMain, { write });
    router.registerController({
      ...options(),
      webContents,
      createSession(value) {
        callbacks = value;
        return {
          write: vi.fn(),
          resize: vi.fn(),
          acknowledgeOutput,
          hasForegroundChildProcess: () => false,
          close: vi.fn(),
        };
      },
      onSessionStartError: vi.fn(),
      onSessionExit: vi.fn(),
    });
    const trusted = { sender: webContents, senderFrame: frame };
    ipc.handlers.get(terminalIpc.start)!(trusted);
    callbacks!.onOutput("Olá");
    callbacks!.onOutput("🙂");
    expect(send.mock.calls).toEqual([
      [terminalIpc.output, { sessionId: "s1", data: "Olá", end: 4 }],
      [terminalIpc.output, { sessionId: "s1", data: "🙂", end: 8 }],
    ]);

    const ack = ipc.listeners.get(terminalIpc.outputAck)!;
    ack(trusted, { sessionId: "s1", end: 4 });
    ack(trusted, { sessionId: "s1", end: 4 });
    ack(trusted, { sessionId: "s1", end: 9 });
    ack(trusted, { sessionId: "s9", end: 8 });
    ack({ sender: webContents, senderFrame: {} }, { sessionId: "s1", end: 8 });
    ack(trusted, { sessionId: "s1", end: 8 });

    expect(acknowledgeOutput.mock.calls).toEqual([[4], [4]]);
    expect(
      write.mock.calls.filter(
        ([event]) =>
          event.name === "boundary.rejected" && event.boundary === "ipc",
      ),
    ).toHaveLength(4);
  });

  it("closes its owned session when the renderer disappears without ACK", () => {
    const ipc = harness();
    const frame = {};
    let destroyed = false;
    const webContents: TrustedWebContents = {
      mainFrame: frame,
      isDestroyed: () => destroyed,
      send: vi.fn(),
    };
    const close = vi.fn();
    let callbacks:
      Parameters<TerminalIpcControllerOptions["createSession"]>[0] | undefined;
    const router = registerTerminalIpcRouter(ipc.ipcMain);
    router.registerController({
      ...options(),
      webContents,
      createSession(value) {
        callbacks = value;
        return {
          write: vi.fn(),
          resize: vi.fn(),
          acknowledgeOutput: vi.fn(() => true),
          hasForegroundChildProcess: () => false,
          close,
        };
      },
      onSessionStartError: vi.fn(),
      onSessionExit: vi.fn(),
    });
    ipc.handlers.get(terminalIpc.start)!({
      sender: webContents,
      senderFrame: frame,
    });
    destroyed = true;
    callbacks!.onOutput("unacknowledged synthetic output");

    expect(close).toHaveBeenCalledOnce();
    expect(webContents.send).not.toHaveBeenCalled();
  });
});
