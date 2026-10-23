import type { TerminalActionName } from "../shared/terminal-keybinds";
import type { TerminalApplicationMenuActions } from "./application-menu";

type SelectTabAction = Extract<TerminalActionName, `selectTab${number}`>;

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
    splitRight: () => actions.splitSelectedPane("right"),
    splitDown: () => actions.splitSelectedPane("down"),
    closePane: actions.closeSelectedPane,
    focusNextPane: () => actions.focusPaneInSelectedWindow("next"),
    focusPreviousPane: () => actions.focusPaneInSelectedWindow("previous"),
    focusPaneLeft: () => actions.focusPaneInSelectedWindow("left"),
    focusPaneRight: () => actions.focusPaneInSelectedWindow("right"),
    focusPaneUp: () => actions.focusPaneInSelectedWindow("up"),
    focusPaneDown: () => actions.focusPaneInSelectedWindow("down"),
    toggleMaximizePane: actions.toggleSelectedPaneMaximized,
    equalizePanes: actions.equalizeSelectedPanes,
    toggleBroadcast: actions.toggleSelectedBroadcast,
    toggleSessions: actions.toggleSelectedSessions,
    toggleCommands: actions.toggleSelectedCommands,
    commandPalette: actions.toggleSelectedCommandPalette,
    find: actions.findInSelectedWindow,
    preferences: actions.openPreferences ?? (() => {}),
    toggleFiles: actions.toggleSelectedFiles ?? (() => {}),
    toggleAssistant: actions.toggleSelectedAssistant ?? (() => {}),
    roundMore: () => actions.adjustCornerRadius?.(2),
    roundLess: () => actions.adjustCornerRadius?.(-2),
    autoHideTitleBar: () => actions.setAutoHideTitleBar?.(true),
    alwaysShowTitleBar: () => actions.setAutoHideTitleBar?.(false),
    toggleAlwaysOnTop: actions.toggleSelectedAlwaysOnTop,
    toggleDevTools: actions.toggleSelectedDevTools,
    openLocalImage: actions.openLocalImage,
    toggleHighlighting: actions.toggleOutputHighlighting ?? (() => {}),
    highlightRules: actions.openHighlightRules ?? (() => {}),
    backUpSettings: actions.backUpSettings,
    restoreSettings: actions.restoreSettings,
    toggleRestoreWindows: actions.toggleRestoreWorkspace ?? (() => {}),
    about: actions.showAbout ?? (() => {}),
  });
}
