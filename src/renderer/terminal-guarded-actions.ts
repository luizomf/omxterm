import type { TerminalClipboardAction } from "../shared/terminal-contract";
import { subscribeToExportRequests } from "./terminal-export-requests";
import type { TerminalTabs } from "./terminal-tabs";
import type { TerminalWindowPageOptions } from "./terminal-window-host";

// Terminal-directed actions are ignored while a preview or About owns input.
export function subscribeToGuardedActions(
  options: Pick<
    TerminalWindowPageOptions,
    | "subscribeToFontZoom"
    | "subscribeToClipboardActions"
    | "subscribeToTabBarToggle"
    | "subscribeToFind"
    | "subscribeToExportRequests"
    | "saveTerminalExport"
  >,
  tabs: TerminalTabs,
  blocked: () => boolean,
  editBlocked: (action: TerminalClipboardAction) => void,
  panelClipboard: (action: TerminalClipboardAction) => boolean,
): () => void {
  const removals = [
    options.subscribeToFontZoom?.((command) => {
      if (!blocked()) tabs.zoom(command);
    }),
    // While an overlay owns input, editing goes to its focused field, never
    // to the terminal.
    options.subscribeToClipboardActions?.((action) => {
      if (blocked()) editBlocked(action);
      else if (!panelClipboard(action)) tabs.clipboardAction(action);
    }),
    options.subscribeToTabBarToggle?.(() => {
      if (!blocked()) tabs.toggleTabBar();
    }),
    options.subscribeToFind?.(() => {
      if (!blocked()) tabs.find();
    }),
    subscribeToExportRequests(options, tabs.exportText, blocked),
  ];
  return () => {
    for (const remove of removals) remove?.();
  };
}
