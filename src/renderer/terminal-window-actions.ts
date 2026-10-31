import type { TerminalBridge } from "../shared/terminal-bridge";
import type {
  TerminalClipboardAction,
  TerminalFontZoom,
  TerminalTabCommand,
} from "../shared/terminal-contract";
import type { TerminalTabs } from "./terminal-tabs";

export interface TerminalWindowActionSubscriptions {
  readonly subscribeToTabCommands?: (
    listener: (command: TerminalTabCommand) => void,
  ) => () => void;
  readonly subscribeToFontZoom?: (
    listener: (command: TerminalFontZoom) => void,
  ) => () => void;
  readonly subscribeToClipboardActions?: TerminalBridge["onClipboardAction"];
  readonly subscribeToTabBarToggle?: (listener: () => void) => () => void;
  readonly subscribeToAuxiliaryPanelToggle?: (
    listener: () => void,
  ) => () => void;
  readonly subscribeToFind?: (listener: () => void) => () => void;
}

// Lifecycle delivery and the explicit extension admission acknowledgement must
// still arrive when blocked; the latter replies denied rather than retaining a permit.
const MODAL_COMPETING_TAB_ACTIONS = new Set<TerminalTabCommand["action"]>([
  "new",
  "next",
  "previous",
  "select",
  "split",
  "focus-pane",
  "equalize-panes",
]);

// Terminal-directed actions are ignored while a preview or About owns input.
export function subscribeToGuardedActions(
  options: TerminalWindowActionSubscriptions,
  tabs: TerminalTabs,
  blocked: () => boolean,
  panelClipboard: (action: TerminalClipboardAction) => boolean,
  modalClipboard: (action: TerminalClipboardAction) => boolean = () => false,
): () => void {
  const subscriptions = [
    () =>
      options.subscribeToFontZoom?.((command) => {
        if (!blocked()) tabs.zoom(command);
      }),
    () =>
      options.subscribeToClipboardActions?.((action, target) => {
        // A terminal popup never migrates into panel or modal editing.
        if (!target && modalClipboard(action)) return;
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
    () =>
      options.subscribeToTabCommands?.((command) => {
        if (blocked() && MODAL_COMPETING_TAB_ACTIONS.has(command.action))
          return;
        tabs.handleCommand(command);
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
