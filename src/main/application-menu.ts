import type { MenuItemConstructorOptions } from "electron";
import type { TerminalKeybinds } from "../shared/terminal-keybinds";

interface TerminalApplicationMenuActions {
  readonly newWindow: () => void;
  readonly closeSelectedWindow: () => void;
  readonly requestQuit: () => void;
  readonly toggleSelectedFullScreen: () => void;
  readonly toggleSelectedAlwaysOnTop: () => void;
  readonly zoomInSelectedWindow: () => void;
  readonly zoomOutSelectedWindow: () => void;
  readonly resetSelectedWindowZoom: () => void;
  readonly copySelectedTerminal: () => void;
  readonly pasteSelectedTerminal: () => void;
  readonly selectAllSelectedTerminal: () => void;
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
      ],
    },
  ];
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
