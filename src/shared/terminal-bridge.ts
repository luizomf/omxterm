import type {
  TerminalExit,
  TerminalClipboardAction,
  TerminalFontZoom,
  TerminalSize,
} from "./terminal-contract";
import type { TerminalRendererConfiguration } from "./user-configuration";
import type { TerminalSnippetsResponse } from "./terminal-snippets";

export interface TerminalBridge {
  configuration(): Promise<TerminalRendererConfiguration>;
  snippets(): Promise<TerminalSnippetsResponse>;
  onSnippetsToggle(listener: () => void): () => void;
  start(): Promise<void>;
  input(data: string): void;
  resize(size: TerminalSize): void;
  close(): void;
  title(request: string): void;
  bell(): void;
  openExternalLink(url: string): void;
  onOutput(listener: (data: string) => void): () => void;
  onExit(listener: (exit: TerminalExit) => void): () => void;
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
