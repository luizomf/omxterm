import type { AboutInfo, AboutLink } from "./about";
import type { FilePeek } from "./file-peek";
import type {
  AssistantEvent,
  AssistantMessage,
  AssistantModelInfo,
  AssistantProvider,
  AssistantSettings,
  AssistantState,
} from "./assistant";
import type {
  DirectoryListing,
  FileBrowserHome,
  FileOperationResult,
  FileTransfer,
  PaneLocation,
  TransferEvent,
} from "./file-browser";
import type {
  CapturedKeyPress,
  PreferencesPatch,
  PreferencesFile,
  PreferencesSaveResult,
  PreferencesSnapshot,
} from "./preferences";
import type { TerminalActionName } from "./terminal-keybinds";
import type {
  TerminalExit,
  TerminalClipboardAction,
  TerminalContextMenuRequest,
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
import type { WorkspacePlan, WorkspaceSnapshot } from "./workspace";

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

export interface FilesBridge {
  home(): Promise<FileBrowserHome>;
  list(directory: string): Promise<DirectoryListing>;
  // A local directory for an OSC 7 file:// URI, or null.
  resolve(uri: string): Promise<string | null>;
  open(filePath: string): Promise<FileOperationResult>;
  reveal(filePath: string): Promise<FileOperationResult>;
  createFolder(parent: string, name: string): Promise<FileOperationResult>;
  createFile(parent: string, name: string): Promise<FileOperationResult>;
  rename(filePath: string, name: string): Promise<FileOperationResult>;
  trash(paths: readonly string[]): Promise<FileOperationResult>;
  transfer(
    mode: FileTransfer,
    sources: readonly string[],
    destination: string,
  ): Promise<FileOperationResult>;
  onToggle(listener: () => void): () => void;
  // A hover preview of a local file or folder, or null when it is missing.
  peek(filePath: string): Promise<FilePeek | null>;
  // Remote (SFTP) files of an SSH pane, named by its session id.
  location(sessionId: TerminalSessionId): Promise<PaneLocation>;
  remoteHome(sessionId: TerminalSessionId): Promise<string>;
  remoteList(
    sessionId: TerminalSessionId,
    directory: string,
  ): Promise<DirectoryListing>;
  remoteCreateFolder(
    sessionId: TerminalSessionId,
    parent: string,
    name: string,
  ): Promise<FileOperationResult>;
  remoteCreateFile(
    sessionId: TerminalSessionId,
    parent: string,
    name: string,
  ): Promise<FileOperationResult>;
  remoteRename(
    sessionId: TerminalSessionId,
    filePath: string,
    name: string,
  ): Promise<FileOperationResult>;
  remoteMove(
    sessionId: TerminalSessionId,
    paths: readonly string[],
    directory: string,
  ): Promise<FileOperationResult>;
  remoteDelete(
    sessionId: TerminalSessionId,
    paths: readonly string[],
  ): Promise<FileOperationResult>;
  // These ask for a local folder or files in a native dialog.
  remoteDownload(
    sessionId: TerminalSessionId,
    paths: readonly string[],
  ): Promise<FileOperationResult>;
  remoteUpload(
    sessionId: TerminalSessionId,
    directory: string,
  ): Promise<FileOperationResult>;
  remoteEdit(
    sessionId: TerminalSessionId,
    filePath: string,
  ): Promise<FileOperationResult>;
  cancelTransfer(id: string): Promise<void>;
  onTransfer(listener: (event: TransferEvent) => void): () => void;
}

export interface AssistantBridge {
  state(): Promise<AssistantState>;
  saveSettings(settings: AssistantSettings): Promise<AssistantState>;
  // null removes the stored key.
  setKey(
    provider: AssistantProvider,
    key: string | null,
  ): Promise<AssistantState>;
  models(provider: AssistantProvider): Promise<readonly AssistantModelInfo[]>;
  // Opens the provider's API key page in the default browser.
  openKeyPage(provider: AssistantProvider): Promise<void>;
  // The number of models the provider lists, proving the connection works.
  test(provider: AssistantProvider): Promise<number>;
  // Resolves when the answer ends; its text arrives through onEvent.
  chat(requestId: string, messages: readonly AssistantMessage[]): Promise<void>;
  cancel(requestId: string): Promise<void>;
  history(): Promise<readonly AssistantMessage[]>;
  saveHistory(messages: readonly AssistantMessage[]): Promise<void>;
  onEvent(listener: (event: AssistantEvent) => void): () => void;
  onChanged(listener: (state: AssistantState) => void): () => void;
  onToggle(listener: () => void): () => void;
}

export interface PreferencesBridge {
  get(): Promise<PreferencesSnapshot>;
  save(patch: PreferencesPatch): Promise<PreferencesSaveResult>;
  reset(): Promise<PreferencesSaveResult>;
  // config.json as text for the built-in editor, and saving it whole after
  // the same validation as a reload.
  readFile(): Promise<PreferencesFile>;
  writeFile(text: string): Promise<PreferencesSaveResult>;
  // While on, every key press goes to onCapturedKey listeners instead of
  // keybinds, menus or the terminal (main ends it after 30 seconds).
  captureShortcut(active: boolean): Promise<void>;
  onCapturedKey(listener: (key: CapturedKeyPress) => void): () => void;
  onOpen(listener: () => void): () => void;
}

export interface HighlightsBridge {
  get(): Promise<HighlightSettings>;
  save(settings: HighlightSettings): Promise<HighlightSettings>;
  onChanged(listener: (settings: HighlightSettings) => void): () => void;
  onOpenEditor(listener: () => void): () => void;
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
  // A live pane's current local directory (OSC 7, else the process) and
  // whether a program runs in its shell; null for an ended pane.
  sessionDirectory(sessionId: TerminalSessionId): Promise<{
    readonly directory: string | null;
    readonly busy: boolean;
  } | null>;
  onSnippetsToggle(listener: () => void): () => void;
  onCommandPalette(listener: () => void): () => void;
  // Runs an application action, as its keyboard shortcut would.
  runAction(action: TerminalActionName): void;
  // Save Output to File: main's request, and the text to save (the answer
  // is the chosen file's name, or null when cancelled).
  onSaveOutputRequest(listener: () => void): () => void;
  // Reopens one tab (its workspace snapshot) in a new window.
  detachTab(snapshot: WorkspaceSnapshot): Promise<boolean>;
  saveOutput(text: string): Promise<string | null>;
  // Shows the main menu at a window position, below the toolbar button.
  openMainMenu(position: { readonly x: number; readonly y: number }): void;
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
  // Workspace restore: this window's layout for main to save, and the plan
  // it opens with (null for an ordinary start).
  reportWorkspace(snapshot: WorkspaceSnapshot): void;
  workspacePlan(): Promise<WorkspacePlan | null>;
  syncTabTitle(sessionId: TerminalSessionId): void;
  notifyTabsEmpty(reason?: "rendering-failure"): void;
  onFontZoom(listener: (command: TerminalFontZoom) => void): () => void;
  writeClipboardText(text: string): Promise<void>;
  readClipboardText(): Promise<string>;
  droppedFilePathInsertion(files: readonly File[]): string;
  confirmPaste(text: string): Promise<boolean>;
  requestClipboardContextMenu(request?: TerminalContextMenuRequest): void;
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

// The About dialog: application facts and main's own fixed links.
export interface AboutBridge {
  info(): Promise<AboutInfo>;
  openLink(link: AboutLink): Promise<void>;
  onOpen(listener: () => void): () => void;
}

declare global {
  interface Window {
    readonly omxterm: {
      readonly terminal: TerminalBridge;
      readonly sessions: SessionsBridge;
      readonly highlights: HighlightsBridge;
      readonly preferences: PreferencesBridge;
      readonly files: FilesBridge;
      readonly assistant: AssistantBridge;
      readonly commands: CommandsBridge;
      readonly backup: BackupBridge;
      readonly about: AboutBridge;
    };
  }
}
