import type { MenuItemConstructorOptions } from "electron";
import type { TerminalExportKind } from "../shared/terminal-contract";
import type {
  TerminalActionName,
  TerminalKeybinds,
} from "../shared/terminal-keybinds";

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
  readonly toggleSelectedDevTools: () => void;
  readonly zoomInSelectedWindow: () => void;
  readonly zoomOutSelectedWindow: () => void;
  readonly resetSelectedWindowZoom: () => void;
  readonly copySelectedTerminal: () => void;
  readonly pasteSelectedTerminal: () => void;
  readonly selectAllSelectedTerminal: () => void;
  readonly findInSelectedTerminal: () => void;
  readonly toggleSelectedSnippets: () => void;
  readonly toggleSelectedTabBar: () => void;
  readonly toggleSelectedTitleBar: () => void;
  readonly reloadUserConfiguration: () => void;
  readonly openLocalImage: () => void;
  readonly showAbout: () => void;
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
        {
          id: "about",
          label: "About OMXTerm",
          click: actions.showAbout,
        },
        { type: "separator" },
        {
          label: `Quit ${applicationName}`,
          ...accelerator(keybinds.quit),
          click: actions.requestQuit,
        },
      ],
    },
    {
      label: "Edit",
      submenu: [
        {
          label: "Copy",
          ...accelerator(keybinds.copy),
          click: actions.copySelectedTerminal,
        },
        {
          label: "Paste",
          ...accelerator(keybinds.paste),
          click: actions.pasteSelectedTerminal,
        },
        { type: "separator" },
        {
          label: "Select All",
          ...accelerator(keybinds.selectAll),
          click: actions.selectAllSelectedTerminal,
        },
        { type: "separator" },
        {
          label: "Find…",
          ...accelerator(keybinds.find),
          click: actions.findInSelectedTerminal,
        },
      ],
    },
    {
      label: "File",
      submenu: [
        {
          label: "New Window",
          ...accelerator(keybinds.newWindow),
          click: actions.newWindow,
        },
        {
          label: "New Tab",
          ...accelerator(keybinds.newTab),
          click: actions.newTabInSelectedWindow,
        },
        { type: "separator" },
        {
          label: "Open Local Image…",
          click: actions.openLocalImage,
        },
        { type: "separator" },
        {
          label: "Close Tab",
          ...accelerator(keybinds.closeTab),
          click: actions.closeSelectedTab,
        },
        {
          label: "Close Window",
          ...accelerator(keybinds.closeWindow),
          click: actions.closeSelectedWindow,
        },
      ],
    },
    {
      label: "View",
      submenu: [
        {
          label: "Zoom In",
          ...accelerator(keybinds.zoomIn),
          click: actions.zoomInSelectedWindow,
        },
        {
          label: "Zoom Out",
          ...accelerator(keybinds.zoomOut),
          click: actions.zoomOutSelectedWindow,
        },
        {
          label: "Actual Size",
          ...accelerator(keybinds.actualSize),
          click: actions.resetSelectedWindowZoom,
        },
        { type: "separator" },
        {
          label: "Toggle Snippets",
          ...accelerator(keybinds.toggleSnippets),
          click: actions.toggleSelectedSnippets,
        },
        {
          label: "Toggle Tab Bar",
          ...accelerator(keybinds.toggleTabBar),
          click: actions.toggleSelectedTabBar,
        },
        {
          label: "Toggle Title Bar",
          ...accelerator(keybinds.toggleTitleBar),
          click: actions.toggleSelectedTitleBar,
        },
        {
          label: "Reload User Configuration",
          ...accelerator(keybinds.reloadConfig),
          click: actions.reloadUserConfiguration,
        },
        {
          label: "Toggle Developer Tools",
          click: actions.toggleSelectedDevTools,
        },
        { type: "separator" },
        {
          label: "Toggle Full Screen",
          ...accelerator(keybinds.toggleFullScreen),
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
          ...accelerator(keybinds.nextTab),
          click: actions.selectNextTab,
        },
        {
          label: "Show Previous Tab",
          ...accelerator(keybinds.previousTab),
          click: actions.selectPreviousTab,
        },
        {
          label: "Select Tab",
          submenu: Array.from({ length: 9 }, (_, index) => {
            const position = index + 1;
            return {
              label: `Tab ${position}`,
              ...accelerator(
                keybinds[`selectTab${position}` as SelectTabAction],
              ),
              click: () => actions.selectTabInSelectedWindow(position),
            };
          }),
        },
      ],
    },
  ];
}

type SelectTabAction = keyof TerminalKeybinds & `selectTab${number}`;

// A null keybind leaves the item without a shortcut; the action stays usable.
function accelerator(value: string | null): { accelerator?: string } {
  return value === null ? {} : { accelerator: value };
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
    find: actions.findInSelectedTerminal,
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
  });
}

export function terminalClipboardContextMenuTemplate(
  actions: {
    readonly copy: () => void;
    readonly paste: () => void;
    readonly selectAll: () => void;
    readonly exportText: () => void;
  },
  exportKind: TerminalExportKind,
): MenuItemConstructorOptions[] {
  return [
    { label: "Copy", click: actions.copy },
    { label: "Paste", click: actions.paste },
    { type: "separator" },
    { label: "Select All", click: actions.selectAll },
    { type: "separator" },
    {
      label:
        exportKind === "selection"
          ? "Export Selection…"
          : "Export Terminal Content…",
      click: actions.exportText,
    },
  ];
}
