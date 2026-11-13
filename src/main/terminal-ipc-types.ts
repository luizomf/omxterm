import type {
  TerminalExit,
  TerminalSessionId,
  TerminalWriteReceipt,
  TerminalContextMenuRequest,
  TerminalContextMenuTarget,
  TerminalExportSaveRequest,
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
  readonly onSurfaceFontConfigurationsChanged?: () => void;
  readonly mirrorWindowFocused?: () => boolean;
  readonly mirrorWindowAvailable?: () => boolean;
  readonly onMirrorStopped?: (
    lease: string,
    reason: "stopped" | "unavailable" | "write-failed",
  ) => void;
  readonly homeDirectory?: string;
  readonly initialLayout?: () =>
    import("../shared/terminal-layout").InitialLayout | null;
  readonly consumeLayoutLaunch?: (token: string) => string;
  /** A reopened pane's saved folder that was unavailable (it started at home). */
  readonly rememberedLayoutFolder?: (token: string) => string | undefined;
  readonly backgroundTransparency?: () => number;
  // workingDirectory is an inherited, already validated local directory.
  readonly createSession: (
    callbacks: SessionCallbacks,
    workingDirectory?: string,
    ssh?: import("./ssh-terminal-launch").SshLaunch,
    restored?: boolean,
    sessionId?: TerminalSessionId,
    // The Surface's measured grid, validated at the IPC boundary.
    size?: import("../shared/terminal-contract").TerminalSize,
  ) => LocalTerminalSession;
  readonly consumeSshLaunch?: (
    token: string,
  ) => import("./ssh-terminal-launch").SshLaunch;
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
  readonly onSessionSelected: (sessionId: TerminalSessionId | null) => void;
  readonly onSettingsSelected?: () => void;
  readonly onSessionTitleSync?: (sessionId: TerminalSessionId) => void;
  readonly writeClipboardText: (text: string) => void;
  readonly readClipboardText: () => string;
  readonly confirmPaste: (text: string) => Promise<boolean>;
  readonly onClipboardError?: () => void;
  readonly showClipboardContextMenu: (
    request?: TerminalContextMenuRequest,
  ) => void;
  readonly exportText?: (
    request: TerminalExportSaveRequest,
    isOwnerAlive: () => boolean,
  ) => Promise<void>;
  readonly onTitleRequest: (
    sessionId: TerminalSessionId,
    request: string,
  ) => void;
  // inSelectedTab: the session is one of the selected tab's panes.
  readonly onBell: (
    sessionId: TerminalSessionId,
    inSelectedTab: boolean,
  ) => void;
  readonly onNotification?: (
    sessionId: TerminalSessionId,
    notification: import("../shared/terminal-attention").TerminalNotification,
    inSelectedTab: boolean,
  ) => void;
  readonly onUserInteraction: () => void;
  /** Something that can change the saved layout happened (ADR 0047). */
  readonly onLayoutActivity?: () => void;
  readonly openExternalLink: (url: string) => Promise<void>;
  readonly onExternalLinkOpenError: () => void;
  readonly loadSnippets: () => Promise<TerminalSnippetsResponse>;
  readonly loadLocalImage: (
    request: LocalImageRequest,
    abortSignal: AbortSignal,
  ) => Promise<LocalImageData | null>;
}

/** One live session as the agent API sees it (ADR 0052). */
export interface AgentSessionSnapshot {
  readonly sessionId: TerminalSessionId;
  readonly focused: boolean;
  readonly cols?: number;
  readonly rows?: number;
}

export interface AgentSessionObserver {
  output(sessionId: TerminalSessionId): void;
  acknowledged(sessionId: TerminalSessionId): void;
  exited(sessionId: TerminalSessionId, exitCode: number): void;
}

/**
 * The window's live sessions for the agent API, which never sees the
 * controller's IPC. Agent bytes enter only through write().
 */
export interface AgentSessionPort {
  sessions(): readonly AgentSessionSnapshot[];
  position(
    sessionId: TerminalSessionId,
  ): { readonly sent: number; readonly acknowledged: number } | undefined;
  write(sessionId: TerminalSessionId, data: string): TerminalWriteReceipt;
  observe(observer: AgentSessionObserver): () => void;
}

export interface TerminalIpcController {
  readonly agentSessions?: AgentSessionPort;
  readonly mirrorTyping?: ReturnType<
    typeof import("./mirror-input-lease").createMirrorInputLease<LocalTerminalSession>
  >;
  applyConfiguration(configuration: TerminalRendererConfiguration): void;
  applyFullScreen(fullScreen: boolean): void;
  hasBusySelectedSession(): boolean;
  reportedWorkingDirectory?(sessionId: TerminalSessionId): string | undefined;
  layoutDirectory?(
    sessionId: TerminalSessionId,
  ): import("../shared/terminal-layout").LayoutDirectory;
  /** Reads the shells' working directories before a layout capture. */
  refreshDirectories?(): Promise<void>;
  claimContextMenuTarget(target: TerminalContextMenuTarget): boolean;
  hasBusyFocusedSession(): boolean;
  hasBusySession(): boolean;
  hasBusySessionAmong(sessionIds: readonly TerminalSessionId[]): boolean;
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
