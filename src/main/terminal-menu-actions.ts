import type { BrowserWindow } from "electron";
import type { TerminalApplication } from "./terminal-application";
import type { TerminalApplicationMenuActions } from "./action-catalog";

// Project the existing terminal lifecycle policy, rather than duplicating it
// in extension or menu adapters.
export function terminalMenuActions(
  application: TerminalApplication<BrowserWindow>,
  extras: Pick<
    TerminalApplicationMenuActions,
    | "newWindow"
    | "reloadUserConfiguration"
    | "showAbout"
    | "showSettings"
    | "showCommandPalette"
  >,
): TerminalApplicationMenuActions {
  return {
    ...extras,
    closeSelectedWindow: () => void application.closeSelectedWindow(),
    newTabInSelectedWindow: application.newTabInSelectedWindow,
    closeSelectedTab: () => void application.closeSelectedTab(),
    closeSelectedPane: () => void application.closeSelectedPane(),
    splitSelectedPane: application.splitSelectedPane,
    focusSelectedPane: application.focusSelectedPane,
    equalizeSelectedPanes: application.equalizeSelectedPanes,
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
    findInSelectedTerminal: application.findInSelectedWindow,
    toggleSelectedSnippets: application.toggleSelectedSnippets,
    toggleSelectedTabBar: application.toggleSelectedTabBar,
    toggleSelectedAuxiliaryPanel: application.toggleSelectedAuxiliaryPanel,
    toggleSelectedTitleBar: application.toggleSelectedTitleBar,
    openLocalImage: application.openLocalImageInSelectedWindow,
  };
}
