import type { MenuItemConstructorOptions } from "electron";
import {
  DEFAULT_LANGUAGE,
  translatorFor,
  type Translator,
} from "../shared/i18n";
import {
  DEFAULT_TERMINAL_KEYBINDS,
  type TerminalKeybinds,
} from "../shared/terminal-keybinds";
import {
  createCoreActionCatalog,
  coreActionInvocations,
  type CoreActionCatalog,
  type CoreActionId,
  type TerminalApplicationMenuActions,
} from "./action-catalog";

// Compatibility entry point. Production can construct a catalog once and pass
// that snapshot to coreActionMenuTemplate, palette and key-delivery helpers.
export function terminalApplicationMenuTemplate(
  applicationName: string,
  actions: TerminalApplicationMenuActions,
  keybinds: TerminalKeybinds,
  t: Translator["t"] = translatorFor(DEFAULT_LANGUAGE).t,
): MenuItemConstructorOptions[] {
  return coreActionMenuTemplate(
    applicationName,
    createCoreActionCatalog(applicationName, actions, keybinds, t),
    t,
  );
}

export function coreActionMenuTemplate(
  applicationName: string,
  catalog: CoreActionCatalog,
  t: Translator["t"] = translatorFor(DEFAULT_LANGUAGE).t,
): MenuItemConstructorOptions[] {
  const item = (id: CoreActionId): MenuItemConstructorOptions => {
    const action = catalog[id];
    return {
      ...(id === "about" ? { id } : {}),
      label: action.label,
      ...accelerator(action.accelerator),
      click: action.invoke,
    };
  };
  return [
    {
      label: applicationName,
      submenu: [
        item("about"),
        { type: "separator" },
        item("settings"),
        { type: "separator" },
        item("quit"),
      ],
    },
    {
      label: t("menu.edit"),
      submenu: [
        item("copy"),
        item("paste"),
        { type: "separator" },
        item("selectAll"),
        { type: "separator" },
        item("find"),
      ],
    },
    {
      label: t("menu.file"),
      submenu: [
        item("newWindow"),
        item("newTab"),
        { type: "separator" },
        item("openLocalImage"),
        ...Object.values(catalog)
          .filter((action) => action.extension)
          .map((action) => ({
            label: action.label,
            click: action.invoke,
          })),
        { type: "separator" },
        item("closeTab"),
        item("closeWindow"),
      ],
    },
    {
      label: t("menu.view"),
      submenu: [
        item("commandPalette"),
        { type: "separator" },
        item("zoomIn"),
        item("zoomOut"),
        item("actualSize"),
        { type: "separator" },
        item("toggleAuxiliaryPanel"),
        item("toggleSnippets"),
        item("toggleTabBar"),
        item("toggleTitleBar"),
        { type: "separator" },
        {
          label: t("menu.pane"),
          submenu: [
            item("splitRight"),
            item("splitDown"),
            { type: "separator" },
            item("focusNextPane"),
            item("focusPreviousPane"),
            item("focusPaneLeft"),
            item("focusPaneRight"),
            item("focusPaneUp"),
            item("focusPaneDown"),
            { type: "separator" },
            item("equalizePanes"),
            item("closePane"),
          ],
        },
        { type: "separator" },
        item("reloadConfig"),
        item("devTools"),
        { type: "separator" },
        item("toggleFullScreen"),
      ],
    },
    {
      label: t("menu.window"),
      submenu: [
        { role: "minimize", label: t("menu.minimize") },
        item("alwaysOnTop"),
        { type: "separator" },
        item("nextTab"),
        item("previousTab"),
        {
          label: t("menu.selectTab"),
          submenu: Array.from({ length: 9 }, (_, index) =>
            item(`selectTab${index + 1}` as CoreActionId),
          ),
        },
      ],
    },
  ];
}

// A null keybind leaves the item without a shortcut; the action stays usable.
function accelerator(value: string | null): { accelerator?: string } {
  return value === null ? {} : { accelerator: value };
}

// Legacy callers need only callbacks. No behavior mapping lives here.
export function terminalActionInvocations(
  actions: TerminalApplicationMenuActions,
) {
  return coreActionInvocations(
    createCoreActionCatalog("OMXTerm", actions, DEFAULT_TERMINAL_KEYBINDS),
  );
}

export function terminalClipboardContextMenuTemplate(
  actions: {
    readonly copy: () => void;
    readonly paste: () => void;
    readonly selectAll: () => void;
    // Present only for a split pane; shows the current closePane keybind.
    readonly closePane?: {
      readonly click: () => void;
      readonly accelerator: string | null;
    };
  },
  t: Translator["t"] = translatorFor(DEFAULT_LANGUAGE).t,
): MenuItemConstructorOptions[] {
  return [
    { label: t("menu.copy"), click: actions.copy },
    { label: t("menu.paste"), click: actions.paste },
    { type: "separator" },
    { label: t("menu.selectAll"), click: actions.selectAll },
    ...(actions.closePane
      ? ([
          { type: "separator" },
          {
            label: t("menu.closePane"),
            ...accelerator(actions.closePane.accelerator),
            click: actions.closePane.click,
          },
        ] satisfies MenuItemConstructorOptions[])
      : []),
  ];
}
