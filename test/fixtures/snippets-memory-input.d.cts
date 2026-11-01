export interface MemoryEvent {
  sequence: number;
  ns: string;
  kind: string;
  data?: string;
  lineBefore?: string;
  lineAfter?: string;
  line?: string;
  draft?: string;
  pending?: boolean;
  requested?: boolean;
  reason?: "unexpected-line" | "line-bound";
  matches?: boolean;
  delayMs?: number;
}
export interface MemoryDump {
  classification: string;
  nonce: string;
  pid: number;
  delayMs: number;
  overflow: boolean;
  events: MemoryEvent[];
  outcomeText: string | null;
  error: string | null;
}
export interface MemoryResult {
  classification: string;
  nonce: string;
  pid: number;
  initial: { kind: "receipt" | "timeout" | "error"; error: string | null };
  beforeCollection: unknown;
  collection: {
    complete: boolean;
    events?: number;
    callbacks?: number;
    error?: string;
  };
}
export function memoryInput(options: {
  value: string | undefined;
  platform: string;
  evidence: string | undefined;
  captures: Array<string | undefined>;
}): string | undefined;
export function validateDump(
  dump: unknown,
  outcomeText: string,
  pid: number,
  nonce: string,
): { events: number; callbacks: number };
export function observeFirstInsert(options: {
  observe(): Promise<void>;
  snapshot(): unknown;
  evidence: string;
  pid: number;
  nonce: string;
  waitMs?: number;
}): Promise<MemoryResult>;
