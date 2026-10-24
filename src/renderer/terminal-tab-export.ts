import {
  MAX_TERMINAL_EXPORT_BYTES,
  utf8ByteLength,
  type TerminalContextMenuInvocation,
  type TerminalExportContext,
  type TerminalExportSaveRequest,
} from "../shared/terminal-contract";
import type {
  TerminalClipboard,
  TerminalSurface,
  TerminalSurfaceOptions,
} from "../terminal-surface/terminal-surface";

// One pending menu per window, never a registry of terminal text. The tab owner
// supplies a closure resolving only its original, still-live selected Surface.
export function createTerminalTabExport() {
  let nextContextId = 0;
  let pending:
    | {
        context: TerminalExportContext;
        surface: () => TerminalSurface | undefined;
      }
    | undefined;
  return {
    invalidate() {
      pending = undefined;
    },
    fieldClipboard(clipboard: TerminalClipboard): TerminalClipboard {
      return {
        ...clipboard,
        requestContextMenu(request) {
          pending = undefined;
          if (request.target === "field") clipboard.requestContextMenu(request);
        },
      };
    },
    clipboardOptions(
      clipboard: TerminalClipboard | undefined,
      surface: () => TerminalSurface | undefined,
    ): Pick<TerminalSurfaceOptions, "clipboard"> {
      if (!clipboard) return {};
      return {
        clipboard: {
          ...clipboard,
          requestContextMenu(request) {
            if (!surface()) return;
            pending = undefined;
            let invocation: TerminalContextMenuInvocation;
            if (request.target === "field") invocation = request;
            else {
              if (nextContextId === Number.MAX_SAFE_INTEGER) return;
              const contextId = ++nextContextId;
              pending = {
                context: {
                  contextId,
                  kind: request.hasSelection ? "selection" : "content",
                },
                surface,
              };
              invocation = { ...request, contextId };
            }
            clipboard.requestContextMenu(invocation);
          },
        },
      };
    },
    request(
      context: TerminalExportContext,
      allowed: boolean,
    ): TerminalExportSaveRequest | undefined {
      const original = pending;
      if (!original || original.context.contextId !== context.contextId)
        return undefined;
      pending = undefined;
      if (!allowed || original.context.kind !== context.kind) return undefined;
      const text = original.surface()?.exportText(context.kind);
      if (text === undefined) return undefined;
      return utf8ByteLength(text) > MAX_TERMINAL_EXPORT_BYTES
        ? { notice: "too-large" }
        : { kind: context.kind, text };
    },
  };
}
