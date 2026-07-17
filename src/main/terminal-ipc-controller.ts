import type { TerminalExit } from "../shared/terminal-contract";
import {
  isNonemptyClipboardText,
  isBoundedTerminalPayload,
  isTerminalSize,
  isTerminalTitleRequest,
  requiresProtectedPaste,
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
type IpcHandler = (
  event: IpcEvent,
  payload?: unknown,
) => Promise<unknown> | unknown;

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
  readonly webContents: TrustedWebContents;
  readonly createSession: (callbacks: SessionCallbacks) => LocalTerminalSession;
  readonly onSessionStartError: () => void;
  readonly onSessionExit: (exit: TerminalExit) => void;
  readonly writeClipboardText: (text: string) => void;
  readonly readClipboardText: () => string;
  readonly confirmPaste: (text: string) => Promise<boolean>;
  readonly showClipboardContextMenu: () => void;
  readonly onTitleRequest: (request: string) => void;
  readonly onBell: () => void;
  readonly onUserInteraction: () => void;
  readonly openExternalLink: (url: string) => Promise<void>;
  readonly onExternalLinkOpenError: () => void;
}

export interface TerminalIpcController {
  dispose(): void;
}

export interface TerminalIpcRouter {
  registerController(
    options: TerminalIpcControllerOptions,
  ): TerminalIpcController;
  dispose(): void;
}

interface RoutedTerminalIpcController extends TerminalIpcController {
  start(payload?: unknown): void;
  input(payload?: unknown): void;
  resize(payload?: unknown): void;
  close(payload?: unknown): void;
  writeClipboardText(payload?: unknown): void;
  readClipboardText(payload?: unknown): string;
  confirmPaste(payload?: unknown): Promise<boolean>;
  showClipboardContextMenu(payload?: unknown): void;
  title(payload?: unknown): void;
  bell(payload?: unknown): void;
  openExternalLink(payload?: unknown): void;
}

export function registerTerminalIpcRouter(
  ipcMain: IpcMainPort,
): TerminalIpcRouter {
  const controllers = new Map<
    TrustedWebContents,
    RoutedTerminalIpcController
  >();
  let disposed = false;

  const controllerFor = (event: IpcEvent) =>
    event.senderFrame === event.sender.mainFrame
      ? controllers.get(event.sender)
      : undefined;
  const start: IpcHandler = (event, payload) => {
    const controller = controllerFor(event);
    if (!controller)
      throw new Error("Rejected terminal IPC from an untrusted sender");
    controller.start(payload);
  };
  const input: IpcListener = (event, payload) =>
    controllerFor(event)?.input(payload);
  const resize: IpcListener = (event, payload) =>
    controllerFor(event)?.resize(payload);
  const close: IpcListener = (event, payload) =>
    controllerFor(event)?.close(payload);
  const title: IpcListener = (event, payload) =>
    controllerFor(event)?.title(payload);
  const bell: IpcListener = (event, payload) =>
    controllerFor(event)?.bell(payload);
  const externalLink: IpcListener = (event, payload) =>
    controllerFor(event)?.openExternalLink(payload);
  const writeClipboardText: IpcHandler = (event, payload) => {
    const controller = controllerFor(event);
    if (!controller)
      throw new Error("Rejected clipboard IPC from an untrusted sender");
    controller.writeClipboardText(payload);
  };
  const readClipboardText: IpcHandler = (event, payload) => {
    const controller = controllerFor(event);
    if (!controller)
      throw new Error("Rejected clipboard IPC from an untrusted sender");
    return controller.readClipboardText(payload);
  };
  const confirmPaste: IpcHandler = (event, payload) => {
    const controller = controllerFor(event);
    if (!controller)
      throw new Error("Rejected clipboard IPC from an untrusted sender");
    return controller.confirmPaste(payload);
  };
  const showClipboardContextMenu: IpcListener = (event, payload) => {
    const controller = controllerFor(event);
    if (!controller) return;
    controller.showClipboardContextMenu(payload);
  };

  ipcMain.handle(terminalIpc.start, start);
  ipcMain.on(terminalIpc.input, input);
  ipcMain.on(terminalIpc.resize, resize);
  ipcMain.on(terminalIpc.close, close);
  ipcMain.on(terminalIpc.title, title);
  ipcMain.on(terminalIpc.bell, bell);
  ipcMain.on(terminalIpc.externalLink, externalLink);
  ipcMain.handle(terminalIpc.clipboardWrite, writeClipboardText);
  ipcMain.handle(terminalIpc.clipboardRead, readClipboardText);
  ipcMain.handle(terminalIpc.clipboardConfirmPaste, confirmPaste);
  ipcMain.on(terminalIpc.clipboardContextMenu, showClipboardContextMenu);

  return {
    registerController(options) {
      if (disposed) throw new Error("Terminal IPC router is disposed");
      if (controllers.has(options.webContents))
        throw new Error("Terminal IPC controller already registered");

      let controller: RoutedTerminalIpcController;
      controller = createTerminalIpcController(options, () => {
        if (controllers.get(options.webContents) === controller)
          controllers.delete(options.webContents);
      });
      controllers.set(options.webContents, controller);
      return controller;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const controller of [...controllers.values()]) controller.dispose();
      ipcMain.removeHandler(terminalIpc.start);
      ipcMain.removeListener(terminalIpc.input, input);
      ipcMain.removeListener(terminalIpc.resize, resize);
      ipcMain.removeListener(terminalIpc.close, close);
      ipcMain.removeListener(terminalIpc.title, title);
      ipcMain.removeListener(terminalIpc.bell, bell);
      ipcMain.removeListener(terminalIpc.externalLink, externalLink);
      ipcMain.removeHandler(terminalIpc.clipboardWrite);
      ipcMain.removeHandler(terminalIpc.clipboardRead);
      ipcMain.removeHandler(terminalIpc.clipboardConfirmPaste);
      ipcMain.removeListener(
        terminalIpc.clipboardContextMenu,
        showClipboardContextMenu,
      );
    },
  };
}

function createTerminalIpcController(
  options: TerminalIpcControllerOptions,
  unregister: () => void,
): RoutedTerminalIpcController {
  let disposed = false;
  let session: LocalTerminalSession | undefined;
  let sessionClosed = false;
  let starting = false;

  const closeSession = () => {
    if (!session || sessionClosed) return;
    sessionClosed = true;
    session.close();
  };

  const start = (payload?: unknown) => {
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
    } catch {
      options.onSessionStartError();
      throw new Error("The Default Shell could not be started");
    } finally {
      starting = false;
    }

    session = createdSession;
    if (disposed) {
      closeSession();
    }
  };

  const input = (payload?: unknown) => {
    if (isBoundedTerminalPayload(payload)) {
      options.onUserInteraction();
      session?.write(payload);
    }
  };
  const resize = (payload?: unknown) => {
    if (isTerminalSize(payload)) session?.resize(payload);
  };
  const close = (payload?: unknown) => {
    if (payload === undefined) closeSession();
  };
  const writeClipboardText = (payload?: unknown) => {
    if (!isNonemptyClipboardText(payload))
      throw new TypeError("Invalid clipboard write payload");
    options.writeClipboardText(payload);
  };
  const readClipboardText = (payload?: unknown) => {
    if (payload !== undefined)
      throw new TypeError("Invalid clipboard read payload");
    return options.readClipboardText();
  };
  const confirmPaste = async (payload?: unknown) => {
    if (!isNonemptyClipboardText(payload) || !requiresProtectedPaste(payload))
      throw new TypeError("Invalid Protected Paste payload");
    return options.confirmPaste(payload);
  };
  const showClipboardContextMenu = (payload?: unknown) => {
    if (payload === undefined) options.showClipboardContextMenu();
  };
  const title = (payload?: unknown) => {
    if (isTerminalTitleRequest(payload)) options.onTitleRequest(payload);
  };
  const bell = (payload?: unknown) => {
    if (payload === undefined) options.onBell();
  };
  const openExternalLink = (payload?: unknown) => {
    if (!isValidExternalLink(payload)) return;
    void options.openExternalLink(payload).catch(() => {
      options.onExternalLinkOpenError();
    });
  };

  return {
    start,
    input,
    resize,
    close,
    writeClipboardText,
    readClipboardText,
    confirmPaste,
    showClipboardContextMenu,
    title,
    bell,
    openExternalLink,
    dispose() {
      if (disposed) return;
      disposed = true;
      unregister();
      closeSession();
    },
  };
}

export function isValidExternalLink(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
    value.length > 2_048 ||
    /[\s\p{Cc}\p{Cf}\\]/u.test(value) ||
    (!value.startsWith("http://") && !value.startsWith("https://"))
  )
    return false;
  try {
    const parsed = new URL(value);
    const authority = value
      .slice(value.startsWith("https://") ? 8 : 7)
      .split(/[/?#]/u, 1)[0]!;
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      authority.length > 0 &&
      parsed.host.length > 0
    );
  } catch {
    return false;
  }
}
