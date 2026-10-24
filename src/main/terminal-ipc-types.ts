import type {
  TerminalContextMenuRequest,
  TerminalExit,
  TerminalExportRequest,
  TerminalSessionId,
} from "../shared/terminal-contract";
import type { TerminalRendererConfiguration } from "../shared/user-configuration";
import type { TerminalSnippetsResponse } from "../shared/terminal-snippets";
import type { LocalImageData, LocalImageRequest } from "../shared/local-image";
import type {
  LocalTerminalSession,
  TerminalSessionLaunchKind,
  TerminalResizeFailureReason,
} from "./local-terminal-session";

export interface TrustedWebContents {
  readonly mainFrame: object;
  isDestroyed(): boolean;
  send(channel: string, payload: unknown): void;
}

export interface IpcEvent {
  readonly sender: TrustedWebContents;
  readonly senderFrame: object | null;
}

export type IpcListener = (event: IpcEvent, payload?: unknown) => void;
export type IpcHandler = (
  event: IpcEvent,
  payload?: unknown,
) => Promise<unknown> | unknown;

export interface IpcMainPort {
  handle(channel: string, handler: IpcHandler): void;
  removeHandler(channel: string): void;
  on(channel: string, listener: IpcListener): void;
  removeListener(channel: string, listener: IpcListener): void;
}

export interface SessionCallbacks {
  readonly onOutput: (data: string) => void;
  readonly onResizeFailure?: (reason: TerminalResizeFailureReason) => void;
  readonly onExit: (
    exit: TerminalExit,
    launchKind?: TerminalSessionLaunchKind,
  ) => void;
}

export interface TerminalSessionEndContext {
  readonly sessionId: TerminalSessionId;
  readonly launchKind: TerminalSessionLaunchKind;
  readonly closeRequested: boolean;
  readonly closeReason?: "rendering-failure";
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
  readonly initialFullScreen?: boolean;
  readonly backgroundTransparency?: () => number;
  readonly createSession: (callbacks: SessionCallbacks) => LocalTerminalSession;
  readonly onSessionStartError: (
    context: TerminalSessionStartErrorContext,
  ) => void;
  readonly onSessionExit: (
    exit: TerminalExit,
    context: TerminalSessionEndContext,
  ) => void;
  readonly onTabsEmpty?: (reason?: "rendering-failure") => void;
  readonly onSessionStarted: (
    sessionId: TerminalSessionId,
    fallbackTitle?: string,
  ) => void;
  readonly onSessionSelected: (sessionId: TerminalSessionId) => void;
  readonly onSessionTitleSync?: (sessionId: TerminalSessionId) => void;
  readonly writeClipboardText: (text: string) => void;
  readonly readClipboardText: () => string;
  readonly confirmPaste: (text: string) => Promise<boolean>;
  readonly onClipboardError?: () => void;
  readonly showClipboardContextMenu: (
    request: TerminalContextMenuRequest,
  ) => void;
  readonly saveTerminalExport?: (
    request: TerminalExportRequest,
  ) => Promise<void>;
  readonly onTitleRequest: (
    sessionId: TerminalSessionId,
    request: string,
  ) => void;
  readonly onBell: (sessionId: TerminalSessionId) => void;
  readonly onUserInteraction: () => void;
  readonly openExternalLink: (url: string) => Promise<void>;
  readonly onExternalLinkOpenError: () => void;
  readonly loadSnippets: () => Promise<TerminalSnippetsResponse>;
  readonly loadLocalImage: (
    request: LocalImageRequest,
    abortSignal: AbortSignal,
  ) => Promise<LocalImageData | null>;
}

export interface TerminalIpcController {
  applyConfiguration(configuration: TerminalRendererConfiguration): void;
  applyFullScreen(fullScreen: boolean): void;
  hasBusySelectedSession(): boolean;
  hasBusySession(): boolean;
  dispose(): void;
}

export interface TerminalSurfaceFontConfiguration {
  readonly fontFamily?: string;
  readonly fontLineHeight: number;
}

export interface TerminalIpcRouter {
  isTrustedSender(event: IpcEvent): boolean;
  registerController(
    options: TerminalIpcControllerOptions,
  ): TerminalIpcController;
  applyConfiguration(configuration: TerminalRendererConfiguration): void;
  activeTerminalSurfaceFontConfigurations(): readonly TerminalSurfaceFontConfiguration[];
  dispose(): void;
}
