import type {
  TerminalClipboard,
  TerminalContextMenuDescriptor,
} from "../terminal-surface/terminal-surface";
import type { TerminalHostClipboard } from "./terminal-pane-context-menu";

// Forward a field popup request to the field clipboard, which invalidates any
// captured terminal popup first. The owner may appear after the caller, so the
// field clipboard is resolved on first use and reused.
export function forwardFieldContextMenu(
  clipboard: TerminalHostClipboard,
  fieldClipboard: (
    clipboard?: TerminalHostClipboard,
  ) => TerminalClipboard | undefined,
): (request: TerminalContextMenuDescriptor) => void {
  let field: TerminalClipboard | undefined;
  return (request) =>
    (field ??= fieldClipboard(clipboard))?.requestContextMenu(request);
}
