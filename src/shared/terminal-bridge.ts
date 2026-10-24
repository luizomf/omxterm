import type { AboutBridge } from "./about";
import type {
  TerminalExit,
  TerminalClipboardAction,
  TerminalContextMenuRequest,
  TerminalExportKind,
  TerminalExportRequest,
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

export interface TerminalBridge {
  configuration(): Promise<TerminalRendererConfiguration>;
  fontData(family?: string): Promise<TerminalFontData>;
  snippets(): Promise<TerminalSnippetsResponse>;
  onSnippetsToggle(listener: () => void): () => void;
  onTabBarToggle(listener: () => void): () => void;
  onFind(listener: () => void): () => void;
  onTitleBarToggle(listener: () => void): () => void;
  windowChrome(command: WindowChromeCommand): void;
  onWindowChrome(listener: (state: WindowChromeState) => void): () => void;
  onConfigurationUpdate(
    listener: (configuration: TerminalRendererConfiguration) => void,
  ): () => void;
  retainSurface(configurationId: string): Promise<string>;
  releaseSurface(surfaceId: string): void;
  start(surfaceId?: string): Promise<TerminalSessionId>;
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
  notifyTabSelection(sessionId: TerminalSessionId): void;
  syncTabTitle(sessionId: TerminalSessionId): void;
  notifyTabsEmpty(reason?: "rendering-failure"): void;
  onFontZoom(listener: (command: TerminalFontZoom) => void): () => void;
  writeClipboardText(text: string): Promise<void>;
  readClipboardText(): Promise<string>;
  droppedFilePathInsertion(files: readonly File[]): string;
  confirmPaste(text: string): Promise<boolean>;
  requestClipboardContextMenu(request: TerminalContextMenuRequest): void;
  onExportRequest(listener: (kind: TerminalExportKind) => void): () => void;
  saveTerminalExport(request: TerminalExportRequest): Promise<void>;
  onClipboardAction(
    listener: (action: TerminalClipboardAction) => void,
  ): () => void;
}

declare global {
  interface Window {
    readonly omxterm: {
      readonly terminal: TerminalBridge;
      readonly about: AboutBridge;
    };
  }
}
