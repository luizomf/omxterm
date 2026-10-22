import type { TerminalApplicationMenuActions } from "./application-menu";
import type { TerminalApplication } from "./terminal-application";

// The application menu's actions, which keyboard shortcuts and the command
// palette also invoke, bound to the running Terminal Application.
export function applicationMenuActions(
  application: TerminalApplication,
  extra: Pick<
    TerminalApplicationMenuActions,
    | "newWindow"
    | "reloadUserConfiguration"
    | "backUpSettings"
    | "restoreSettings"
  > &
    Partial<TerminalApplicationMenuActions>,
): TerminalApplicationMenuActions {
  return {
    closeSelectedWindow: () => void application.closeSelectedWindow(),
    newTabInSelectedWindow: application.newTabInSelectedWindow,
    closeSelectedTab: () => void application.closeSelectedTab(),
    selectNextTab: application.selectNextTab,
    selectPreviousTab: application.selectPreviousTab,
    selectTabInSelectedWindow: application.selectTabInSelectedWindow,
    requestQuit: () => void application.requestQuit(),
    toggleSelectedFullScreen: application.toggleSelectedFullScreen,
    toggleSelectedAlwaysOnTop: application.toggleSelectedAlwaysOnTop,
    toggleSelectedDevTools: application.toggleSelectedDevTools,
    zoomInSelectedWindow: () => application.zoomSelectedWindow("in"),
    zoomOutSelectedWindow: () => application.zoomSelectedWindow("out"),
    resetSelectedWindowZoom: () => application.zoomSelectedWindow("reset"),
    copySelectedTerminal: () => application.clipboardSelectedWindow("copy"),
    pasteSelectedTerminal: () => application.clipboardSelectedWindow("paste"),
    selectAllSelectedTerminal: () =>
      application.clipboardSelectedWindow("select-all"),
    toggleSelectedSnippets: application.toggleSelectedSnippets,
    toggleSelectedTabBar: application.toggleSelectedTabBar,
    toggleSelectedTitleBar: application.toggleSelectedTitleBar,
    openLocalImage: application.openLocalImageInSelectedWindow,
    splitSelectedPane: application.splitSelectedPane,
    closeSelectedPane: () => void application.closeSelectedPane(),
    focusPaneInSelectedWindow: application.focusPaneInSelectedWindow,
    toggleSelectedPaneMaximized: application.toggleSelectedPaneMaximized,
    equalizeSelectedPanes: application.equalizeSelectedPanes,
    findInSelectedWindow: application.findInSelectedWindow,
    toggleSelectedBroadcast: application.toggleSelectedBroadcast,
    toggleSelectedSessions: application.toggleSelectedSessions,
    toggleSelectedCommands: application.toggleSelectedCommands,
    toggleSelectedCommandPalette: application.toggleSelectedCommandPalette,
    ...extra,
  };
}
