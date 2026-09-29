import type {
  TerminalExit,
  TerminalSessionId,
} from "../shared/terminal-contract";
import {
  isNonemptyClipboardText,
  isTerminalSessionInput,
  isTerminalSessionClose,
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
import type {
  IpcEvent,
  IpcHandler,
  IpcListener,
  IpcMainPort,
  TerminalIpcController,
  TerminalIpcControllerOptions,
  TerminalIpcRouter,
  TerminalSurfaceFontConfiguration,
  TrustedWebContents,
} from "./terminal-ipc-types";
export type {
  IpcEvent,
  IpcMainPort,
  TerminalIpcController,
  TerminalIpcControllerOptions,
  TerminalIpcRouter,
  TerminalSessionEndContext,
  TerminalSessionStartErrorContext,
  TerminalSurfaceFontConfiguration,
  TrustedWebContents,
} from "./terminal-ipc-types";
import type { OperationalEventLog } from "./operational-events";
import { isTerminalRendererConfiguration } from "../shared/user-configuration";
import type { TerminalFontData } from "../shared/terminal-font-data";
import type { LocalImageData } from "../shared/local-image";
import { createFontDataRequest } from "./terminal-font-data-request";
import { createRendererConfigurationState } from "./terminal-renderer-configuration";
import { createLocalImageIpcBoundary } from "./local-image-ipc";
export { isValidExternalLink } from "./external-link";
import {
  acknowledgeTerminalOutput,
  requestExternalLink,
  type RejectBoundary,
} from "./terminal-ipc-boundaries";
import {
  createTerminalOutputFlow,
  type TerminalOutputFlow,
} from "./terminal-output-flow";

interface RoutedTerminalIpcController extends TerminalIpcController {
  configuration(payload?: unknown): TerminalRendererConfiguration;
  start(payload?: unknown): TerminalSessionId;
  input(payload?: unknown): void;
  resize(payload?: unknown): void;
  acknowledgeOutput(payload?: unknown): void;
  close(payload?: unknown): void;
  tabSelected(payload?: unknown): void;
  tabsEmpty(payload?: unknown): void;
  writeClipboardText(payload?: unknown): void;
  readClipboardText(payload?: unknown): string;
  confirmPaste(payload?: unknown): Promise<boolean>;
  showClipboardContextMenu(payload?: unknown): void;
  title(payload?: unknown): void;
  bell(payload?: unknown): void;
  openExternalLink(payload?: unknown): void;
  localImage(payload?: unknown): Promise<LocalImageData | null>;
  snippets(payload?: unknown): Promise<TerminalSnippetsResponse>;
  fontData(payload?: unknown): Promise<TerminalFontData>;
  activeTerminalSurfaceFontConfigurations(): readonly TerminalSurfaceFontConfiguration[];
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
  const acknowledgeOutput: IpcListener = (event, payload) =>
    route(event, (controller) => controller.acknowledgeOutput(payload));
  const close: IpcListener = (event, payload) =>
    route(event, (controller) => controller.close(payload));
  const tabSelected: IpcListener = (event, payload) =>
    route(event, (controller) => controller.tabSelected(payload));
  const tabsEmpty: IpcListener = (event, payload) =>
    route(event, (controller) => controller.tabsEmpty(payload));
  const title: IpcListener = (event, payload) =>
    route(event, (controller) => controller.title(payload));
  const bell: IpcListener = (event, payload) =>
    route(event, (controller) => controller.bell(payload));
  const externalLink: IpcListener = (event, payload) =>
    route(event, (controller) => controller.openExternalLink(payload));
  const localImage: IpcHandler = async (event, payload) => {
    const controller = controllerFor(event);
    if (!controller) {
      operationalEvents?.write({
        name: "boundary.rejected",
        boundary: "ipc",
        reason: "untrusted-sender",
      });
      throw new Error("Rejected local image IPC from an untrusted sender");
    }
    return controller.localImage(payload);
  };
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
  ipcMain.on(terminalIpc.outputAck, acknowledgeOutput);
  ipcMain.on(terminalIpc.close, close);
  ipcMain.on(terminalIpc.tabSelected, tabSelected);
  ipcMain.on(terminalIpc.tabsEmpty, tabsEmpty);
  ipcMain.on(terminalIpc.title, title);
  ipcMain.on(terminalIpc.bell, bell);
  ipcMain.on(terminalIpc.externalLink, externalLink);
  ipcMain.handle(terminalIpc.localImage, localImage);
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
    activeTerminalSurfaceFontConfigurations() {
      return Object.freeze(
        [...controllers.values()].flatMap((controller) =>
          controller.activeTerminalSurfaceFontConfigurations(),
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
      ipcMain.removeListener(terminalIpc.outputAck, acknowledgeOutput);
      ipcMain.removeListener(terminalIpc.close, close);
      ipcMain.removeListener(terminalIpc.tabSelected, tabSelected);
      ipcMain.removeListener(terminalIpc.tabsEmpty, tabsEmpty);
      ipcMain.removeListener(terminalIpc.title, title);
      ipcMain.removeListener(terminalIpc.bell, bell);
      ipcMain.removeListener(terminalIpc.externalLink, externalLink);
      ipcMain.removeHandler(terminalIpc.localImage);
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
  readonly terminalSurfaceFontConfiguration?: TerminalSurfaceFontConfiguration;
  readonly outputFlow: TerminalOutputFlow;
  closed: boolean;
  closeReason?: "rendering-failure";
  exited: boolean;
}

function sessionEndContext(
  sessionId: TerminalSessionId,
  state: RoutedSessionState | undefined,
  reportedLaunchKind: TerminalSessionLaunchKind | undefined,
  liveSessions: number,
) {
  return {
    sessionId,
    launchKind:
      state?.session.launchKind ?? reportedLaunchKind ?? "default-shell",
    closeRequested: state?.closed ?? false,
    ...(state?.closeReason ? { closeReason: state.closeReason } : {}),
    liveSessions,
  };
}

function activeTerminalSurfaceFontConfigurations(
  sessions: ReadonlyMap<TerminalSessionId, RoutedSessionState>,
): readonly TerminalSurfaceFontConfiguration[] {
  return Object.freeze(
    [...sessions.values()].flatMap((state) =>
      state.exited || state.terminalSurfaceFontConfiguration === undefined
        ? []
        : [state.terminalSurfaceFontConfiguration],
    ),
  );
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
  const rendererConfiguration = createRendererConfigurationState(
    options.configuration,
    options.initialFullScreen ?? false,
    options.webContents,
    options.backgroundTransparency,
  );
  let fontConfigurationGeneration = 0;
  const sessions = new Map<TerminalSessionId, RoutedSessionState>();
  let nextSessionNumber = 1;
  let selectedSessionId: TerminalSessionId | undefined;
  const windowId = options.windowId;
  const writeWindowEvent = (
    event: Parameters<OperationalEventLog["write"]>[0],
  ) => {
    if (windowId !== undefined) operationalEvents?.write(event);
  };
  const reject: RejectBoundary = (boundary, reason) =>
    operationalEvents?.write({ name: "boundary.rejected", boundary, reason });

  const closeSession = (
    sessionId: TerminalSessionId,
    reason?: "rendering-failure",
  ) => {
    const state = sessions.get(sessionId);
    if (!state || state.closed) return;
    state.closed = true;
    if (reason) state.closeReason = reason;
    state.session.close();
  };

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
    let ownerLostBeforeRegistration = false;
    const outputFlow = createTerminalOutputFlow();
    let createdSession: LocalTerminalSession;
    try {
      createdSession = options.createSession({
        onOutput(data) {
          if (disposed) return;
          if (options.webContents.isDestroyed()) {
            if (sessions.has(sessionId)) closeSession(sessionId);
            else ownerLostBeforeRegistration = true;
            return;
          }
          const outputEnd = outputFlow.record(data);
          if (outputEnd === undefined) {
            closeSession(sessionId);
            return;
          }
          try {
            options.webContents.send(terminalIpc.output, {
              sessionId,
              data,
              end: outputEnd,
            });
          } catch {
            if (sessions.has(sessionId)) closeSession(sessionId);
            else ownerLostBeforeRegistration = true;
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
          options.onSessionExit(
            exit,
            sessionEndContext(
              sessionId,
              state,
              reportedLaunchKind,
              countLiveSessions(sessions),
            ),
          );
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
        liveSessions: countLiveSessions(sessions),
      });
      throw new Error(
        launchKind === "explicit-command"
          ? "The requested command could not be started"
          : "The Default Shell could not be started",
      );
    }

    outputFlow.bind(createdSession);
    sessions.set(sessionId, {
      session: createdSession,
      outputFlow,
      terminalSurfaceFontConfiguration: Object.freeze({
        ...(rendererConfiguration.current().fontFamily === undefined
          ? {}
          : { fontFamily: rendererConfiguration.current().fontFamily }),
        fontLineHeight: rendererConfiguration.current().fontLineHeight,
      }),
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
    if (disposed || ownerLostBeforeRegistration) {
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
    return rendererConfiguration.effective();
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
  const acknowledgeOutput = (payload?: unknown) =>
    acknowledgeTerminalOutput(
      payload,
      (sessionId) => sessions.get(sessionId),
      reject,
    );
  const close = (payload?: unknown) => {
    if (!isTerminalSessionClose(payload)) {
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
    closeSession(payload.sessionId, payload.reason);
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
  const fontData = createFontDataRequest({
    family: () => rendererConfiguration.current().fontFamily,
    generation: () => fontConfigurationGeneration,
    isDisposed: () => disposed,
    load: loadTerminalFontData,
    reject: () => reject("ipc", "invalid-payload"),
  });
  const localImageBoundary = createLocalImageIpcBoundary({
    load: options.loadLocalImage,
    isOwnerLost: () => disposed || options.webContents.isDestroyed(),
    reject: () => reject("ipc", "invalid-payload"),
  });
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
  const openExternalLink = (payload?: unknown) =>
    requestExternalLink(payload, options, operationalEvents, reject);

  return {
    configuration,
    applyConfiguration(configuration) {
      if (disposed || options.webContents.isDestroyed()) return;
      if (
        rendererConfiguration.current().fontFamily !== configuration.fontFamily
      )
        fontConfigurationGeneration += 1;
      rendererConfiguration.apply(configuration);
    },
    applyFullScreen(fullScreen) {
      if (!disposed && !options.webContents.isDestroyed())
        rendererConfiguration.applyFullScreen(fullScreen);
    },
    start,
    input,
    resize,
    acknowledgeOutput,
    close,
    tabSelected,
    tabsEmpty: emptyTabsNotification(options, reject, () => disposed),
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
    localImage: localImageBoundary.request,
    snippets,
    fontData,
    activeTerminalSurfaceFontConfigurations: () =>
      activeTerminalSurfaceFontConfigurations(sessions),
    dispose() {
      if (disposed) return;
      disposed = true;
      localImageBoundary.dispose();
      unregister();
      for (const sessionId of [...sessions.keys()]) closeSession(sessionId);
    },
  };
}

function countLiveSessions(
  sessions: ReadonlyMap<TerminalSessionId, RoutedSessionState>,
): number {
  return [...sessions.values()].filter((state) => !state.exited).length;
}

function emptyTabsNotification(
  options: TerminalIpcControllerOptions,
  reject: RejectBoundary,
  isDisposed: () => boolean,
): (payload?: unknown) => void {
  return (payload) => {
    if (payload !== undefined && payload !== "rendering-failure") {
      reject("ipc", "invalid-payload");
      return;
    }
    if (!isDisposed() && !options.webContents.isDestroyed())
      options.onTabsEmpty?.(payload);
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
