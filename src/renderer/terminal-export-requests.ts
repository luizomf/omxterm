import {
  terminalExportRequest,
  type TerminalExportKind,
  type TerminalExportRequest,
} from "../shared/terminal-contract";

export interface TerminalExportOptions {
  readonly subscribeToExportRequests?: (
    listener: (kind: TerminalExportKind) => void,
  ) => () => void;
  readonly saveTerminalExport?: (
    request: TerminalExportRequest,
  ) => Promise<void>;
}

// The text is read now, before any dialog, from the pane whose menu offered
// it. Main reports every outcome, including text over the export limit.
export function subscribeToExportRequests(
  options: TerminalExportOptions,
  exportText: (kind: TerminalExportKind) => string | undefined,
  blocked: () => boolean,
): (() => void) | undefined {
  return options.subscribeToExportRequests?.((kind) => {
    const text = blocked() ? undefined : exportText(kind);
    if (text !== undefined)
      void options
        .saveTerminalExport?.(terminalExportRequest(kind, text))
        .catch(() => {});
  });
}
