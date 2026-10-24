import type { MenuItemConstructorOptions } from "electron";
import {
  DEFAULT_LANGUAGE,
  translatorFor,
  type Translator,
} from "../shared/i18n";
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
  t: Translator["t"] = translatorFor(DEFAULT_LANGUAGE).t,
): MenuItemConstructorOptions[] {
  return [
    {
      label: applicationName,
      submenu: [
        {
          id: "about",
          label: t("menu.about"),
          click: actions.showAbout,
        },
        { type: "separator" },
        {
          label: t("menu.quit", { name: applicationName }),
          ...accelerator(keybinds.quit),
          click: actions.requestQuit,
        },
      ],
    },
    {
      label: t("menu.edit"),
      submenu: [
        {
          label: t("menu.copy"),
          ...accelerator(keybinds.copy),
          click: actions.copySelectedTerminal,
        },
        {
          label: t("menu.paste"),
          ...accelerator(keybinds.paste),
          click: actions.pasteSelectedTerminal,
        },
        { type: "separator" },
        {
          label: t("menu.selectAll"),
          ...accelerator(keybinds.selectAll),
          click: actions.selectAllSelectedTerminal,
        },
        { type: "separator" },
        {
          label: t("menu.find"),
          ...accelerator(keybinds.find),
          click: actions.findInSelectedTerminal,
        },
      ],
    },
    {
      label: t("menu.file"),
      submenu: [
        {
          label: t("menu.newWindow"),
          ...accelerator(keybinds.newWindow),
          click: actions.newWindow,
        },
        {
          label: t("menu.newTab"),
          ...accelerator(keybinds.newTab),
          click: actions.newTabInSelectedWindow,
        },
        { type: "separator" },
        {
          label: t("menu.openLocalImage"),
          click: actions.openLocalImage,
        },
        { type: "separator" },
        {
          label: t("menu.closeTab"),
          ...accelerator(keybinds.closeTab),
          click: actions.closeSelectedTab,
        },
        {
          label: t("menu.closeWindow"),
          ...accelerator(keybinds.closeWindow),
          click: actions.closeSelectedWindow,
        },
      ],
    },
    {
      label: t("menu.view"),
      submenu: [
        {
          label: t("menu.zoomIn"),
          ...accelerator(keybinds.zoomIn),
          click: actions.zoomInSelectedWindow,
        },
        {
          label: t("menu.zoomOut"),
          ...accelerator(keybinds.zoomOut),
          click: actions.zoomOutSelectedWindow,
        },
        {
          label: t("menu.actualSize"),
          ...accelerator(keybinds.actualSize),
          click: actions.resetSelectedWindowZoom,
        },
        { type: "separator" },
        {
          label: t("menu.toggleSnippets"),
          ...accelerator(keybinds.toggleSnippets),
          click: actions.toggleSelectedSnippets,
        },
        {
          label: t("menu.toggleTabBar"),
          ...accelerator(keybinds.toggleTabBar),
          click: actions.toggleSelectedTabBar,
        },
        {
          label: t("menu.toggleTitleBar"),
          ...accelerator(keybinds.toggleTitleBar),
          click: actions.toggleSelectedTitleBar,
        },
        {
          label: t("menu.reloadConfiguration"),
          ...accelerator(keybinds.reloadConfig),
          click: actions.reloadUserConfiguration,
        },
        {
          label: t("menu.toggleDeveloperTools"),
          click: actions.toggleSelectedDevTools,
        },
        { type: "separator" },
        {
          label: t("menu.toggleFullScreen"),
          ...accelerator(keybinds.toggleFullScreen),
          click: actions.toggleSelectedFullScreen,
        },
      ],
    },
    {
      label: t("menu.window"),
      submenu: [
        { role: "minimize", label: t("menu.minimize") },
        {
          label: t("menu.alwaysOnTop"),
          click: actions.toggleSelectedAlwaysOnTop,
        },
        { type: "separator" },
        {
          label: t("menu.showNextTab"),
          ...accelerator(keybinds.nextTab),
          click: actions.selectNextTab,
        },
        {
          label: t("menu.showPreviousTab"),
          ...accelerator(keybinds.previousTab),
          click: actions.selectPreviousTab,
        },
        {
          label: t("menu.selectTab"),
          submenu: Array.from({ length: 9 }, (_, index) => {
            const position = index + 1;
            return {
              label: t("menu.tab", { position }),
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
  },
  t: Translator["t"] = translatorFor(DEFAULT_LANGUAGE).t,
): MenuItemConstructorOptions[] {
  return [
    { label: t("menu.copy"), click: actions.copy },
    { label: t("menu.paste"), click: actions.paste },
    { type: "separator" },
    { label: t("menu.selectAll"), click: actions.selectAll },
  ];
}
