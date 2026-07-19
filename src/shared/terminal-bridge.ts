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
  title(request: string): void;
  bell(): void;
  openExternalLink(url: string): void;
  onOutput(
    listener: (sessionId: TerminalSessionId, data: string) => void,
  ): () => void;
  onExit(
    listener: (sessionId: TerminalSessionId, exit: TerminalExit) => void,
  ): () => void;
  onTabCommand(listener: (command: TerminalTabCommand) => void): () => void;
  onFontZoom(listener: (command: TerminalFontZoom) => void): () => void;
  writeClipboardText(text: string): Promise<void>;
  readClipboardText(): Promise<string>;
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
