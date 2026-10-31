import {
  DEFAULT_LANGUAGE,
  translatorFor,
  type Translator,
} from "../shared/i18n";
import {
  TERMINAL_ACTION_NAMES,
  terminalActionForKeyboardInput,
  type AcceleratorKeyboardInput,
  type TerminalActionName,
  type TerminalKeybinds,
} from "../shared/terminal-keybinds";
import type {
  TerminalPaneFocusTarget,
  TerminalSplitDirection,
} from "../shared/terminal-panes";

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
  readonly findInSelectedTerminal: () => void;
  readonly toggleSelectedSnippets: () => void;
  readonly toggleSelectedTabBar: () => void;
  readonly toggleSelectedAuxiliaryPanel: () => void;
  readonly toggleSelectedTitleBar: () => void;
  readonly reloadUserConfiguration: () => void;
  readonly openLocalImage: () => void;
  readonly showAbout: () => void;
  readonly showSettings: () => void;
  readonly showCommandPalette: () => void;
  readonly splitSelectedPane: (direction: TerminalSplitDirection) => void;
  readonly closeSelectedPane: () => void;
  readonly focusSelectedPane: (target: TerminalPaneFocusTarget) => void;
  readonly equalizeSelectedPanes: () => void;
}
export type CoreActionId =
  | TerminalActionName
  | "about"
  | "settings"
  | "openLocalImage"
  | "alwaysOnTop"
  | "devTools";
export interface CoreAction {
  readonly id: string;
  readonly extension?: boolean;
  readonly label: string;
  readonly accelerator: string | null;
  // These existing guarded callbacks own availability, target selection and
  // lifecycle policy for every entry point; metadata is not a second policy.
  readonly invoke: () => void;
  readonly palette: boolean;
}
export type CoreActionCatalog = Readonly<
  Record<CoreActionId, CoreAction> & Record<string, CoreAction>
>;
type SelectTabAction = TerminalActionName & `selectTab${number}`;

// The only behavior table. Menu layout references IDs; palette and key delivery
// project this same snapshot. Rebuild it when language/effective bindings change.
export function createCoreActionCatalog(
  applicationName: string,
  actions: TerminalApplicationMenuActions,
  keybinds: TerminalKeybinds,
  t: Translator["t"] = translatorFor(DEFAULT_LANGUAGE).t,
  extensions: readonly CoreAction[] = [],
): CoreActionCatalog {
  const action = (label: string, invoke: () => void, palette = true) => ({
    label,
    invoke,
    palette,
  });
  const definitions = {
    about: action(t("menu.about"), actions.showAbout),
    settings: action(t("menu.settings"), actions.showSettings),
    quit: action(
      t("menu.quit", { name: applicationName }),
      actions.requestQuit,
    ),
    copy: action(t("menu.copy"), actions.copySelectedTerminal, false),
    paste: action(t("menu.paste"), actions.pasteSelectedTerminal, false),
    selectAll: action(
      t("menu.selectAll"),
      actions.selectAllSelectedTerminal,
      false,
    ),
    find: action(t("menu.find"), actions.findInSelectedTerminal, false),
    newWindow: action(t("menu.newWindow"), actions.newWindow),
    newTab: action(t("menu.newTab"), actions.newTabInSelectedWindow),
    openLocalImage: action(t("menu.openLocalImage"), actions.openLocalImage),
    closeTab: action(t("menu.closeTab"), actions.closeSelectedTab),
    closeWindow: action(t("menu.closeWindow"), actions.closeSelectedWindow),
    commandPalette: action(
      t("action.commandPalette"),
      actions.showCommandPalette,
      false,
    ),
    zoomIn: action(t("menu.zoomIn"), actions.zoomInSelectedWindow),
    zoomOut: action(t("menu.zoomOut"), actions.zoomOutSelectedWindow),
    actualSize: action(t("menu.actualSize"), actions.resetSelectedWindowZoom),
    toggleSnippets: action(
      t("menu.toggleSnippets"),
      actions.toggleSelectedSnippets,
    ),
    toggleTabBar: action(t("menu.toggleTabBar"), actions.toggleSelectedTabBar),
    toggleAuxiliaryPanel: action(
      t("menu.toggleAuxiliaryPanel"),
      actions.toggleSelectedAuxiliaryPanel,
    ),
    toggleTitleBar: action(
      t("menu.toggleTitleBar"),
      actions.toggleSelectedTitleBar,
    ),
    splitRight: action(t("menu.splitRight"), () =>
      actions.splitSelectedPane("right"),
    ),
    splitDown: action(t("menu.splitDown"), () =>
      actions.splitSelectedPane("down"),
    ),
    focusNextPane: action(t("menu.focusNextPane"), () =>
      actions.focusSelectedPane("next"),
    ),
    focusPreviousPane: action(t("menu.focusPreviousPane"), () =>
      actions.focusSelectedPane("previous"),
    ),
    focusPaneLeft: action(t("menu.focusPaneLeft"), () =>
      actions.focusSelectedPane("left"),
    ),
    focusPaneRight: action(t("menu.focusPaneRight"), () =>
      actions.focusSelectedPane("right"),
    ),
    focusPaneUp: action(t("menu.focusPaneAbove"), () =>
      actions.focusSelectedPane("up"),
    ),
    focusPaneDown: action(t("menu.focusPaneBelow"), () =>
      actions.focusSelectedPane("down"),
    ),
    equalizePanes: action(
      t("menu.equalizePanes"),
      actions.equalizeSelectedPanes,
    ),
    closePane: action(t("menu.closePane"), actions.closeSelectedPane),
    reloadConfig: action(
      t("menu.reloadConfiguration"),
      actions.reloadUserConfiguration,
    ),
    devTools: action(
      t("menu.toggleDeveloperTools"),
      actions.toggleSelectedDevTools,
    ),
    toggleFullScreen: action(
      t("menu.toggleFullScreen"),
      actions.toggleSelectedFullScreen,
    ),
    alwaysOnTop: action(
      t("menu.alwaysOnTop"),
      actions.toggleSelectedAlwaysOnTop,
    ),
    nextTab: action(t("menu.showNextTab"), actions.selectNextTab),
    previousTab: action(t("menu.showPreviousTab"), actions.selectPreviousTab),
    ...(Object.fromEntries(
      Array.from({ length: 9 }, (_, index) => {
        const position = index + 1;
        return [
          `selectTab${position}`,
          action(
            t("menu.tab", { position }),
            () => actions.selectTabInSelectedWindow(position),
            false,
          ),
        ];
      }),
    ) as Record<SelectTabAction, ReturnType<typeof action>>),
  } satisfies Record<CoreActionId, ReturnType<typeof action>>;
  const contributed = Object.fromEntries(
    extensions
      .filter(
        (entry) =>
          entry.extension &&
          entry.id.includes(".") &&
          !Object.hasOwn(definitions, entry.id),
      )
      .map((entry) => [
        entry.id,
        Object.freeze({ ...entry, accelerator: null }),
      ]),
  );
  return Object.freeze({
    ...contributed,
    ...(Object.fromEntries(
      Object.entries(definitions).map(([id, definition]) => [
        id,
        Object.freeze({
          id,
          ...definition,
          accelerator: Object.hasOwn(keybinds, id)
            ? keybinds[id as TerminalActionName]
            : null,
        }),
      ]),
    ) as Record<CoreActionId, CoreAction>),
  });
}
export function coreActionInvocations(
  catalog: CoreActionCatalog,
): Readonly<Record<TerminalActionName, () => void>> {
  return Object.freeze(
    Object.fromEntries(
      TERMINAL_ACTION_NAMES.map((id) => [id, catalog[id].invoke]),
    ) as Record<TerminalActionName, () => void>,
  );
}
export function coreActionKeybinds(
  catalog: CoreActionCatalog,
): TerminalKeybinds {
  return Object.freeze(
    Object.fromEntries(
      TERMINAL_ACTION_NAMES.map((id) => [id, catalog[id].accelerator]),
    ) as Record<TerminalActionName, string | null>,
  );
}
export function coreActionForKeyboardInput(
  catalog: CoreActionCatalog,
  input: AcceleratorKeyboardInput,
  platform = "darwin",
): CoreAction | undefined {
  const id = terminalActionForKeyboardInput(
    coreActionKeybinds(catalog),
    input,
    platform,
  );
  return id === undefined ? undefined : catalog[id];
}
export function corePaletteActions(
  catalog: CoreActionCatalog,
): readonly CoreAction[] {
  return Object.values(catalog).filter((action) => action.palette);
}
