import assert from "node:assert/strict";
import { Menu, type BrowserWindow } from "electron";
import {
  terminalApplicationMenuTemplate,
  terminalActionInvocations,
} from "../../src/main/application-menu";
import { deliverKeybindsFromKeyEvents } from "../../src/main/keybind-delivery";
import { installApplicationMenu } from "../../src/main/native-application-menu";
import { terminalDefaultKeybinds } from "../../src/shared/terminal-keybinds";
import type { TerminalApplication } from "../../src/main/terminal-application";

export interface MenuOpening {
  readonly menu: Menu;
  readonly x: number;
  readonly y: number;
}

async function waitFor(
  predicate: () => boolean | Promise<boolean>,
  label: string,
) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error(`Timed out waiting for ${label}`);
}

// This is a real Electron popup/renderer integration check, not native pixel or
// physical-keyboard evidence. OS-level helpers still verify navigation, action
// selection, Escape/outside-click dismissal and placement on each desktop.
export async function exerciseApplicationMenu(
  window: BrowserWindow,
  application: TerminalApplication<BrowserWindow>,
  openings: readonly MenuOpening[],
  showAbout: () => void,
) {
  let bindings = terminalDefaultKeybinds(process.platform);
  let titleActions = 0;
  const unexpected = () => assert.fail("Unexpected fixture menu action");
  const actions = {
    newWindow: unexpected,
    closeSelectedWindow: unexpected,
    newTabInSelectedWindow: unexpected,
    closeSelectedTab: unexpected,
    selectNextTab: unexpected,
    selectPreviousTab: unexpected,
    selectTabInSelectedWindow: unexpected,
    requestQuit: unexpected,
    toggleSelectedFullScreen: unexpected,
    toggleSelectedAlwaysOnTop: unexpected,
    toggleSelectedDevTools: unexpected,
    zoomInSelectedWindow: unexpected,
    zoomOutSelectedWindow: unexpected,
    resetSelectedWindowZoom: unexpected,
    copySelectedTerminal: unexpected,
    pasteSelectedTerminal: unexpected,
    selectAllSelectedTerminal: unexpected,
    findInSelectedTerminal: unexpected,
    toggleSelectedSnippets: unexpected,
    toggleSelectedTabBar: unexpected,
    toggleSelectedTitleBar() {
      titleActions += 1;
      application.toggleSelectedTitleBar();
    },
    reloadUserConfiguration: unexpected,
    openLocalImage: unexpected,
    showAbout,
    showSettings: unexpected,
  };
  const invocations = terminalActionInvocations(actions);
  deliverKeybindsFromKeyEvents(
    window.webContents,
    () => bindings,
    (action) => invocations[action](),
    process.platform,
  );
  let shown = 0;
  let closed = 0;
  const install = () => {
    const menu = installApplicationMenu(
      terminalApplicationMenuTemplate("OMXTerm", actions, bindings),
    );
    menu.on("menu-will-show", () => {
      shown += 1;
    });
    menu.on("menu-will-close", () => {
      closed += 1;
    });
    return menu;
  };
  const visibleTitle = async () =>
    (await window.webContents.executeJavaScript(
      "!document.querySelector('.window-title-bar').hidden",
    )) as boolean;
  const terminalFocused = async () =>
    (await window.webContents.executeJavaScript(
      "document.querySelector('.terminal-surface:not([hidden])').contains(document.activeElement)",
    )) as boolean;
  window.focus();
  await waitFor(terminalFocused, "terminal focus before native menu");
  const sendAlt = () => {
    window.webContents.sendInputEvent({
      type: "keyDown",
      keyCode: "Alt",
      modifiers: ["alt"],
    });
    window.webContents.sendInputEvent({ type: "keyUp", keyCode: "Alt" });
  };
  const open = async (menu: Menu, y: number) => {
    const count = openings.length;
    const previousShown = shown;
    sendAlt();
    await waitFor(
      () => openings.length === count + 1 && shown === previousShown + 1,
      "real native popup opens from Alt release",
    );
    assert.deepEqual(openings.at(-1), { menu, x: 8, y });
    assert.deepEqual(
      menu.items.map((item) => item.label),
      ["OMXTerm", "Edit", "File", "View", "Window"],
    );
  };
  const dismiss = async (menu: Menu) => {
    const count = closed;
    menu.closePopup(window);
    await waitFor(() => closed === count + 1, "native popup close event");
    await waitFor(
      terminalFocused,
      "native menu dismissal retains terminal focus",
    );
  };
  const initial = install();
  if (process.platform === "darwin") return "unchanged-macos";
  await open(initial, 42);
  await dismiss(initial);
  // Same effective invocation path as the displayed menu, consumed exactly once.
  window.webContents.sendInputEvent({
    type: "keyDown",
    keyCode: "D",
    modifiers: ["control", "shift"],
  });
  window.webContents.sendInputEvent({
    type: "keyUp",
    keyCode: "D",
    modifiers: ["control", "shift"],
  });
  await waitFor(
    async () => !(await visibleTitle()),
    "title shortcut hides existing row",
  );
  assert.equal(titleActions, 1);
  await open(initial, 8);
  // Replacing an open menu must not keep its old hierarchy/shortcut snapshot.
  bindings = { ...bindings, toggleTitleBar: "Control+Shift+Y" };
  const reloaded = install();
  await waitFor(() => closed === 2, "old menu retires on reload");
  await open(reloaded, 8);
  const viewMenu = reloaded.items.find(
    (item) => item.label === "View",
  )!.submenu!;
  assert.equal(
    viewMenu.items.find((item) => item.label === "Toggle Title Bar")!
      .accelerator,
    "Control+Shift+Y",
  );
  await dismiss(reloaded);
  window.webContents.sendInputEvent({
    type: "keyDown",
    keyCode: "Y",
    modifiers: ["control", "shift"],
  });
  window.webContents.sendInputEvent({
    type: "keyUp",
    keyCode: "Y",
    modifiers: ["control", "shift"],
  });
  await waitFor(visibleTitle, "reloaded shortcut restores same title row");
  assert.equal(titleActions, 2);
  await open(reloaded, 42);
  await dismiss(reloaded);
  assert.equal(openings.length, 4);
  assert.equal(shown, 4);
  assert.equal(closed, 4);
  return "native-popup-reload-and-shortcuts";
}
