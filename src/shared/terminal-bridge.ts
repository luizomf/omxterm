import type { TerminalExit, TerminalSize } from "./terminal-contract";

export interface TerminalBridge {
  start(): Promise<void>;
  input(data: string): void;
  resize(size: TerminalSize): void;
  close(): void;
  onOutput(listener: (data: string) => void): () => void;
  onExit(listener: (exit: TerminalExit) => void): () => void;
}

declare global {
  interface Window {
    readonly omxterm: {
      readonly terminal: TerminalBridge;
    };
  }
}
