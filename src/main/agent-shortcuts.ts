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
 * - run: the tab or pane action, on the pane the press names;
 * - refused: the grant toggle, which only the user turns on or off;
 * - not-yet: UI the agent can't read yet (Command Palette, Find, and the
 *   Snippets, Files and SSH Connect panels);
 * - key: the chord still goes to the pane as a key (#1052 decides these).
 * Every action is listed, so a new one can't run for agents by default.
 */
export type AgentShortcut =
  | {
      readonly kind: "run";
      readonly command: AgentWindowCommand;
      // A close checks for Busy Sessions first: a pane's, or its whole tab's.
      readonly closes?: "pane" | "tab";
    }
  | { readonly kind: "refused" | "not-yet" | "key" };

const run = (
  command: AgentWindowCommand,
  closes?: "pane" | "tab",
): AgentShortcut => ({ kind: "run", command, ...(closes ? { closes } : {}) });
const key: AgentShortcut = { kind: "key" };
const notYet: AgentShortcut = { kind: "not-yet" };
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
  commandPalette: notYet,
  find: notYet,
  quit: key,
  copy: key,
  paste: key,
  selectAll: key,
  newWindow: key,
  closeWindow: key,
  zoomIn: key,
  zoomOut: key,
  actualSize: key,
  toggleFullScreen: key,
  toggleSnippets: notYet,
  toggleFiles: notYet,
  toggleSshConnect: notYet,
  toggleMirrorTyping: key,
  saveLayout: key,
  toggleTabBar: key,
  toggleAuxiliaryPanel: key,
  moveAuxiliaryPanel: key,
  toggleTitleBar: key,
  reloadConfig: key,
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
 * unbound it). Actions whose chords still go to the pane as keys aren't there.
 */
export function agentShortcutList(window: {
  readonly keybinds?: () => TerminalKeybinds;
  readonly platform?: string;
}) {
  const platform = window.platform ?? process.platform;
  const keybinds = window.keybinds?.() ?? terminalDefaultKeybinds(platform);
  return TERMINAL_ACTION_NAMES.flatMap((action) => {
    const { kind } = AGENT_SHORTCUTS[action];
    if (kind === "key") return [];
    const accelerator = keybinds[action];
    return [
      {
        action,
        chord:
          (accelerator && displayAccelerator(accelerator, platform)) || null,
        status: kind === "run" ? ("available" as const) : kind,
      },
    ];
  });
}
