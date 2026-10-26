import {
  MAX_TERMINAL_EXPORT_BYTES,
  utf8ByteLength,
  type TerminalContextMenuRequest,
  type TerminalContextMenuTarget,
  type TerminalExportContext,
  type TerminalExportKind,
  type TerminalExportSaveRequest,
} from "../shared/terminal-contract";
import type {
  TerminalClipboard,
  TerminalSurface,
} from "../terminal-surface/terminal-surface";
import type { TerminalPane } from "./terminal-panes";

// Only the host speaks the targeted wire protocol; portable fields/Surfaces do not.
export interface TerminalHostClipboard extends Omit<
  TerminalClipboard,
  "requestContextMenu"
> {
  requestContextMenu(request?: TerminalContextMenuRequest): void;
}

// One popup owns one exact pane/Surface, shared by clipboard, close and export.
// Its token correlates main's notification; it grants no authorization.
export function createPaneContextMenu(options: {
  readonly focusedPane: () => TerminalPane | undefined;
  readonly disposed: () => boolean;
  readonly canInteract: () => boolean;
}) {
  let captured:
    | {
        target: TerminalContextMenuTarget;
        pane: TerminalPane;
        surface: TerminalSurface;
        kind: TerminalExportKind;
      }
    | undefined;
  let nextMenuId = 0;
  const take = (target: TerminalContextMenuTarget) => {
    if (
      !captured ||
      captured.target.menuId !== target.menuId ||
      captured.target.sessionId !== target.sessionId
    )
      return undefined;
    const original = captured;
    captured = undefined;
    const { pane, surface } = original;
    return !options.disposed() &&
      !pane.removed &&
      !pane.ended &&
      !pane.tab.removed &&
      pane === options.focusedPane() &&
      pane.surface === surface
      ? original
      : undefined;
  };
  return {
    capture(
      pane: TerminalPane,
      hasSelection: boolean,
    ): TerminalContextMenuTarget | undefined {
      captured = undefined;
      const sessionId = pane.adapter.sessionId();
      if (
        options.disposed() ||
        !options.canInteract() ||
        pane.removed ||
        pane.ended ||
        !pane.surface ||
        pane !== options.focusedPane() ||
        sessionId === undefined ||
        nextMenuId === Number.MAX_SAFE_INTEGER
      )
        return undefined;
      const target = { sessionId, menuId: ++nextMenuId };
      captured = {
        target,
        pane,
        surface: pane.surface,
        kind: hasSelection ? "selection" : "content",
      };
      return target;
    },
    take(target: TerminalContextMenuTarget): TerminalPane | undefined {
      const original = take(target);
      return options.canInteract() ? original?.pane : undefined;
    },
    exportRequest(
      context: TerminalExportContext,
      allowed: boolean,
    ): TerminalExportSaveRequest | undefined {
      const original = take(context.target);
      if (
        !original ||
        !allowed ||
        !options.canInteract() ||
        original.kind !== context.kind
      )
        return undefined;
      const text = original.surface.exportText(context.kind);
      return utf8ByteLength(text) > MAX_TERMINAL_EXPORT_BYTES
        ? { notice: "too-large" }
        : { kind: context.kind, text };
    },
    fieldClipboard(
      clipboard?: TerminalHostClipboard,
    ): TerminalClipboard | undefined {
      if (!clipboard) return undefined;
      return {
        ...clipboard,
        requestContextMenu(request) {
          captured = undefined;
          if (request.target === "field") clipboard.requestContextMenu();
        },
      };
    },
    selectionChanged() {
      if (captured && captured.pane !== options.focusedPane())
        captured = undefined;
    },
    dispose() {
      captured = undefined;
    },
  };
}
