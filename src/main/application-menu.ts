import type { MenuItemConstructorOptions } from "electron";
import type {
  TerminalPaneTarget,
  TerminalSplitDirection,
} from "../shared/terminal-contract";
import type {
  TerminalActionName,
  TerminalKeybinds,
} from "../shared/terminal-keybinds";

export interface TerminalApplicationMenuActions {
  readonly newWindow: () => void;
  readonly closeSelectedWindow: () => void;
  readonly newTabInSelectedWindow: () => void;
  readonly closeSelectedTab: () => void;
  readonly selectNextTab: () => void;
  readonly selectPreviousTab: () => void;
  readonly selectTabInSelectedWindow: (position: number) => void;
  readonly requestQuit: () => void;
  readonly toggleSelectedFullScreen: () => void;
  readonly toggleSelectedAlwaysOnTop: () => void;
  readonly toggleSelectedDevTools: () => void;
  readonly zoomInSelectedWindow: () => void;
  readonly zoomOutSelectedWindow: () => void;
  readonly resetSelectedWindowZoom: () => void;
  readonly copySelectedTerminal: () => void;
  readonly pasteSelectedTerminal: () => void;
  readonly selectAllSelectedTerminal: () => void;
  readonly toggleSelectedSnippets: () => void;
  readonly toggleSelectedTabBar: () => void;
  readonly toggleSelectedTitleBar: () => void;
  readonly reloadUserConfiguration: () => void;
  readonly openLocalImage: () => void;
  readonly splitSelectedPane: (direction: TerminalSplitDirection) => void;
  readonly closeSelectedPane: () => void;
  readonly focusPaneInSelectedWindow: (target: TerminalPaneTarget) => void;
  readonly toggleSelectedPaneMaximized: () => void;
  readonly equalizeSelectedPanes: () => void;
  readonly toggleSelectedBroadcast: () => void;
  readonly toggleSelectedSessions: () => void;
  readonly toggleSelectedCommands: () => void;
  readonly toggleSelectedCommandPalette: () => void;
  readonly findInSelectedWindow: () => void;
  readonly backUpSettings: () => void;
  readonly restoreSettings: () => void;
  readonly toggleOutputHighlighting?: () => void;
  readonly toggleRestoreWorkspace?: () => void;
  readonly openHighlightRules?: () => void;
  readonly openPreferences?: () => void;
}

export interface TerminalApplicationMenuState {
  readonly outputHighlighting?: boolean;
  readonly restoreWorkspace?: boolean;
}

export function terminalApplicationMenuTemplate(
  applicationName: string,
  actions: TerminalApplicationMenuActions,
  keybinds: TerminalKeybinds,
  state: TerminalApplicationMenuState = {},
): MenuItemConstructorOptions[] {
  return [
    {
      label: applicationName,
      submenu: [
        { role: "about" },
        ...(actions.openPreferences
          ? [
              { type: "separator" as const },
              {
                label: "Preferences…",
                accelerator: keybinds.preferences,
                click: actions.openPreferences,
              },
            ]
          : []),
        ...(actions.toggleRestoreWorkspace
          ? [
              { type: "separator" as const },
              {
                label: "Restore Windows at Startup",
                type: "checkbox" as const,
                checked: state.restoreWorkspace ?? false,
                click: actions.toggleRestoreWorkspace,
              },
            ]
          : []),
        { type: "separator" },
        {
          label: `Quit ${applicationName}`,
          accelerator: keybinds.quit,
          click: actions.requestQuit,
        },
      ],
    },
    {
      label: "Edit",
      submenu: [
        {
          label: "Copy",
          accelerator: keybinds.copy,
          click: actions.copySelectedTerminal,
        },
        {
          label: "Paste",
          accelerator: keybinds.paste,
          click: actions.pasteSelectedTerminal,
        },
        { type: "separator" },
        {
          label: "Select All",
          accelerator: keybinds.selectAll,
          click: actions.selectAllSelectedTerminal,
        },
        { type: "separator" },
        {
          label: "Find…",
          accelerator: keybinds.find,
          click: actions.findInSelectedWindow,
        },
      ],
    },
    {
      label: "File",
      submenu: [
        {
          label: "New Window",
          accelerator: keybinds.newWindow,
          click: actions.newWindow,
        },
        {
          label: "New Tab",
          accelerator: keybinds.newTab,
          click: actions.newTabInSelectedWindow,
        },
        { type: "separator" },
        {
          label: "Open Local Image…",
          click: actions.openLocalImage,
        },
        { type: "separator" },
        { label: "Back Up Settings…", click: actions.backUpSettings },
        { label: "Restore Settings…", click: actions.restoreSettings },
        { type: "separator" },
        {
          label: "Close Tab",
          accelerator: keybinds.closeTab,
          click: actions.closeSelectedTab,
        },
        {
          label: "Close Window",
          accelerator: keybinds.closeWindow,
          click: actions.closeSelectedWindow,
        },
      ],
    },
    {
      label: "View",
      submenu: [
        {
          label: "Zoom In",
          accelerator: keybinds.zoomIn,
          click: actions.zoomInSelectedWindow,
        },
        {
          label: "Zoom Out",
          accelerator: keybinds.zoomOut,
          click: actions.zoomOutSelectedWindow,
        },
        {
          label: "Actual Size",
          accelerator: keybinds.actualSize,
          click: actions.resetSelectedWindowZoom,
        },
        { type: "separator" },
        {
          label: "Command Palette…",
          accelerator: keybinds.commandPalette,
          click: actions.toggleSelectedCommandPalette,
        },
        {
          label: "Toggle Sessions",
          accelerator: keybinds.toggleSessions,
          click: actions.toggleSelectedSessions,
        },
        {
          label: "Toggle Commands",
          accelerator: keybinds.toggleCommands,
          click: actions.toggleSelectedCommands,
        },
        {
          label: "Toggle Snippets",
          accelerator: keybinds.toggleSnippets,
          click: actions.toggleSelectedSnippets,
        },
        ...(actions.toggleOutputHighlighting
          ? [
              {
                label: "Highlight Output",
                type: "checkbox" as const,
                checked: state.outputHighlighting ?? false,
                click: actions.toggleOutputHighlighting,
              },
            ]
          : []),
        ...(actions.openHighlightRules
          ? [
              {
                label: "Highlight Rules…",
                click: actions.openHighlightRules,
              },
            ]
          : []),
        {
          label: "Toggle Tab Bar",
          accelerator: keybinds.toggleTabBar,
          click: actions.toggleSelectedTabBar,
        },
        {
          label: "Toggle Title Bar",
          accelerator: keybinds.toggleTitleBar,
          click: actions.toggleSelectedTitleBar,
        },
        {
          label: "Reload User Configuration",
          accelerator: keybinds.reloadConfig,
          click: actions.reloadUserConfiguration,
        },
        {
          label: "Toggle Developer Tools",
          click: actions.toggleSelectedDevTools,
        },
        { type: "separator" },
        {
          label: "Toggle Full Screen",
          accelerator: keybinds.toggleFullScreen,
          click: actions.toggleSelectedFullScreen,
        },
      ],
    },
    terminalMenu(actions, keybinds),
    {
      label: "Window",
      submenu: [
        { role: "minimize" },
        {
          label: "Always on Top",
          click: actions.toggleSelectedAlwaysOnTop,
        },
        { type: "separator" },
        {
          label: "Show Next Tab",
          accelerator: keybinds.nextTab,
          click: actions.selectNextTab,
        },
        {
          label: "Show Previous Tab",
          accelerator: keybinds.previousTab,
          click: actions.selectPreviousTab,
        },
        {
          label: "Select Tab",
          submenu: Array.from({ length: 9 }, (_, index) => {
            const position = index + 1;
            return {
              label: `Tab ${position}`,
              accelerator: keybinds[`selectTab${position}` as SelectTabAction],
              click: () => actions.selectTabInSelectedWindow(position),
            };
          }),
        },
      ],
    },
  ];
}

type SelectTabAction = keyof TerminalKeybinds & `selectTab${number}`;

function terminalMenu(
  actions: TerminalApplicationMenuActions,
  keybinds: TerminalKeybinds,
): MenuItemConstructorOptions {
  const focus = (
    label: string,
    action: keyof TerminalKeybinds,
    target: TerminalPaneTarget,
  ): MenuItemConstructorOptions => ({
    label,
    accelerator: keybinds[action],
    click: () => actions.focusPaneInSelectedWindow(target),
  });
  return {
    label: "Terminal",
    submenu: [
      {
        label: "Split Right",
        accelerator: keybinds.splitRight,
        click: () => actions.splitSelectedPane("right"),
      },
      {
        label: "Split Down",
        accelerator: keybinds.splitDown,
        click: () => actions.splitSelectedPane("down"),
      },
      {
        label: "Close Pane",
        accelerator: keybinds.closePane,
        click: actions.closeSelectedPane,
      },
      { type: "separator" },
      {
        label: "Maximize or Restore Pane",
        accelerator: keybinds.toggleMaximizePane,
        click: actions.toggleSelectedPaneMaximized,
      },
      {
        label: "Equalize Panes",
        accelerator: keybinds.equalizePanes,
        click: actions.equalizeSelectedPanes,
      },
      {
        label: "Focus Pane",
        submenu: [
          focus("Next Pane", "focusNextPane", "next"),
          focus("Previous Pane", "focusPreviousPane", "previous"),
          { type: "separator" },
          focus("Left", "focusPaneLeft", "left"),
          focus("Right", "focusPaneRight", "right"),
          focus("Up", "focusPaneUp", "up"),
          focus("Down", "focusPaneDown", "down"),
        ],
      },
      { type: "separator" },
      {
        label: "Broadcast Input to Panes",
        accelerator: keybinds.toggleBroadcast,
        click: actions.toggleSelectedBroadcast,
      },
    ],
  };
}

// The keybind vocabulary keyed by action name, invoking the same application
// actions as the menu items above. The main-process key-event delivery path
// (see keybind-delivery.ts) calls these so a keybind works even when the
// platform refuses to fire its registered menu accelerator, keeping the menu
// the single behavior definition.
export function terminalActionInvocations(
  actions: TerminalApplicationMenuActions,
): Readonly<Record<TerminalActionName, () => void>> {
  return Object.freeze({
    quit: actions.requestQuit,
    copy: actions.copySelectedTerminal,
    paste: actions.pasteSelectedTerminal,
    selectAll: actions.selectAllSelectedTerminal,
    newWindow: actions.newWindow,
    closeWindow: actions.closeSelectedWindow,
    newTab: actions.newTabInSelectedWindow,
    closeTab: actions.closeSelectedTab,
    nextTab: actions.selectNextTab,
    previousTab: actions.selectPreviousTab,
    ...(Object.fromEntries(
      Array.from({ length: 9 }, (_, index) => {
        const position = index + 1;
        return [
          `selectTab${position}`,
          () => actions.selectTabInSelectedWindow(position),
        ];
      }),
    ) as Record<SelectTabAction, () => void>),
    zoomIn: actions.zoomInSelectedWindow,
    zoomOut: actions.zoomOutSelectedWindow,
    actualSize: actions.resetSelectedWindowZoom,
    toggleFullScreen: actions.toggleSelectedFullScreen,
    toggleSnippets: actions.toggleSelectedSnippets,
    toggleTabBar: actions.toggleSelectedTabBar,
    toggleTitleBar: actions.toggleSelectedTitleBar,
    reloadConfig: actions.reloadUserConfiguration,
    splitRight: () => actions.splitSelectedPane("right"),
    splitDown: () => actions.splitSelectedPane("down"),
    closePane: actions.closeSelectedPane,
    focusNextPane: () => actions.focusPaneInSelectedWindow("next"),
    focusPreviousPane: () => actions.focusPaneInSelectedWindow("previous"),
    focusPaneLeft: () => actions.focusPaneInSelectedWindow("left"),
    focusPaneRight: () => actions.focusPaneInSelectedWindow("right"),
    focusPaneUp: () => actions.focusPaneInSelectedWindow("up"),
    focusPaneDown: () => actions.focusPaneInSelectedWindow("down"),
    toggleMaximizePane: actions.toggleSelectedPaneMaximized,
    equalizePanes: actions.equalizeSelectedPanes,
    toggleBroadcast: actions.toggleSelectedBroadcast,
    toggleSessions: actions.toggleSelectedSessions,
    toggleCommands: actions.toggleSelectedCommands,
    commandPalette: actions.toggleSelectedCommandPalette,
    find: actions.findInSelectedWindow,
    preferences: actions.openPreferences ?? (() => {}),
  });
}

export function terminalClipboardContextMenuTemplate(actions: {
  readonly copy: () => void;
  readonly paste: () => void;
  readonly selectAll: () => void;
}): MenuItemConstructorOptions[] {
  return [
    { label: "Copy", click: actions.copy },
    { label: "Paste", click: actions.paste },
    { type: "separator" },
    { label: "Select All", click: actions.selectAll },
  ];
}
