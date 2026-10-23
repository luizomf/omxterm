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
  readonly toggleSelectedFiles?: () => void;
  readonly toggleSelectedAssistant?: () => void;
  readonly adjustCornerRadius?: (delta: number) => void;
  readonly setAutoHideTitleBar?: (enabled: boolean) => void;
  readonly showAbout?: () => void;
}

export interface TerminalApplicationMenuState {
  readonly outputHighlighting?: boolean;
  readonly restoreWorkspace?: boolean;
  readonly autoHideTitleBar?: boolean;
}

// View items for the window frame: rounder or squarer corners and whether
// the title bar hides itself. Shared by the application and main menus.
export function windowFrameMenuItems(
  labels: {
    readonly roundMore: string;
    readonly roundLess: string;
    readonly autoHide: string;
    readonly alwaysShow: string;
  },
  actions: TerminalApplicationMenuActions,
  state: TerminalApplicationMenuState,
  keybinds: TerminalKeybinds,
): MenuItemConstructorOptions[] {
  const adjust = actions.adjustCornerRadius;
  const autoHide = actions.setAutoHideTitleBar;
  return [
    ...(adjust
      ? [
          {
            label: labels.roundMore,
            accelerator: keybinds.roundMore,
            click: () => adjust(2),
          },
          {
            label: labels.roundLess,
            accelerator: keybinds.roundLess,
            click: () => adjust(-2),
          },
        ]
      : []),
    ...(autoHide
      ? [
          {
            label: labels.autoHide,
            accelerator: keybinds.autoHideTitleBar,
            type: "radio" as const,
            checked: state.autoHideTitleBar === true,
            click: () => autoHide(true),
          },
          {
            label: labels.alwaysShow,
            accelerator: keybinds.alwaysShowTitleBar,
            type: "radio" as const,
            checked: state.autoHideTitleBar !== true,
            click: () => autoHide(false),
          },
        ]
      : []),
  ];
}

// The application's own menu: About, Preferences, restore and Quit.
function applicationSubmenu(
  applicationName: string,
  actions: TerminalApplicationMenuActions,
  keybinds: TerminalKeybinds,
  state: TerminalApplicationMenuState,
): MenuItemConstructorOptions {
  return {
    label: applicationName,
    submenu: [
      actions.showAbout
        ? {
            label: `About ${applicationName}`,
            accelerator: keybinds.about,
            click: actions.showAbout,
          }
        : { role: "about" as const },
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
              accelerator: keybinds.toggleRestoreWindows,
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
  };
}

export function terminalApplicationMenuTemplate(
  applicationName: string,
  actions: TerminalApplicationMenuActions,
  keybinds: TerminalKeybinds,
  state: TerminalApplicationMenuState = {},
): MenuItemConstructorOptions[] {
  return [
    applicationSubmenu(applicationName, actions, keybinds, state),
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
          accelerator: keybinds.openLocalImage,
          click: actions.openLocalImage,
        },
        { type: "separator" },
        {
          label: "Back Up Settings…",
          accelerator: keybinds.backUpSettings,
          click: actions.backUpSettings,
        },
        {
          label: "Restore Settings…",
          accelerator: keybinds.restoreSettings,
          click: actions.restoreSettings,
        },
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
        ...(actions.toggleSelectedFiles
          ? [
              {
                label: "Toggle Files",
                accelerator: keybinds.toggleFiles,
                click: actions.toggleSelectedFiles,
              },
            ]
          : []),
        ...(actions.toggleSelectedAssistant
          ? [
              {
                label: "Toggle Assistant",
                accelerator: keybinds.toggleAssistant,
                click: actions.toggleSelectedAssistant,
              },
            ]
          : []),
        {
          label: "Toggle Snippets",
          accelerator: keybinds.toggleSnippets,
          click: actions.toggleSelectedSnippets,
        },
        ...(actions.toggleOutputHighlighting
          ? [
              {
                label: "Highlight Output",
                accelerator: keybinds.toggleHighlighting,
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
                accelerator: keybinds.highlightRules,
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
        ...windowFrameMenuItems(
          {
            roundMore: "Rounder Corners",
            roundLess: "Less Rounded Corners",
            autoHide: "Auto-Hide Title Bar",
            alwaysShow: "Always Show Title Bar",
          },
          actions,
          state,
          keybinds,
        ),
        {
          label: "Reload User Configuration",
          accelerator: keybinds.reloadConfig,
          click: actions.reloadUserConfiguration,
        },
        {
          label: "Toggle Developer Tools",
          accelerator: keybinds.toggleDevTools,
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
          accelerator: keybinds.toggleAlwaysOnTop,
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

export { terminalActionInvocations } from "./terminal-action-invocations";

export function terminalClipboardContextMenuTemplate(
  actions: {
    readonly copy: () => void;
    readonly paste: () => void;
    readonly selectAll: () => void;
    readonly saveOutput?: () => void;
  },
  labels: {
    readonly copy: string;
    readonly paste: string;
    readonly selectAll: string;
    readonly saveOutput: string;
  } = {
    copy: "Copy",
    paste: "Paste",
    selectAll: "Select All",
    saveOutput: "Save Output to File…",
  },
): MenuItemConstructorOptions[] {
  return [
    { label: labels.copy, click: actions.copy },
    { label: labels.paste, click: actions.paste },
    { type: "separator" },
    { label: labels.selectAll, click: actions.selectAll },
    ...(actions.saveOutput
      ? [
          { type: "separator" as const },
          { label: labels.saveOutput, click: actions.saveOutput },
        ]
      : []),
  ];
}
