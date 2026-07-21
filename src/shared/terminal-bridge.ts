import type {
  TerminalExit,
  TerminalClipboardAction,
  TerminalFontZoom,
  TerminalSessionId,
  TerminalSize,
  TerminalTabCommand,
} from "./terminal-contract";
import type { TerminalRendererConfiguration } from "./user-configuration";
import type { TerminalSnippetsResponse } from "./terminal-snippets";

export interface TerminalBridge {
  configuration(): Promise<TerminalRendererConfiguration>;
  snippets(): Promise<TerminalSnippetsResponse>;
  onSnippetsToggle(listener: () => void): () => void;
  start(): Promise<TerminalSessionId>;
  input(sessionId: TerminalSessionId, data: string): void;
  resize(sessionId: TerminalSessionId, size: TerminalSize): void;
  close(sessionId: TerminalSessionId): void;
  title(sessionId: TerminalSessionId, request: string): void;
  bell(sessionId: TerminalSessionId): void;
  openExternalLink(url: string): void;
  onOutput(
    listener: (sessionId: TerminalSessionId, data: string) => void,
  ): () => void;
  onExit(
    listener: (sessionId: TerminalSessionId, exit: TerminalExit) => void,
  ): () => void;
  onTabCommand(listener: (command: TerminalTabCommand) => void): () => void;
  onTabTitle(
    listener: (sessionId: TerminalSessionId, title: string) => void,
  ): () => void;
  notifyTabSelection(sessionId: TerminalSessionId): void;
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

declare global {
  interface Window {
    readonly omxterm: {
      readonly terminal: TerminalBridge;
    };
  }
}
