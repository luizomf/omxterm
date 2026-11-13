import type { AgentWindowCommand } from "../shared/agent-access";
import {
  displayAccelerator,
  keyboardInputForAccelerator,
  TERMINAL_ACTION_NAMES,
  terminalDefaultKeybinds,
  terminalActionForKeyboardInput,
  type TerminalActionName,
  type TerminalKeybinds,
} from "../shared/terminal-keybinds";

/**
 * What an agent's press of a shortcut does (ADR 0052, keyboard parity):
 * - run: in the window, on the pane the press names (`command`), or in main
 *   on the granted window itself (`native`);
 * - refused: the grant toggle, which only the user turns on or off;
 * - not-yet: UI the agent can't read yet, or an action that would reach past
 *   this window; `why` finishes the answer's sentence.
 * Every action is listed, so a new one can't run for agents by default.
 */
export type AgentShortcut =
  | {
      readonly kind: "run";
      readonly command: AgentWindowCommand;
      // A close checks for Busy Sessions first: a pane's, or its whole tab's.
      readonly closes?: "pane" | "tab";
    }
  | { readonly kind: "run"; readonly native: AgentNativeAction }
  | { readonly kind: "refused" }
  | { readonly kind: "not-yet"; readonly why: string };

/** What main does to the granted window itself, or for it. */
export type AgentNativeAction =
  "full-screen" | "new-window" | "close-window" | "quit";

const run = (
  command: AgentWindowCommand,
  closes?: "pane" | "tab",
): AgentShortcut => ({ kind: "run", command, ...(closes ? { closes } : {}) });
const native = (action: AgentNativeAction): AgentShortcut => ({
  kind: "run",
  native: action,
});
const notYet = (why: string): AgentShortcut => ({ kind: "not-yet", why });
const opensUi = notYet("opens UI that agents can't use yet.");
const select = (position: number) => run({ action: "select", position });

export const AGENT_SHORTCUTS: Readonly<
  Record<TerminalActionName, AgentShortcut>
> = {
  newTab: run({ action: "new" }),
  closeTab: run({ action: "close" }, "tab"),
  nextTab: run({ action: "next" }),
  previousTab: run({ action: "previous" }),
  selectTab1: select(1),
  selectTab2: select(2),
  selectTab3: select(3),
  selectTab4: select(4),
  selectTab5: select(5),
  selectTab6: select(6),
  selectTab7: select(7),
  selectTab8: select(8),
  selectTab9: select(9),
  splitRight: run({ action: "split", direction: "right" }),
  splitDown: run({ action: "split", direction: "down" }),
  closePane: run({ action: "close-pane" }, "pane"),
  focusNextPane: run({ action: "focus-pane", target: "next" }),
  focusPreviousPane: run({ action: "focus-pane", target: "previous" }),
  focusPaneLeft: run({ action: "focus-pane", target: "left" }),
  focusPaneRight: run({ action: "focus-pane", target: "right" }),
  focusPaneUp: run({ action: "focus-pane", target: "up" }),
  focusPaneDown: run({ action: "focus-pane", target: "down" }),
  swapPaneLeft: run({ action: "swap-pane", direction: "left" }),
  swapPaneRight: run({ action: "swap-pane", direction: "right" }),
  swapPaneUp: run({ action: "swap-pane", direction: "up" }),
  swapPaneDown: run({ action: "swap-pane", direction: "down" }),
  equalizePanes: run({ action: "equalize-panes" }),
  toggleAgentAccess: { kind: "refused" },
  zoomIn: run({ action: "zoom", zoom: "in" }),
  zoomOut: run({ action: "zoom", zoom: "out" }),
  actualSize: run({ action: "zoom", zoom: "reset" }),
  // A pane program can already write the clipboard (OSC 52).
  copy: run({ action: "copy" }),
  selectAll: run({ action: "select-all" }),
  toggleTabBar: run({ action: "toggle-tab-bar" }),
  toggleTitleBar: run({ action: "toggle-title-bar" }),
  toggleFullScreen: native("full-screen"),
  // The new window starts ungranted, like every window.
  newWindow: native("new-window"),
  closeWindow: native("close-window"),
  quit: native("quit"),
  paste: notYet(
    "brings in the clipboard, which comes from outside this window, and can ask the user to confirm; type text with send.",
  ),
  commandPalette: opensUi,
  find: opensUi,
  toggleSnippets: opensUi,
  toggleAuxiliaryPanel: opensUi,
  moveAuxiliaryPanel: notYet("moves a panel that agents can't use yet."),
  toggleFiles: opensUi,
  toggleSshConnect: opensUi,
  toggleMirrorTyping: opensUi,
  saveLayout: notYet(
    "replaces the user's saved layout through an extension, which agents can't use yet.",
  ),
  reloadConfig: notYet(
    "applies the configuration file to every window, not just this one.",
  ),
};

/** The action a press chord runs in a window with these effective shortcuts. */
export function agentShortcutAction(
  keybinds: TerminalKeybinds,
  chord: string,
  platform: string,
): TerminalActionName | undefined {
  const input = keyboardInputForAccelerator(chord, platform);
  return input && terminalActionForKeyboardInput(keybinds, input, platform);
}

/**
 * What `keys` tells an agent: every action `press` runs, refuses or answers
 * "not yet", with the chord the window's shortcuts give it (null when the user
 * unbound it).
 */
export function agentShortcutList(window: {
  readonly keybinds?: () => TerminalKeybinds;
  readonly platform?: string;
}) {
  const platform = window.platform ?? process.platform;
  const keybinds = window.keybinds?.() ?? terminalDefaultKeybinds(platform);
  return TERMINAL_ACTION_NAMES.map((action) => {
    const { kind } = AGENT_SHORTCUTS[action];
    const accelerator = keybinds[action];
    return {
      action,
      chord: (accelerator && displayAccelerator(accelerator, platform)) || null,
      status: kind === "run" ? ("available" as const) : kind,
    };
  });
}
