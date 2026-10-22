import type {
  TerminalExit,
  TerminalClipboardAction,
  TerminalFontZoom,
  TerminalSessionId,
  TerminalSize,
  TerminalTabCommand,
} from "./terminal-contract";
import type { WindowChromeCommand, WindowChromeState } from "./window-chrome";
import type { TerminalRendererConfiguration } from "./user-configuration";
import type { TerminalFontData } from "./terminal-font-data";
import type { TerminalSnippetsResponse } from "./terminal-snippets";
import type { LocalImageActivation, LocalImageData } from "./local-image";
import type { TerminalLaunchSpec } from "./terminal-launch";
import type {
  SavedSessionsDocument,
  SessionDefinition,
  SessionFolder,
} from "./saved-sessions";
import type { SessionFileChoice } from "./session-ipc";
import type { HighlightSettings } from "./highlight-settings";
import type { CommandDefinition, CommandLibraryDocument } from "./commands";
import type { BackupRequest } from "./backup-ipc";

export interface CommandsBridge {
  list(): Promise<CommandLibraryDocument>;
  save(command: CommandDefinition): Promise<CommandDefinition>;
  delete(id: string): Promise<void>;
  setFavorite(id: string, on: boolean): Promise<void>;
  setHidden(id: string, on: boolean): Promise<void>;
  availability(tools: readonly string[]): Promise<Record<string, boolean>>;
  platform(): Promise<string>;
  onChanged(listener: (document: CommandLibraryDocument) => void): () => void;
  onToggleSidebar(listener: () => void): () => void;
}

export interface HighlightsBridge {
  get(): Promise<HighlightSettings>;
  save(settings: HighlightSettings): Promise<HighlightSettings>;
  onChanged(listener: (settings: HighlightSettings) => void): () => void;
}

export interface SessionsBridge {
  list(): Promise<SavedSessionsDocument>;
  saveSession(session: unknown): Promise<SessionDefinition>;
  deleteSession(id: string): Promise<void>;
  saveFolder(folder: unknown): Promise<SessionFolder>;
  deleteFolder(id: string): Promise<void>;
  importSshConfig(): Promise<{ readonly added: number }>;
  importFile(): Promise<{ readonly added: number } | null>;
  exportFile(): Promise<boolean>;
  chooseFile(kind: SessionFileChoice): Promise<string | null>;
  onChanged(listener: (document: SavedSessionsDocument) => void): () => void;
  onToggleSidebar(listener: () => void): () => void;
  // The SSH target passed with --ssh, once, to the first window that asks.
  startupConnection(): Promise<string | null>;
}

export interface TerminalBridge {
  configuration(): Promise<TerminalRendererConfiguration>;
  fontData(family?: string): Promise<TerminalFontData>;
  snippets(): Promise<TerminalSnippetsResponse>;
  onSnippetsToggle(listener: () => void): () => void;
  onTabBarToggle(listener: () => void): () => void;
  onTitleBarToggle(listener: () => void): () => void;
  windowChrome(command: WindowChromeCommand): void;
  onWindowChrome(listener: (state: WindowChromeState) => void): () => void;
  onConfigurationUpdate(
    listener: (configuration: TerminalRendererConfiguration) => void,
  ): () => void;
  retainSurface(configurationId: string): Promise<string>;
  releaseSurface(surfaceId: string): void;
  start(
    surfaceId?: string,
    launch?: TerminalLaunchSpec,
  ): Promise<TerminalSessionId>;
  input(sessionId: TerminalSessionId, data: string): void;
  resize(sessionId: TerminalSessionId, size: TerminalSize): void;
  close(sessionId: TerminalSessionId, reason?: "rendering-failure"): void;
  title(sessionId: TerminalSessionId, request: string): void;
  bell(sessionId: TerminalSessionId): void;
  openExternalLink(url: string): void;
  loadLocalImage(source?: LocalImageActivation): Promise<LocalImageData | null>;
  onLocalImageOpen(listener: () => void): () => void;
  acknowledgeOutput(sessionId: TerminalSessionId, end: number): void;
  onOutput(
    listener: (sessionId: TerminalSessionId, data: string, end: number) => void,
  ): () => void;
  onExit(
    listener: (sessionId: TerminalSessionId, exit: TerminalExit) => void,
  ): () => void;
  onTabCommand(listener: (command: TerminalTabCommand) => void): () => void;
  onTabTitle(
    listener: (sessionId: TerminalSessionId, title: string) => void,
  ): () => void;
  notifyTabSelection(
    sessionId: TerminalSessionId,
    tabSessionIds?: readonly TerminalSessionId[],
  ): void;
  confirmBroadcast(targetCount: number): Promise<boolean>;
  reportWorkingDirectory(sessionId: TerminalSessionId, uri: string): void;
  syncTabTitle(sessionId: TerminalSessionId): void;
  notifyTabsEmpty(reason?: "rendering-failure"): void;
  onFontZoom(listener: (command: TerminalFontZoom) => void): () => void;
  writeClipboardText(text: string): Promise<void>;
  readClipboardText(): Promise<string>;
  droppedFilePathInsertion(files: readonly File[]): string;
  confirmPaste(text: string): Promise<boolean>;
  requestClipboardContextMenu(): void;
  onClipboardAction(
    listener: (action: TerminalClipboardAction) => void,
  ): () => void;
}

// Settings backup: the renderer supplies passphrases; main chooses the
// files and never returns their paths or contents.
export interface BackupBridge {
  create(passphrase: string): Promise<boolean>;
  choose(): Promise<boolean>;
  restore(passphrase: string): Promise<{ readonly restored: number }>;
  onRequest(listener: (kind: BackupRequest) => void): () => void;
}

declare global {
  interface Window {
    readonly omxterm: {
      readonly terminal: TerminalBridge;
      readonly sessions: SessionsBridge;
      readonly highlights: HighlightsBridge;
      readonly commands: CommandsBridge;
      readonly backup: BackupBridge;
    };
  }
}
