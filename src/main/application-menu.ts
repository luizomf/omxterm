import type { MenuItemConstructorOptions } from "electron";
import type { TerminalKeybinds } from "../shared/terminal-keybinds";

interface TerminalApplicationMenuActions {
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
  readonly zoomInSelectedWindow: () => void;
  readonly zoomOutSelectedWindow: () => void;
  readonly resetSelectedWindowZoom: () => void;
  readonly copySelectedTerminal: () => void;
  readonly pasteSelectedTerminal: () => void;
  readonly selectAllSelectedTerminal: () => void;
  readonly toggleSelectedSnippets: () => void;
}

export function terminalApplicationMenuTemplate(
  applicationName: string,
  actions: TerminalApplicationMenuActions,
  keybinds: TerminalKeybinds,
): MenuItemConstructorOptions[] {
  return [
    {
      label: applicationName,
      submenu: [
        { role: "about" },
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
          label: "Toggle Snippets",
          accelerator: keybinds.toggleSnippets,
          click: actions.toggleSelectedSnippets,
        },
        { type: "separator" },
        {
          label: "Toggle Full Screen",
          accelerator: keybinds.toggleFullScreen,
          click: actions.toggleSelectedFullScreen,
        },
      ],
    },
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
