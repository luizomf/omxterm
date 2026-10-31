import { expect, it, vi } from "vitest";
import type { MenuItemConstructorOptions } from "electron";
import { translatorFor } from "../../src/shared/i18n";
import {
  TERMINAL_ACTION_NAMES,
  terminalDefaultKeybinds,
} from "../../src/shared/terminal-keybinds";
import {
  createCoreActionCatalog,
  coreActionInvocations,
  coreActionKeybinds,
  coreActionForKeyboardInput,
  corePaletteActions,
  type TerminalApplicationMenuActions,
} from "../../src/main/action-catalog";
import { coreActionMenuTemplate } from "../../src/main/application-menu";

it("projects a namespaced extension through the same menu and palette without adding a shortcut or replacing core actions", () => {
  const invoke = vi.fn();
  const bindings = terminalDefaultKeybinds("linux");
  const catalog = createCoreActionCatalog(
    "OMXTerm",
    menuActions(),
    bindings,
    undefined,
    [
      {
        id: "omxterm.files.open",
        label: "Files",
        invoke,
        palette: true,
        accelerator: "F9",
        extension: true,
      },
      {
        id: "quit",
        label: "Forged",
        invoke,
        palette: true,
        accelerator: null,
        extension: true,
      },
    ],
  );
  const contributed = catalog["omxterm.files.open"]!;
  expect(contributed.accelerator).toBeNull();
  expect(coreActionKeybinds(catalog)).toEqual(bindings);
  expect(catalog.quit.label).not.toBe("Forged");
  expect(corePaletteActions(catalog)).toContain(contributed);
  expect(
    flatten(coreActionMenuTemplate("OMXTerm", catalog)).find(
      (item) => item.label === "Files",
    )?.click,
  ).toBe(contributed.invoke);
  contributed.invoke();
  expect(invoke).toHaveBeenCalledOnce();
});

function menuActions(): TerminalApplicationMenuActions {
  return {
    newWindow: vi.fn(),
    closeSelectedWindow: vi.fn(),
    newTabInSelectedWindow: vi.fn(),
    closeSelectedTab: vi.fn(),
    selectNextTab: vi.fn(),
    selectPreviousTab: vi.fn(),
    selectTabInSelectedWindow: vi.fn(),
    requestQuit: vi.fn(),
    toggleSelectedFullScreen: vi.fn(),
    toggleSelectedAlwaysOnTop: vi.fn(),
    toggleSelectedDevTools: vi.fn(),
    zoomInSelectedWindow: vi.fn(),
    zoomOutSelectedWindow: vi.fn(),
    resetSelectedWindowZoom: vi.fn(),
    copySelectedTerminal: vi.fn(),
    pasteSelectedTerminal: vi.fn(),
    selectAllSelectedTerminal: vi.fn(),
    findInSelectedTerminal: vi.fn(),
    toggleSelectedSnippets: vi.fn(),
    toggleSelectedTabBar: vi.fn(),
    toggleSelectedAuxiliaryPanel: vi.fn(),
    toggleSelectedTitleBar: vi.fn(),
    reloadUserConfiguration: vi.fn(),
    openLocalImage: vi.fn(),
    showAbout: vi.fn(),
    showSettings: vi.fn(),
    showCommandPalette: vi.fn(),
    splitSelectedPane: vi.fn(),
    closeSelectedPane: vi.fn(),
    focusSelectedPane: vi.fn(),
    equalizeSelectedPanes: vi.fn(),
  };
}

function flatten(
  items: MenuItemConstructorOptions[],
): MenuItemConstructorOptions[] {
  return items.flatMap((item) => [
    item,
    ...(Array.isArray(item.submenu) ? flatten(item.submenu) : []),
  ]);
}

it.each(["en-US", "pt-BR"] as const)(
  "shares exact labels, effective accelerators and callbacks across projections in %s",
  (language) => {
    const actions = menuActions();
    const { t } = translatorFor(language);
    const bindings = {
      ...terminalDefaultKeybinds("linux"),
      commandPalette: "Control+Alt+P",
      splitRight: "Control+Alt+R",
      zoomIn: null,
    };
    const catalog = createCoreActionCatalog("OMXTerm", actions, bindings, t);
    const items = flatten(coreActionMenuTemplate("OMXTerm", catalog, t));
    const invocations = coreActionInvocations(catalog);
    expect(coreActionKeybinds(catalog)).toEqual(bindings);
    for (const id of TERMINAL_ACTION_NAMES) {
      expect(invocations[id]).toBe(catalog[id].invoke);
    }
    for (const action of Object.values(catalog)) {
      expect(catalog[action.id]).toBe(action);
      const item = items.find((item) => item.click === action.invoke);
      if (action.id === "toggleFiles" || action.id === "toggleSshConnect") {
        expect(item).toBeUndefined();
        expect(action.accelerator).toBeNull();
        continue;
      }
      expect(item?.label).toBe(action.label);
      expect(item?.accelerator ?? null).toBe(action.accelerator);
    }
    const palette = corePaletteActions(catalog);
    expect(palette.every((action) => action === catalog[action.id])).toBe(true);
    expect(
      Object.values(catalog)
        .filter((action) => !action.palette)
        .map((action) => action.id)
        .sort(),
    ).toEqual(
      [
        "copy",
        "paste",
        "selectAll",
        "find",
        "commandPalette",
        "toggleFiles",
        "toggleSshConnect",
        ...Array.from({ length: 9 }, (_, index) => `selectTab${index + 1}`),
      ].sort(),
    );
    for (const id of [
      "about",
      "settings",
      "openLocalImage",
      "alwaysOnTop",
      "devTools",
    ] as const) {
      expect(palette).toContain(catalog[id]);
      expect(catalog[id].accelerator).toBeNull();
    }
    const match = coreActionForKeyboardInput(
      catalog,
      {
        key: "p",
        control: true,
        meta: false,
        alt: true,
        shift: false,
      },
      "linux",
    );
    expect(match).toBe(catalog.commandPalette);
    expect(match?.label).toBe(t("action.commandPalette"));
    match?.invoke();
    expect(actions.showCommandPalette).toHaveBeenCalledOnce();
    expect(
      coreActionForKeyboardInput(
        catalog,
        {
          key: "+",
          control: true,
          meta: false,
          alt: false,
          shift: true,
        },
        "linux",
      ),
    ).toBeUndefined();
  },
);
