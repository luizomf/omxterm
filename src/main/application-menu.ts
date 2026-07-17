import type { MenuItemConstructorOptions } from "electron";

interface TerminalApplicationMenuActions {
  readonly newWindow: () => void;
  readonly closeSelectedWindow: () => void;
  readonly requestQuit: () => void;
  readonly toggleSelectedFullScreen: () => void;
  readonly toggleSelectedAlwaysOnTop: () => void;
  readonly zoomInSelectedWindow: () => void;
  readonly zoomOutSelectedWindow: () => void;
  readonly resetSelectedWindowZoom: () => void;
}

export function terminalApplicationMenuTemplate(
  applicationName: string,
  actions: TerminalApplicationMenuActions,
): MenuItemConstructorOptions[] {
  return [
    {
      label: applicationName,
      submenu: [
        { role: "about" },
        { type: "separator" },
        {
          label: `Quit ${applicationName}`,
          accelerator: "CommandOrControl+Q",
          click: actions.requestQuit,
        },
      ],
    },
    {
      label: "File",
      submenu: [
        {
          label: "New Window",
          accelerator: "CommandOrControl+N",
          click: actions.newWindow,
        },
        {
          label: "Close Window",
          accelerator: "CommandOrControl+W",
          click: actions.closeSelectedWindow,
        },
      ],
    },
    {
      label: "View",
      submenu: [
        {
          label: "Zoom In",
          accelerator: "CommandOrControl+Plus",
          click: actions.zoomInSelectedWindow,
        },
        {
          label: "Zoom Out",
          accelerator: "CommandOrControl+-",
          click: actions.zoomOutSelectedWindow,
        },
        {
          label: "Actual Size",
          accelerator: "CommandOrControl+0",
          click: actions.resetSelectedWindowZoom,
        },
        { type: "separator" },
        {
          label: "Toggle Full Screen",
          accelerator: "Control+Command+F",
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
