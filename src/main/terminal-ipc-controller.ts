import type { TerminalExit } from "../shared/terminal-contract";
import {
  isBoundedTerminalPayload,
  isTerminalSize,
} from "../shared/terminal-contract";
import { terminalIpc } from "../shared/terminal-ipc";
import type { LocalTerminalSession } from "./local-terminal-session";

export interface TrustedWebContents {
  readonly mainFrame: object;
  isDestroyed(): boolean;
  send(channel: string, payload: unknown): void;
}

export interface IpcEvent {
  readonly sender: TrustedWebContents;
  readonly senderFrame: object;
}

type IpcListener = (event: IpcEvent, payload?: unknown) => void;
type IpcHandler = (event: IpcEvent, payload?: unknown) => Promise<void> | void;

export interface IpcMainPort {
  handle(channel: string, handler: IpcHandler): void;
  removeHandler(channel: string): void;
  on(channel: string, listener: IpcListener): void;
  removeListener(channel: string, listener: IpcListener): void;
}

interface SessionCallbacks {
  readonly onOutput: (data: string) => void;
  readonly onExit: (exit: TerminalExit) => void;
}

export interface TerminalIpcControllerOptions {
  readonly ipcMain: IpcMainPort;
  readonly webContents: TrustedWebContents;
  readonly createSession: (callbacks: SessionCallbacks) => LocalTerminalSession;
  readonly onSessionStartError: (error: unknown) => void;
  readonly onSessionExit: (exit: TerminalExit) => void;
}

export interface TerminalIpcController {
  dispose(): void;
}

export function registerTerminalIpcController(
  options: TerminalIpcControllerOptions,
): TerminalIpcController {
  let disposed = false;
  let session: LocalTerminalSession | undefined;
  let starting = false;

  const isTrusted = (event: IpcEvent) =>
    event.sender === options.webContents &&
    event.senderFrame === options.webContents.mainFrame;

  const start: IpcHandler = (event, payload) => {
    if (!isTrusted(event))
      throw new Error("Rejected terminal IPC from an untrusted sender");
    if (payload !== undefined)
      throw new TypeError("Invalid terminal start payload");
    if (disposed) throw new Error("Terminal IPC controller is disposed");
    if (session || starting)
      throw new Error("Live Terminal Session already started");

    starting = true;
    let createdSession: LocalTerminalSession;
    try {
      createdSession = options.createSession({
        onOutput(data) {
          if (!disposed && !options.webContents.isDestroyed()) {
            options.webContents.send(terminalIpc.output, data);
          }
        },
        onExit(exit) {
          if (disposed) return;
          if (!options.webContents.isDestroyed()) {
            options.webContents.send(terminalIpc.exit, exit);
          }
          options.onSessionExit(exit);
        },
      });
    } catch (error) {
      options.onSessionStartError(error);
      throw error;
    } finally {
      starting = false;
    }

    session = createdSession;
    if (disposed) {
      session = undefined;
      createdSession.close();
    }
  };

  const input: IpcListener = (event, payload) => {
    if (isTrusted(event) && isBoundedTerminalPayload(payload))
      session?.write(payload);
  };
  const resize: IpcListener = (event, payload) => {
    if (isTrusted(event) && isTerminalSize(payload)) session?.resize(payload);
  };
  const close: IpcListener = (event, payload) => {
    if (isTrusted(event) && payload === undefined) session?.close();
  };

  options.ipcMain.handle(terminalIpc.start, start);
  options.ipcMain.on(terminalIpc.input, input);
  options.ipcMain.on(terminalIpc.resize, resize);
  options.ipcMain.on(terminalIpc.close, close);

  return {
    dispose() {
      if (disposed) return;
      disposed = true;
      options.ipcMain.removeHandler(terminalIpc.start);
      options.ipcMain.removeListener(terminalIpc.input, input);
      options.ipcMain.removeListener(terminalIpc.resize, resize);
      options.ipcMain.removeListener(terminalIpc.close, close);
      session?.close();
    },
  };
}
