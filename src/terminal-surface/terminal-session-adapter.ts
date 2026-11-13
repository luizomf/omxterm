import type {
  TerminalExit,
  TerminalSize,
  TerminalWriteReceipt,
} from "../shared/terminal-contract";

export interface TerminalSessionHandlers {
  readonly onOutput: (data: string) => void;
  readonly onExit: (exit: TerminalExit) => void;
}

export interface TerminalSessionAdapter {
  // size is the grid the Surface already measured, if any, so the session
  // starts at its real size instead of waiting for the first resize.
  start(handlers: TerminalSessionHandlers, size?: TerminalSize): Promise<void>;
  write(data: string): void;
  writeTracked?(data: string): Promise<TerminalWriteReceipt>;
  resize(size: TerminalSize): void;
  close(reason?: "rendering-failure"): void;
}
