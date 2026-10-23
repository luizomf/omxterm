import type { MenuItemConstructorOptions } from "electron";
import { mainTranslator } from "./main-translator";
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
  const t = mainTranslator().t.bind(mainTranslator());
  return {
    label: applicationName,
    submenu: [
      actions.showAbout
        ? {
            label: t("appMenu.about", { name: applicationName }),
            accelerator: keybinds.about,
            click: actions.showAbout,
          }
        : { role: "about" as const },
      ...(actions.openPreferences
        ? [
            { type: "separator" as const },
            {
              label: t("appMenu.preferences"),
              accelerator: keybinds.preferences,
              click: actions.openPreferences,
            },
          ]
        : []),
      ...(actions.toggleRestoreWorkspace
        ? [
            { type: "separator" as const },
            {
              label: t("appMenu.restoreWindowsAtStartup"),
              accelerator: keybinds.toggleRestoreWindows,
              type: "checkbox" as const,
              checked: state.restoreWorkspace ?? false,
              click: actions.toggleRestoreWorkspace,
            },
          ]
        : []),
      { type: "separator" },
      {
        label: t("appMenu.quit", { name: applicationName }),
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
  const t = mainTranslator().t.bind(mainTranslator());
  return [
    applicationSubmenu(applicationName, actions, keybinds, state),
    {
      label: t("appMenu.edit"),
      submenu: [
        {
          label: t("appMenu.copy"),
          accelerator: keybinds.copy,
          click: actions.copySelectedTerminal,
        },
        {
          label: t("appMenu.paste"),
          accelerator: keybinds.paste,
          click: actions.pasteSelectedTerminal,
        },
        { type: "separator" },
        {
          label: t("appMenu.selectAll"),
          accelerator: keybinds.selectAll,
          click: actions.selectAllSelectedTerminal,
        },
        { type: "separator" },
        {
          label: t("appMenu.find"),
          accelerator: keybinds.find,
          click: actions.findInSelectedWindow,
        },
      ],
    },
    {
      label: t("appMenu.file"),
      submenu: [
        {
          label: t("appMenu.newWindow"),
          accelerator: keybinds.newWindow,
          click: actions.newWindow,
        },
        {
          label: t("appMenu.newTab"),
          accelerator: keybinds.newTab,
          click: actions.newTabInSelectedWindow,
        },
        { type: "separator" },
        {
          label: t("appMenu.openLocalImage"),
          accelerator: keybinds.openLocalImage,
          click: actions.openLocalImage,
        },
        { type: "separator" },
        {
          label: t("appMenu.backUpSettings"),
          accelerator: keybinds.backUpSettings,
          click: actions.backUpSettings,
        },
        {
          label: t("appMenu.restoreSettings"),
          accelerator: keybinds.restoreSettings,
          click: actions.restoreSettings,
        },
        { type: "separator" },
        {
          label: t("appMenu.closeTab"),
          accelerator: keybinds.closeTab,
          click: actions.closeSelectedTab,
        },
        {
          label: t("appMenu.closeWindow"),
          accelerator: keybinds.closeWindow,
          click: actions.closeSelectedWindow,
        },
      ],
    },
    {
      label: t("appMenu.view"),
      submenu: [
        {
          label: t("appMenu.zoomIn"),
          accelerator: keybinds.zoomIn,
          click: actions.zoomInSelectedWindow,
        },
        {
          label: t("appMenu.zoomOut"),
          accelerator: keybinds.zoomOut,
          click: actions.zoomOutSelectedWindow,
        },
        {
          label: t("appMenu.actualSize"),
          accelerator: keybinds.actualSize,
          click: actions.resetSelectedWindowZoom,
        },
        { type: "separator" },
        {
          label: t("appMenu.commandPalette"),
          accelerator: keybinds.commandPalette,
          click: actions.toggleSelectedCommandPalette,
        },
        {
          label: t("appMenu.toggleSessions"),
          accelerator: keybinds.toggleSessions,
          click: actions.toggleSelectedSessions,
        },
        {
          label: t("appMenu.toggleCommands"),
          accelerator: keybinds.toggleCommands,
          click: actions.toggleSelectedCommands,
        },
        ...(actions.toggleSelectedFiles
          ? [
              {
                label: t("appMenu.toggleFiles"),
                accelerator: keybinds.toggleFiles,
                click: actions.toggleSelectedFiles,
              },
            ]
          : []),
        ...(actions.toggleSelectedAssistant
          ? [
              {
                label: t("appMenu.toggleAssistant"),
                accelerator: keybinds.toggleAssistant,
                click: actions.toggleSelectedAssistant,
              },
            ]
          : []),
        {
          label: t("appMenu.toggleSnippets"),
          accelerator: keybinds.toggleSnippets,
          click: actions.toggleSelectedSnippets,
        },
        ...(actions.toggleOutputHighlighting
          ? [
              {
                label: t("appMenu.highlightOutput"),
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
                label: t("appMenu.highlightRules"),
                accelerator: keybinds.highlightRules,
                click: actions.openHighlightRules,
              },
            ]
          : []),
        {
          label: t("appMenu.toggleTabBar"),
          accelerator: keybinds.toggleTabBar,
          click: actions.toggleSelectedTabBar,
        },
        {
          label: t("appMenu.toggleTitleBar"),
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
          label: t("appMenu.reloadUserConfiguration"),
          accelerator: keybinds.reloadConfig,
          click: actions.reloadUserConfiguration,
        },
        {
          label: t("appMenu.toggleDeveloperTools"),
          accelerator: keybinds.toggleDevTools,
          click: actions.toggleSelectedDevTools,
        },
        { type: "separator" },
        {
          label: t("appMenu.toggleFullScreen"),
          accelerator: keybinds.toggleFullScreen,
          click: actions.toggleSelectedFullScreen,
        },
      ],
    },
    terminalMenu(actions, keybinds),
    {
      label: t("appMenu.window"),
      submenu: [
        { role: "minimize" },
        {
          label: t("appMenu.alwaysOnTop"),
          accelerator: keybinds.toggleAlwaysOnTop,
          click: actions.toggleSelectedAlwaysOnTop,
        },
        { type: "separator" },
        {
          label: t("appMenu.showNextTab"),
          accelerator: keybinds.nextTab,
          click: actions.selectNextTab,
        },
        {
          label: t("appMenu.showPreviousTab"),
          accelerator: keybinds.previousTab,
          click: actions.selectPreviousTab,
        },
        {
          label: t("appMenu.selectTab"),
          submenu: Array.from({ length: 9 }, (_, index) => {
            const position = index + 1;
            return {
              label: t("appMenu.tab", { position }),
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
  const t = mainTranslator().t.bind(mainTranslator());
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
    label: t("appMenu.terminal"),
    submenu: [
      {
        label: t("appMenu.splitRight"),
        accelerator: keybinds.splitRight,
        click: () => actions.splitSelectedPane("right"),
      },
      {
        label: t("appMenu.splitDown"),
        accelerator: keybinds.splitDown,
        click: () => actions.splitSelectedPane("down"),
      },
      {
        label: t("appMenu.closePane"),
        accelerator: keybinds.closePane,
        click: actions.closeSelectedPane,
      },
      { type: "separator" },
      {
        label: t("appMenu.maximizeOrRestorePane"),
        accelerator: keybinds.toggleMaximizePane,
        click: actions.toggleSelectedPaneMaximized,
      },
      {
        label: t("appMenu.equalizePanes"),
        accelerator: keybinds.equalizePanes,
        click: actions.equalizeSelectedPanes,
      },
      {
        label: t("appMenu.focusPane"),
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
        label: t("appMenu.broadcastInputToPanes"),
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
