import type {
  TerminalExit,
  TerminalSessionId,
} from "../shared/terminal-contract";
import {
  isNonemptyClipboardText,
  isTerminalSessionInput,
  isTerminalSessionReference,
  isTerminalSessionResize,
  isTerminalSessionTitle,
  requiresProtectedPaste,
} from "../shared/terminal-contract";
import { terminalIpc } from "../shared/terminal-ipc";
import {
  LocalTerminalSessionStartError,
  type LocalTerminalSession,
  type TerminalSessionLaunchKind,
} from "./local-terminal-session";
import type { TerminalRendererConfiguration } from "../shared/user-configuration";
import type { TerminalSnippetsResponse } from "../shared/terminal-snippets";
import type { OperationalEventLog } from "./operational-events";
import { isTerminalRendererConfiguration } from "../shared/user-configuration";
import type { TerminalFontData } from "../shared/terminal-font-data";

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
  readonly onExit: (
    exit: TerminalExit,
    launchKind?: TerminalSessionLaunchKind,
  ) => void;
}

// Lifecycle context for one ended (or failed) Live Terminal Session within
// its window: `liveSessions` counts the sessions still running afterwards,
// and `closeRequested` distinguishes a close-driven end from a spontaneous
// exit so an expected kill signal is not treated as a failure.
export interface TerminalSessionEndContext {
  readonly sessionId: TerminalSessionId;
  readonly launchKind: TerminalSessionLaunchKind;
  readonly closeRequested: boolean;
  readonly liveSessions: number;
}

export interface TerminalSessionStartErrorContext {
  readonly launchKind: TerminalSessionLaunchKind;
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
  readonly onSessionStarted: (
    sessionId: TerminalSessionId,
    fallbackTitle?: string,
  ) => void;
  readonly onSessionSelected: (sessionId: TerminalSessionId) => void;
  readonly writeClipboardText: (text: string) => void;
  readonly readClipboardText: () => string;
  readonly confirmPaste: (text: string) => Promise<boolean>;
  readonly onClipboardError?: () => void;
  readonly showClipboardContextMenu: () => void;
  readonly onTitleRequest: (
    sessionId: TerminalSessionId,
    request: string,
  ) => void;
  readonly onBell: (sessionId: TerminalSessionId) => void;
  readonly onUserInteraction: () => void;
  readonly openExternalLink: (url: string) => Promise<void>;
  readonly onExternalLinkOpenError: () => void;
  readonly loadSnippets: () => Promise<TerminalSnippetsResponse>;
}

export interface TerminalIpcController {
  applyConfiguration(configuration: TerminalRendererConfiguration): void;
  // Close confirmations ask only when the affected sessions are running a
  // foreground child process (ADR 0017). The selected session is the one the
  // renderer last reported; before any report, every live session counts.
  hasBusySelectedSession(): boolean;
  hasBusySession(): boolean;
  dispose(): void;
}

export interface ResttySurfaceFontConfiguration {
  readonly fontFamily?: string;
  readonly fontLineHeight: number;
}

export interface TerminalIpcRouter {
  registerController(
    options: TerminalIpcControllerOptions,
  ): TerminalIpcController;
  applyConfiguration(configuration: TerminalRendererConfiguration): void;
  activeResttySurfaceFontConfigurations(): readonly ResttySurfaceFontConfiguration[];
  dispose(): void;
}

interface RoutedTerminalIpcController extends TerminalIpcController {
  configuration(payload?: unknown): TerminalRendererConfiguration;
  start(payload?: unknown): TerminalSessionId;
  input(payload?: unknown): void;
  resize(payload?: unknown): void;
  close(payload?: unknown): void;
  tabSelected(payload?: unknown): void;
  writeClipboardText(payload?: unknown): void;
  readClipboardText(payload?: unknown): string;
  confirmPaste(payload?: unknown): Promise<boolean>;
  showClipboardContextMenu(payload?: unknown): void;
  title(payload?: unknown): void;
  bell(payload?: unknown): void;
  openExternalLink(payload?: unknown): void;
  snippets(payload?: unknown): Promise<TerminalSnippetsResponse>;
  fontData(payload?: unknown): Promise<TerminalFontData>;
  activeResttySurfaceFontConfigurations(): readonly ResttySurfaceFontConfiguration[];
}

export function registerTerminalIpcRouter(
  ipcMain: IpcMainPort,
  operationalEvents?: Pick<OperationalEventLog, "write">,
  loadTerminalFontData: (
    family: string | undefined,
  ) => Promise<TerminalFontData> = async () => ({ fallbacks: [] }),
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
  const tabSelected: IpcListener = (event, payload) =>
    route(event, (controller) => controller.tabSelected(payload));
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

  const fontData: IpcHandler = (event, payload) => {
    const controller = controllerFor(event);
    if (!controller) {
      operationalEvents?.write({
        name: "boundary.rejected",
        boundary: "ipc",
        reason: "untrusted-sender",
      });
      throw new Error("Rejected Terminal Font IPC from an untrusted sender");
    }
    return controller.fontData(payload);
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
  ipcMain.handle(terminalIpc.fontData, fontData);
  ipcMain.handle(terminalIpc.snippets, snippets);
  ipcMain.on(terminalIpc.input, input);
  ipcMain.on(terminalIpc.resize, resize);
  ipcMain.on(terminalIpc.close, close);
  ipcMain.on(terminalIpc.tabSelected, tabSelected);
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
        loadTerminalFontData,
        () => {
          if (controllers.get(options.webContents) === controller)
            controllers.delete(options.webContents);
        },
      );
      controllers.set(options.webContents, controller);
      return controller;
    },
    applyConfiguration(configuration) {
      if (!isTerminalRendererConfiguration(configuration))
        throw new TypeError("Invalid renderer configuration update");
      for (const controller of controllers.values())
        controller.applyConfiguration(configuration);
    },
    activeResttySurfaceFontConfigurations() {
      return Object.freeze(
        [...controllers.values()].flatMap((controller) =>
          controller.activeResttySurfaceFontConfigurations(),
        ),
      );
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const controller of [...controllers.values()]) controller.dispose();
      ipcMain.removeHandler(terminalIpc.start);
      ipcMain.removeHandler(terminalIpc.configuration);
      ipcMain.removeHandler(terminalIpc.fontData);
      ipcMain.removeHandler(terminalIpc.snippets);
      ipcMain.removeListener(terminalIpc.input, input);
      ipcMain.removeListener(terminalIpc.resize, resize);
      ipcMain.removeListener(terminalIpc.close, close);
      ipcMain.removeListener(terminalIpc.tabSelected, tabSelected);
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
  readonly resttyFontConfiguration?: ResttySurfaceFontConfiguration;
  closed: boolean;
  exited: boolean;
}

function useClipboard<T>(
  operation: () => T,
  onError: (() => void) | undefined,
  fallback: T,
): T {
  try {
    return operation();
  } catch {
    onError?.();
    return fallback;
  }
}

async function confirmClipboardPaste(
  options: TerminalIpcControllerOptions,
  text: string,
): Promise<boolean> {
  try {
    return await options.confirmPaste(text);
  } catch {
    options.onClipboardError?.();
    return false;
  }
}

function createTerminalIpcController(
  options: TerminalIpcControllerOptions,
  operationalEvents: Pick<OperationalEventLog, "write"> | undefined,
  loadTerminalFontData: (
    family: string | undefined,
  ) => Promise<TerminalFontData>,
  unregister: () => void,
): RoutedTerminalIpcController {
  let disposed = false;
  let rendererConfiguration = options.configuration;
  let fontRequestInFlight = false;
  const sessions = new Map<TerminalSessionId, RoutedSessionState>();
  let nextSessionNumber = 1;
  let selectedSessionId: TerminalSessionId | undefined;
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

  const isBusy = (state: RoutedSessionState) =>
    !state.closed && !state.exited && state.session.hasForegroundChildProcess();
  const hasBusySession = () => [...sessions.values()].some(isBusy);

  const tabSelected = (payload?: unknown) => {
    if (!isTerminalSessionReference(payload)) {
      reject("ipc", "invalid-payload");
      return;
    }
    if (!routedSession(payload.sessionId)) return;
    selectedSessionId = payload.sessionId;
    options.onSessionSelected(payload.sessionId);
  };

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
        onExit(exit, reportedLaunchKind) {
          if (disposed) return;
          const state = sessions.get(sessionId);
          if (state) state.exited = true;
          else exitedBeforeRegistration = true;
          if (!options.webContents.isDestroyed()) {
            options.webContents.send(terminalIpc.exit, { sessionId, ...exit });
          }
          options.onSessionExit(exit, {
            sessionId,
            launchKind:
              state?.session.launchKind ??
              reportedLaunchKind ??
              "default-shell",
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
    } catch (cause) {
      if (windowId !== undefined)
        writeWindowEvent({
          name: "pty.exit",
          windowId,
          outcome: "spawn-failure",
          code: null,
          durationMs: elapsedMilliseconds(startedAt),
        });
      const launchKind =
        cause instanceof LocalTerminalSessionStartError
          ? cause.launchKind
          : "default-shell";
      options.onSessionStartError({
        launchKind,
        liveSessions: countLiveSessions(),
      });
      throw new Error(
        launchKind === "explicit-command"
          ? "The requested command could not be started"
          : "The Default Shell could not be started",
      );
    }

    sessions.set(sessionId, {
      session: createdSession,
      ...(rendererConfiguration.terminalSurface === "restty"
        ? {
            resttyFontConfiguration: Object.freeze({
              ...(rendererConfiguration.fontFamily === undefined
                ? {}
                : { fontFamily: rendererConfiguration.fontFamily }),
              fontLineHeight: rendererConfiguration.fontLineHeight,
            }),
          }
        : {}),
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
    } else {
      options.onSessionStarted(sessionId, createdSession.fallbackTitle);
    }
    return sessionId;
  };
  const configuration = (payload?: unknown) => {
    if (payload !== undefined) {
      reject("ipc", "invalid-payload");
      throw new TypeError("Invalid User Configuration payload");
    }
    if (disposed) throw new Error("Terminal IPC controller is disposed");
    return rendererConfiguration;
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
    useClipboard(
      () => options.writeClipboardText(payload),
      options.onClipboardError,
      undefined,
    );
  };
  const readClipboardText = (payload?: unknown) => {
    if (payload !== undefined) {
      reject("clipboard", "invalid-payload");
      throw new TypeError("Invalid clipboard read payload");
    }
    return useClipboard(
      options.readClipboardText,
      options.onClipboardError,
      "",
    );
  };
  const confirmPaste = async (payload?: unknown) => {
    if (!isNonemptyClipboardText(payload) || !requiresProtectedPaste(payload)) {
      reject("clipboard", "invalid-payload");
      throw new TypeError("Invalid Protected Paste payload");
    }
    return confirmClipboardPaste(options, payload);
  };
  const showClipboardContextMenu = (payload?: unknown) => {
    if (payload === undefined) options.showClipboardContextMenu();
    else reject("clipboard", "invalid-payload");
  };
  const fontData = async (payload?: unknown) => {
    const family = rendererConfiguration.fontFamily;
    if (payload !== family) {
      reject("ipc", "invalid-payload");
      throw new TypeError(
        "Terminal Font request does not match the active configured family",
      );
    }
    if (disposed) throw new Error("Terminal IPC controller is disposed");
    if (fontRequestInFlight) {
      reject("ipc", "invalid-payload");
      throw new Error("A Terminal Font request is already in progress");
    }
    fontRequestInFlight = true;
    try {
      const loaded = await loadTerminalFontData(family);
      if (disposed || rendererConfiguration.fontFamily !== family)
        throw new Error("Terminal Font request was superseded");
      return loaded;
    } finally {
      fontRequestInFlight = false;
    }
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
    if (!isTerminalSessionTitle(payload)) {
      reject("title", "invalid-payload");
      return;
    }
    if (!routedSession(payload.sessionId)) return;
    options.onTitleRequest(payload.sessionId, payload.title);
  };
  const bell = (payload?: unknown) => {
    if (!isTerminalSessionReference(payload)) {
      reject("ipc", "invalid-payload");
      return;
    }
    if (!routedSession(payload.sessionId)) return;
    options.onBell(payload.sessionId);
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
    applyConfiguration(configuration) {
      if (disposed || options.webContents.isDestroyed()) return;
      rendererConfiguration = Object.freeze({ ...configuration });
      options.webContents.send(
        terminalIpc.configurationUpdate,
        rendererConfiguration,
      );
    },
    start,
    input,
    resize,
    close,
    tabSelected,
    hasBusySelectedSession() {
      const selected = selectedSessionId
        ? sessions.get(selectedSessionId)
        : undefined;
      return selected ? isBusy(selected) : hasBusySession();
    },
    hasBusySession,
    writeClipboardText,
    readClipboardText,
    confirmPaste,
    showClipboardContextMenu,
    title,
    bell,
    openExternalLink,
    snippets,
    fontData,
    activeResttySurfaceFontConfigurations() {
      return Object.freeze(
        [...sessions.values()].flatMap((state) =>
          state.exited || state.resttyFontConfiguration === undefined
            ? []
            : [state.resttyFontConfiguration],
        ),
      );
    },
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
