import type { EventEmitter } from "node:events";

export interface DiagnosticPty {
  pid: number;
  writes: string[];
  output: string;
  exited: boolean;
}

export interface InsertDiagnosticSnapshot {
  classification: string;
  expected: string;
  selectedIndex: number;
  sessions: {
    pid: number;
    selected: boolean;
    writes: string[];
    writesTruncated: boolean;
    outputTail: string;
    outputTailTruncated: boolean;
  }[];
  events: {
    kind: string;
    senderId?: number | null;
    requestId?: number;
    ok?: boolean;
  }[];
  eventsTruncated: boolean;
  observedHandlerIds: (number | null)[];
  observationUnavailable: boolean;
}

export function startInsertDiagnostic(options: {
  app: EventEmitter;
  ipcMain: EventEmitter;
  ptys: DiagnosticPty[];
}): {
  checkpoint(options: {
    session: DiagnosticPty;
    expected: string;
    viewId: number;
    coreId: number;
    focusBefore?: object;
  }): void;
  snapshot(): InsertDiagnosticSnapshot;
  dispose(): void;
};
