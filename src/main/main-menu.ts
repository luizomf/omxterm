import type { IpcMain, MenuItemConstructorOptions } from "electron";
import type { Translator } from "../shared/i18n";
import type { TerminalKeybinds } from "../shared/terminal-keybinds";
import { terminalIpc } from "../shared/terminal-ipc";
import {
  windowFrameMenuItems,
  type TerminalApplicationMenuActions,
  type TerminalApplicationMenuState,
} from "./application-menu";
import type {
  IpcEvent,
  IpcMainPort,
  TrustedWebContents,
} from "./terminal-ipc-types";

export interface MainMenuPosition {
  readonly x: number;
  readonly y: number;
}

// Window coordinates far beyond any display are not a menu position.
const MAX_COORDINATE = 32_768;

export function isMainMenuPosition(value: unknown): value is MainMenuPosition {
  if (typeof value !== "object" || value === null || Array.isArray(value))
    return false;
  const position = value as Record<string, unknown>;
  return (
    Object.keys(position).length === 2 &&
    [position.x, position.y].every(
      (coordinate) =>
        Number.isInteger(coordinate) &&
        (coordinate as number) >= 0 &&
        (coordinate as number) <= MAX_COORDINATE,
    )
  );
}

// The header toolbar's main menu: the application menu's actions grouped the
// way AshyTerm's main menu groups them, translated, for platforms whose menu
// bar is hidden. It invokes exactly the application menu's actions.
export function terminalMainMenuTemplate(
  translator: Translator,
  actions: TerminalApplicationMenuActions,
  keybinds: TerminalKeybinds,
  state: TerminalApplicationMenuState = {},
): MenuItemConstructorOptions[] {
  const t = translator.t.bind(translator);
  return [
    {
      label: t("action.newWindow"),
      accelerator: keybinds.newWindow,
      click: actions.newWindow,
    },
    {
      label: t("action.newTab"),
      accelerator: keybinds.newTab,
      click: actions.newTabInSelectedWindow,
    },
    { type: "separator" },
    {
      label: t("menu.commandPalette"),
      accelerator: keybinds.commandPalette,
      click: actions.toggleSelectedCommandPalette,
    },
    {
      label: t("action.find"),
      accelerator: keybinds.find,
      click: actions.findInSelectedWindow,
    },
    { type: "separator" },
    {
      label: t("sidebar.sessions"),
      accelerator: keybinds.toggleSessions,
      click: actions.toggleSelectedSessions,
    },
    {
      label: t("sidebar.commands"),
      accelerator: keybinds.toggleCommands,
      click: actions.toggleSelectedCommands,
    },
    ...(actions.toggleSelectedFiles
      ? [
          {
            label: t("sidebar.files"),
            accelerator: keybinds.toggleFiles,
            click: actions.toggleSelectedFiles,
          },
        ]
      : []),
    ...(actions.toggleSelectedAssistant
      ? [
          {
            label: t("sidebar.assistant"),
            accelerator: keybinds.toggleAssistant,
            click: actions.toggleSelectedAssistant,
          },
        ]
      : []),
    {
      label: t("menu.snippets"),
      accelerator: keybinds.toggleSnippets,
      click: actions.toggleSelectedSnippets,
    },
    { type: "separator" },
    {
      label: t("menu.terminal"),
      submenu: terminalSubmenu(t, actions, keybinds),
    },
    {
      label: t("menu.view"),
      submenu: [
        ...viewSubmenu(t, actions, keybinds),
        { type: "separator" },
        ...windowFrameMenuItems(
          {
            roundMore: t("menu.roundMore"),
            roundLess: t("menu.roundLess"),
            autoHide: t("menu.autoHideTitleBar"),
            alwaysShow: t("menu.alwaysShowTitleBar"),
          },
          actions,
          state,
          keybinds,
        ),
      ],
    },
    ...highlightItems(t, actions, state, keybinds),
    { type: "separator" },
    ...(actions.openPreferences
      ? [
          {
            label: t("menu.preferences"),
            accelerator: keybinds.preferences,
            click: actions.openPreferences,
          },
        ]
      : []),
    {
      label: t("menu.settings"),
      submenu: settingsSubmenu(t, actions, keybinds, state),
    },
    { type: "separator" },
    actions.showAbout
      ? {
          label: t("menu.about"),
          accelerator: keybinds.about,
          click: actions.showAbout,
        }
      : { role: "about", label: t("menu.about") },
    {
      label: t("action.quit"),
      accelerator: keybinds.quit,
      click: actions.requestQuit,
    },
  ];
}

type Translate = Translator["t"];

function terminalSubmenu(
  t: Translate,
  actions: TerminalApplicationMenuActions,
  keybinds: TerminalKeybinds,
): MenuItemConstructorOptions[] {
  return [
    {
      label: t("action.splitRight"),
      accelerator: keybinds.splitRight,
      click: () => actions.splitSelectedPane("right"),
    },
    {
      label: t("action.splitDown"),
      accelerator: keybinds.splitDown,
      click: () => actions.splitSelectedPane("down"),
    },
    {
      label: t("action.closePane"),
      accelerator: keybinds.closePane,
      click: actions.closeSelectedPane,
    },
    {
      label: t("action.toggleMaximizePane"),
      accelerator: keybinds.toggleMaximizePane,
      click: actions.toggleSelectedPaneMaximized,
    },
    {
      label: t("action.equalizePanes"),
      accelerator: keybinds.equalizePanes,
      click: actions.equalizeSelectedPanes,
    },
    { type: "separator" },
    {
      label: t("action.toggleBroadcast"),
      accelerator: keybinds.toggleBroadcast,
      click: actions.toggleSelectedBroadcast,
    },
    { type: "separator" },
    {
      label: t("action.copy"),
      accelerator: keybinds.copy,
      click: actions.copySelectedTerminal,
    },
    {
      label: t("action.paste"),
      accelerator: keybinds.paste,
      click: actions.pasteSelectedTerminal,
    },
    {
      label: t("action.selectAll"),
      accelerator: keybinds.selectAll,
      click: actions.selectAllSelectedTerminal,
    },
    { type: "separator" },
    {
      label: t("menu.openLocalImage"),
      accelerator: keybinds.openLocalImage,
      click: actions.openLocalImage,
    },
  ];
}

function viewSubmenu(
  t: Translate,
  actions: TerminalApplicationMenuActions,
  keybinds: TerminalKeybinds,
): MenuItemConstructorOptions[] {
  return [
    {
      label: t("action.zoomIn"),
      accelerator: keybinds.zoomIn,
      click: actions.zoomInSelectedWindow,
    },
    {
      label: t("action.zoomOut"),
      accelerator: keybinds.zoomOut,
      click: actions.zoomOutSelectedWindow,
    },
    {
      label: t("action.actualSize"),
      accelerator: keybinds.actualSize,
      click: actions.resetSelectedWindowZoom,
    },
    { type: "separator" },
    {
      label: t("action.toggleTabBar"),
      accelerator: keybinds.toggleTabBar,
      click: actions.toggleSelectedTabBar,
    },
    {
      label: t("action.toggleTitleBar"),
      accelerator: keybinds.toggleTitleBar,
      click: actions.toggleSelectedTitleBar,
    },
    {
      label: t("menu.alwaysOnTop"),
      accelerator: keybinds.toggleAlwaysOnTop,
      click: actions.toggleSelectedAlwaysOnTop,
    },
    {
      label: t("action.toggleFullScreen"),
      accelerator: keybinds.toggleFullScreen,
      click: actions.toggleSelectedFullScreen,
    },
    { type: "separator" },
    {
      label: t("menu.developerTools"),
      accelerator: keybinds.toggleDevTools,
      click: actions.toggleSelectedDevTools,
    },
  ];
}

function highlightItems(
  t: Translate,
  actions: TerminalApplicationMenuActions,
  state: TerminalApplicationMenuState,
  keybinds: TerminalKeybinds,
): MenuItemConstructorOptions[] {
  return [
    ...(actions.toggleOutputHighlighting
      ? [
          {
            label: t("menu.highlightOutput"),
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
            label: t("menu.highlightRules"),
            accelerator: keybinds.highlightRules,
            click: actions.openHighlightRules,
          },
        ]
      : []),
  ];
}

function settingsSubmenu(
  t: Translate,
  actions: TerminalApplicationMenuActions,
  keybinds: TerminalKeybinds,
  state: TerminalApplicationMenuState,
): MenuItemConstructorOptions[] {
  return [
    {
      label: t("menu.backUpSettings"),
      accelerator: keybinds.backUpSettings,
      click: actions.backUpSettings,
    },
    {
      label: t("menu.restoreSettings"),
      accelerator: keybinds.restoreSettings,
      click: actions.restoreSettings,
    },
    ...(actions.toggleRestoreWorkspace
      ? [
          { type: "separator" as const },
          {
            label: t("menu.restoreWindows"),
            accelerator: keybinds.toggleRestoreWindows,
            type: "checkbox" as const,
            checked: state.restoreWorkspace ?? false,
            click: actions.toggleRestoreWorkspace,
          },
        ]
      : []),
    { type: "separator" },
    {
      label: t("action.reloadConfig"),
      accelerator: keybinds.reloadConfig,
      click: actions.reloadUserConfiguration,
    },
  ];
}

// The renderer asks for the menu at the toolbar button; main builds and
// shows it for the window that asked, so the renderer names no action.
export function registerMainMenu(
  ipcMain: IpcMain,
  isTrustedSender: (event: IpcEvent) => boolean,
  show: (sender: TrustedWebContents, position: MainMenuPosition) => void,
): () => void {
  const port = ipcMain as unknown as IpcMainPort;
  const listener = (event: IpcEvent, payload?: unknown) => {
    if (
      event.senderFrame !== event.sender.mainFrame ||
      !isTrustedSender(event) ||
      !isMainMenuPosition(payload)
    )
      return;
    show(event.sender, payload);
  };
  port.on(terminalIpc.mainMenu, listener);
  return () => port.removeListener(terminalIpc.mainMenu, listener);
}
