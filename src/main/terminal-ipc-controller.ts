import type {
  TerminalExit,
  TerminalSessionId,
} from "../shared/terminal-contract";
import {
  isNonemptyClipboardText,
  isTerminalSessionInput,
  isTerminalSessionReference,
  isTerminalSessionResize,
  isTerminalTitleRequest,
  requiresProtectedPaste,
} from "../shared/terminal-contract";
import { terminalIpc } from "../shared/terminal-ipc";
import type { LocalTerminalSession } from "./local-terminal-session";
import type { TerminalRendererConfiguration } from "../shared/user-configuration";
import type { TerminalSnippetsResponse } from "../shared/terminal-snippets";
import type { OperationalEventLog } from "./operational-events";

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

// Lifecycle context for one ended (or failed) Live Terminal Session within
// its window: `liveSessions` counts the sessions still running afterwards,
// and `closeRequested` distinguishes a close-driven end from a spontaneous
// exit so an expected kill signal is not treated as a failure.
export interface TerminalSessionEndContext {
  readonly sessionId: TerminalSessionId;
  readonly closeRequested: boolean;
  readonly liveSessions: number;
}

export interface TerminalSessionStartErrorContext {
  readonly liveSessions: number;
}

export interface TerminalIpcControllerOptions {
  readonly windowId?: number;
  readonly configuration: TerminalRendererConfiguration;
  readonly webContents: TrustedWebContents;
  readonly createSession: (callbacks: SessionCallbacks) => LocalTerminalSession;
  readonly onSessionStartError: (
    context: TerminalSessionStartErrorContext,
  ) => void;
  readonly onSessionExit: (
    exit: TerminalExit,
    context: TerminalSessionEndContext,
  ) => void;
  readonly writeClipboardText: (text: string) => void;
  readonly readClipboardText: () => string;
  readonly confirmPaste: (text: string) => Promise<boolean>;
  readonly showClipboardContextMenu: () => void;
  readonly onTitleRequest: (request: string) => void;
  readonly onBell: () => void;
  readonly onUserInteraction: () => void;
  readonly openExternalLink: (url: string) => Promise<void>;
  readonly onExternalLinkOpenError: () => void;
  readonly loadSnippets: () => Promise<TerminalSnippetsResponse>;
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
  configuration(payload?: unknown): TerminalRendererConfiguration;
  start(payload?: unknown): TerminalSessionId;
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
  snippets(payload?: unknown): Promise<TerminalSnippetsResponse>;
}

export function registerTerminalIpcRouter(
  ipcMain: IpcMainPort,
  operationalEvents?: Pick<OperationalEventLog, "write">,
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
    if (!controller) {
      operationalEvents?.write({
        name: "boundary.rejected",
        boundary: "ipc",
        reason: "untrusted-sender",
      });
      throw new Error("Rejected terminal IPC from an untrusted sender");
    }
    return controller.start(payload);
  };
  const configuration: IpcHandler = (event, payload) => {
    const controller = controllerFor(event);
    if (!controller) {
      operationalEvents?.write({
        name: "boundary.rejected",
        boundary: "ipc",
        reason: "untrusted-sender",
      });
      throw new Error("Rejected configuration IPC from an untrusted sender");
    }
    return controller.configuration(payload);
  };
  const route = (
    event: IpcEvent,
    action: (controller: RoutedTerminalIpcController) => void,
  ) => {
    const controller = controllerFor(event);
    if (controller) action(controller);
    else
      operationalEvents?.write({
        name: "boundary.rejected",
        boundary: "ipc",
        reason: "untrusted-sender",
      });
  };
  const input: IpcListener = (event, payload) =>
    route(event, (controller) => controller.input(payload));
  const resize: IpcListener = (event, payload) =>
    route(event, (controller) => controller.resize(payload));
  const close: IpcListener = (event, payload) =>
    route(event, (controller) => controller.close(payload));
  const title: IpcListener = (event, payload) =>
    route(event, (controller) => controller.title(payload));
  const bell: IpcListener = (event, payload) =>
    route(event, (controller) => controller.bell(payload));
  const externalLink: IpcListener = (event, payload) =>
    route(event, (controller) => controller.openExternalLink(payload));
  const writeClipboardText: IpcHandler = (event, payload) => {
    const controller = controllerFor(event);
    if (!controller) {
      operationalEvents?.write({
        name: "boundary.rejected",
        boundary: "clipboard",
        reason: "untrusted-sender",
      });
      throw new Error("Rejected clipboard IPC from an untrusted sender");
    }
    controller.writeClipboardText(payload);
  };
  const readClipboardText: IpcHandler = (event, payload) => {
    const controller = controllerFor(event);
    if (!controller) {
      operationalEvents?.write({
        name: "boundary.rejected",
        boundary: "clipboard",
        reason: "untrusted-sender",
      });
      throw new Error("Rejected clipboard IPC from an untrusted sender");
    }
    return controller.readClipboardText(payload);
  };
  const confirmPaste: IpcHandler = (event, payload) => {
    const controller = controllerFor(event);
    if (!controller) {
      operationalEvents?.write({
        name: "boundary.rejected",
        boundary: "clipboard",
        reason: "untrusted-sender",
      });
      throw new Error("Rejected clipboard IPC from an untrusted sender");
    }
    return controller.confirmPaste(payload);
  };
  const showClipboardContextMenu: IpcListener = (event, payload) => {
    const controller = controllerFor(event);
    if (!controller) {
      operationalEvents?.write({
        name: "boundary.rejected",
        boundary: "clipboard",
        reason: "untrusted-sender",
      });
      return;
    }
    controller.showClipboardContextMenu(payload);
  };

  const snippets: IpcHandler = (event, payload) => {
    const controller = controllerFor(event);
    if (!controller) {
      operationalEvents?.write({
        name: "boundary.rejected",
        boundary: "ipc",
        reason: "untrusted-sender",
      });
      throw new Error("Rejected snippets IPC from an untrusted sender");
    }
    return controller.snippets(payload);
  };

  ipcMain.handle(terminalIpc.start, start);
  ipcMain.handle(terminalIpc.configuration, configuration);
  ipcMain.handle(terminalIpc.snippets, snippets);
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
      controller = createTerminalIpcController(
        options,
        operationalEvents,
        () => {
          if (controllers.get(options.webContents) === controller)
            controllers.delete(options.webContents);
        },
      );
      controllers.set(options.webContents, controller);
      return controller;
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const controller of [...controllers.values()]) controller.dispose();
      ipcMain.removeHandler(terminalIpc.start);
      ipcMain.removeHandler(terminalIpc.configuration);
      ipcMain.removeHandler(terminalIpc.snippets);
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

interface RoutedSessionState {
  readonly session: LocalTerminalSession;
  closed: boolean;
  exited: boolean;
}

function createTerminalIpcController(
  options: TerminalIpcControllerOptions,
  operationalEvents: Pick<OperationalEventLog, "write"> | undefined,
  unregister: () => void,
): RoutedTerminalIpcController {
  let disposed = false;
  const sessions = new Map<TerminalSessionId, RoutedSessionState>();
  let nextSessionNumber = 1;
  const windowId = options.windowId;
  const writeWindowEvent = (
    event: Parameters<OperationalEventLog["write"]>[0],
  ) => {
    if (windowId !== undefined) operationalEvents?.write(event);
  };
  const reject = (
    boundary: "ipc" | "title" | "external-link" | "clipboard",
    reason:
      | "untrusted-sender"
      | "invalid-payload"
      | "invalid-value"
      | "too-long"
      | "invalid-characters"
      | "unknown-session",
  ) =>
    operationalEvents?.write({ name: "boundary.rejected", boundary, reason });

  const closeSession = (sessionId: TerminalSessionId) => {
    const state = sessions.get(sessionId);
    if (!state || state.closed) return;
    state.closed = true;
    state.session.close();
  };

  const countLiveSessions = () =>
    [...sessions.values()].filter((state) => !state.exited).length;

  // A session-scoped payload is rejected before it is routed: an invalid shape
  // never reaches a session, and a well-formed message may only address a
  // session id this controller allocated for its own Terminal Window.
  const routedSession = (
    sessionId: TerminalSessionId,
  ): RoutedSessionState | undefined => {
    const state = sessions.get(sessionId);
    if (!state) reject("ipc", "unknown-session");
    return state;
  };

  const start = (payload?: unknown): TerminalSessionId => {
    if (payload !== undefined) {
      reject("ipc", "invalid-payload");
      throw new TypeError("Invalid terminal start payload");
    }
    if (disposed) throw new Error("Terminal IPC controller is disposed");

    const sessionId: TerminalSessionId = `s${nextSessionNumber}`;
    nextSessionNumber += 1;
    let startedAt: number | undefined;
    let exitedBeforeRegistration = false;
    let createdSession: LocalTerminalSession;
    try {
      createdSession = options.createSession({
        onOutput(data) {
          if (!disposed && !options.webContents.isDestroyed()) {
            options.webContents.send(terminalIpc.output, { sessionId, data });
          }
        },
        onExit(exit) {
          if (disposed) return;
          const state = sessions.get(sessionId);
          if (state) state.exited = true;
          else exitedBeforeRegistration = true;
          if (!options.webContents.isDestroyed()) {
            options.webContents.send(terminalIpc.exit, { sessionId, ...exit });
          }
          options.onSessionExit(exit, {
            sessionId,
            closeRequested: state?.closed ?? false,
            liveSessions: countLiveSessions(),
          });
          if (windowId !== undefined) {
            const outcome = exit.signal !== 0 ? "signal" : "clean";
            writeWindowEvent({
              name: "pty.exit",
              windowId,
              outcome,
              code: normalizeCode(
                outcome === "signal" ? exit.signal : exit.exitCode,
              ),
              durationMs: elapsedMilliseconds(startedAt),
            });
          }
        },
      });
    } catch {
      if (windowId !== undefined)
        writeWindowEvent({
          name: "pty.exit",
          windowId,
          outcome: "spawn-failure",
          code: null,
          durationMs: elapsedMilliseconds(startedAt),
        });
      options.onSessionStartError({ liveSessions: countLiveSessions() });
      throw new Error("The Default Shell could not be started");
    }

    sessions.set(sessionId, {
      session: createdSession,
      closed: false,
      exited: exitedBeforeRegistration,
    });
    startedAt = Date.now();
    if (windowId !== undefined)
      writeWindowEvent({
        name: "pty.control",
        windowId,
        action: "started",
      });
    if (disposed) {
      closeSession(sessionId);
    }
    return sessionId;
  };
  const configuration = (payload?: unknown) => {
    if (payload !== undefined) {
      reject("ipc", "invalid-payload");
      throw new TypeError("Invalid User Configuration payload");
    }
    if (disposed) throw new Error("Terminal IPC controller is disposed");
    return options.configuration;
  };

  const input = (payload?: unknown) => {
    if (!isTerminalSessionInput(payload)) {
      reject("ipc", "invalid-payload");
      return;
    }
    const state = routedSession(payload.sessionId);
    if (!state) return;
    options.onUserInteraction();
    state.session.write(payload.data);
  };
  const resize = (payload?: unknown) => {
    if (!isTerminalSessionResize(payload)) {
      reject("ipc", "invalid-payload");
      return;
    }
    const state = routedSession(payload.sessionId);
    if (!state) return;
    state.session.resize({ cols: payload.cols, rows: payload.rows });
    if (windowId !== undefined)
      writeWindowEvent({
        name: "pty.resize",
        windowId,
        cols: payload.cols,
        rows: payload.rows,
      });
  };
  const close = (payload?: unknown) => {
    if (!isTerminalSessionReference(payload)) {
      reject("ipc", "invalid-payload");
      return;
    }
    if (!routedSession(payload.sessionId)) return;
    if (windowId !== undefined)
      writeWindowEvent({
        name: "pty.control",
        windowId,
        action: "close-requested",
      });
    closeSession(payload.sessionId);
  };
  const writeClipboardText = (payload?: unknown) => {
    if (!isNonemptyClipboardText(payload)) {
      reject("clipboard", "invalid-payload");
      throw new TypeError("Invalid clipboard write payload");
    }
    options.writeClipboardText(payload);
  };
  const readClipboardText = (payload?: unknown) => {
    if (payload !== undefined) {
      reject("clipboard", "invalid-payload");
      throw new TypeError("Invalid clipboard read payload");
    }
    return options.readClipboardText();
  };
  const confirmPaste = async (payload?: unknown) => {
    if (!isNonemptyClipboardText(payload) || !requiresProtectedPaste(payload)) {
      reject("clipboard", "invalid-payload");
      throw new TypeError("Invalid Protected Paste payload");
    }
    return options.confirmPaste(payload);
  };
  const showClipboardContextMenu = (payload?: unknown) => {
    if (payload === undefined) options.showClipboardContextMenu();
    else reject("clipboard", "invalid-payload");
  };
  const snippets = async (payload?: unknown) => {
    if (payload !== undefined) {
      reject("ipc", "invalid-payload");
      throw new TypeError("Invalid snippets payload");
    }
    if (disposed) throw new Error("Terminal IPC controller is disposed");
    return options.loadSnippets();
  };
  const title = (payload?: unknown) => {
    if (isTerminalTitleRequest(payload)) options.onTitleRequest(payload);
    else reject("title", "invalid-payload");
  };
  const bell = (payload?: unknown) => {
    if (payload === undefined) options.onBell();
    else reject("ipc", "invalid-payload");
  };
  const openExternalLink = (payload?: unknown) => {
    if (!isValidExternalLink(payload)) {
      reject("external-link", "invalid-value");
      return;
    }
    void options.openExternalLink(payload).catch(() => {
      operationalEvents?.write({
        name: "application.failure",
        stage: "external-link-open",
      });
      options.onExternalLinkOpenError();
    });
  };

  return {
    configuration,
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
    snippets,
    dispose() {
      if (disposed) return;
      disposed = true;
      unregister();
      for (const sessionId of [...sessions.keys()]) closeSession(sessionId);
    },
  };
}

function elapsedMilliseconds(startedAt: number | undefined): number {
  return startedAt === undefined
    ? 0
    : Math.max(0, Math.round(Date.now() - startedAt));
}

function normalizeCode(value: number): number | null {
  return Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function isValidExternalLink(value: unknown): value is string {
  if (
    typeof value !== "string" ||
    value.length === 0 ||
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
