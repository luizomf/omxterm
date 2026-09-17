import type { LocalTerminalSession } from "./local-terminal-session";

export interface TerminalOutputFlow {
  bind(session: LocalTerminalSession): void;
  record(data: string): number | undefined;
  acknowledge(end: number): boolean;
}

export function createTerminalOutputFlow(): TerminalOutputFlow {
  let session: LocalTerminalSession | undefined;
  let sentEnd = 0;
  let acknowledgedEnd = 0;

  return {
    bind(value) {
      if (session) throw new Error("Terminal output flow is already bound");
      session = value;
    },
    record(data) {
      sentEnd += Buffer.byteLength(data, "utf8");
      return Number.isSafeInteger(sentEnd) ? sentEnd : undefined;
    },
    acknowledge(end) {
      if (
        !session ||
        !Number.isSafeInteger(end) ||
        end <= acknowledgedEnd ||
        end > sentEnd
      )
        return false;
      const progress = end - acknowledgedEnd;
      if (session.acknowledgeOutput?.(progress) !== true) return false;
      acknowledgedEnd = end;
      return true;
    },
  };
}
