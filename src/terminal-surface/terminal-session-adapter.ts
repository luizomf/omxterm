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
  start(handlers: TerminalSessionHandlers): Promise<void>;
  write(data: string): void;
  writeTracked?(data: string): Promise<TerminalWriteReceipt>;
  resize(size: TerminalSize): void;
  close(reason?: "rendering-failure"): void;
}
