import type { TerminalBridge } from "../shared/terminal-bridge";
import type {
  TerminalClipboardAction,
  TerminalFontZoom,
} from "../shared/terminal-contract";
import type { TerminalTabs } from "./terminal-tabs";

export interface TerminalWindowActionSubscriptions {
  readonly subscribeToFontZoom?: (
    listener: (command: TerminalFontZoom) => void,
  ) => () => void;
  readonly subscribeToClipboardActions?: TerminalBridge["onClipboardAction"];
  readonly subscribeToTabBarToggle?: (listener: () => void) => () => void;
  readonly subscribeToFind?: (listener: () => void) => () => void;
  readonly subscribeToExportRequests?: TerminalBridge["onExportRequest"];
  readonly saveTerminalExport?: TerminalBridge["saveTerminalExport"];
}

// Terminal-directed actions are ignored while a preview or About owns input.
export function subscribeToGuardedActions(
  options: TerminalWindowActionSubscriptions,
  tabs: TerminalTabs,
  blocked: () => boolean,
  editBlocked: (action: TerminalClipboardAction) => void,
  panelClipboard: (action: TerminalClipboardAction) => boolean,
): () => void {
  const subscriptions = [
    () =>
      options.subscribeToFontZoom?.((command) => {
        if (!blocked()) tabs.zoom(command);
      }),
    () =>
      options.subscribeToClipboardActions?.((action, target) => {
        // A terminal popup never migrates into panel or modal editing.
        if (target) {
          // The shared resolver consumes even a currently blocked interaction.
          tabs.clipboardAction(action, target);
        } else if (blocked()) editBlocked(action);
        else if (!panelClipboard(action)) tabs.clipboardAction(action);
      }),
    () =>
      options.subscribeToTabBarToggle?.(() => {
        if (!blocked()) tabs.toggleTabBar();
      }),
    () =>
      options.subscribeToFind?.(() => {
        if (!blocked()) tabs.find();
      }),
    () =>
      options.subscribeToExportRequests?.((context) => {
        // Consume first, even when blocked. Snapshot once before any async save.
        const request = tabs.exportRequest(context, !blocked());
        if (request) void options.saveTerminalExport?.(request).catch(() => {});
      }),
  ];
  const removals: Array<(() => void) | undefined> = [];
  const remove = () => {
    for (const unsubscribe of removals) unsubscribe?.();
  };
  try {
    for (const subscribe of subscriptions) removals.push(subscribe());
  } catch (error) {
    remove();
    throw error;
  }
  return remove;
}
