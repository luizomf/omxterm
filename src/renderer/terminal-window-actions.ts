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
}

// Terminal-directed actions are ignored while a preview or About owns input.
export function subscribeToGuardedActions(
  options: TerminalWindowActionSubscriptions,
  tabs: TerminalTabs,
  blocked: () => boolean,
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
        if (blocked()) return;
        if (target) tabs.clipboardAction(action, target);
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
