import type { TerminalExit, TerminalSize } from "../shared/terminal-contract";

export interface TerminalSessionHandlers {
  readonly onOutput: (data: string) => void;
  readonly onExit: (exit: TerminalExit) => void;
}

export interface TerminalSessionAdapter {
  start(handlers: TerminalSessionHandlers): Promise<void>;
  write(data: string): void;
  resize(size: TerminalSize): void;
  close(): void;
}
