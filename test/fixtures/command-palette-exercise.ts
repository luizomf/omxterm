import assert from "node:assert/strict";
import { ipcMain, type BrowserWindow, type Menu } from "electron";
import {
  createCoreActionCatalog,
  coreActionInvocations,
  coreActionKeybinds,
} from "../../src/main/action-catalog";
import { coreActionMenuTemplate } from "../../src/main/application-menu";
import { startCommandPalette } from "../../src/main/command-palette";
import { installApplicationMenu } from "../../src/main/native-application-menu";
import { terminalDefaultKeybinds } from "../../src/shared/terminal-keybinds";
import type { TerminalApplication } from "../../src/main/terminal-application";
import type { TerminalIpcRouter } from "../../src/main/terminal-ipc-types";
import { createSettingsExercise } from "./settings-dialog-exercise";
import type { createFixtureSessionInput } from "./fixture-session-input";
import { waitFor } from "./window-chrome-exercise";

// Uses production preload, renderer, catalog, matcher and palette capability owner.
// Input is synthetic Chromium delivery, not physical keyboard/menu navigation.
function find(menu: Menu, label: string): Electron.MenuItem | undefined {
  for (const item of menu.items) {
    if (item.label === label) return item;
    const nested = item.submenu && find(item.submenu, label);
    if (nested) return nested;
  }
  return undefined;
}

export async function exerciseCommandPalette(options: {
  window: BrowserWindow;
  application: TerminalApplication<BrowserWindow>;
  router: TerminalIpcRouter;
  root: string;
  apply: Parameters<typeof createSettingsExercise>[3];
  showAbout(): void;
  input: ReturnType<typeof createFixtureSessionInput>;
  output(data: string): void;
  ownPalette(manager: ReturnType<typeof startCommandPalette>): void;
}) {
  const { window, application } = options;
  const contents = window.webContents;
  const js = (expression: string) => contents.executeJavaScript(expression);
  const until = (expression: string) =>
    waitFor(() => js(expression), expression);
  const key = (keyCode: string) => {
    contents.sendInputEvent({ type: "keyDown", keyCode });
    contents.sendInputEvent({ type: "keyUp", keyCode });
  };
  const held = (keyCode: string) => {
    contents.sendInputEvent({ type: "keyDown", keyCode });
    contents.sendInputEvent({
      type: "keyDown",
      keyCode,
      modifiers: ["isautorepeat"],
    });
    contents.sendInputEvent({ type: "keyUp", keyCode });
  };
  const settings = createSettingsExercise(
    options.root,
    options.router,
    () => window,
    options.apply,
    {
      keybinds: () => coreActionKeybinds(catalog),
      invokeAction: (action) => coreActionInvocations(catalog)[action](),
    },
  );
  const unexpected = () => assert.fail("Unexpected palette fixture action");
  let toggles = 0;
  const actions = {
    ...application,
    newWindow: unexpected,
    closeSelectedWindow: unexpected,
    newTabInSelectedWindow: unexpected,
    closeSelectedTab: unexpected,
    selectNextTab: unexpected,
    selectPreviousTab: unexpected,
    selectTabInSelectedWindow: unexpected,
    requestQuit: unexpected,
    zoomInSelectedWindow: unexpected,
    zoomOutSelectedWindow: unexpected,
    resetSelectedWindowZoom: unexpected,
    copySelectedTerminal: unexpected,
    pasteSelectedTerminal: unexpected,
    selectAllSelectedTerminal: unexpected,
    findInSelectedTerminal: unexpected,
    reloadUserConfiguration: unexpected,
    openLocalImage: unexpected,
    showAbout: options.showAbout,
    showSettings: settings.show,
    showCommandPalette: () => palette.show(),
    toggleSelectedTabBar() {
      toggles += 1;
      application.toggleSelectedTabBar();
    },
  };
  let bindings = terminalDefaultKeybinds(process.platform);
  let catalog = createCoreActionCatalog("OMXTerm", actions, bindings);
  const palette = startCommandPalette({
    ipcMain,
    isTrustedSender: options.router.isTrustedSender,
    selectedContents: () => (window.isFocused() ? contents : undefined),
    catalog: () => catalog,
  });
  options.ownPalette(palette);
  const install = () =>
    installApplicationMenu(coreActionMenuTemplate("OMXTerm", catalog));
  const opened = () =>
    until(
      "document.querySelectorAll('.command-palette [role=option]').length > 1",
    );
  const closed = () => until("!document.querySelector('.command-palette')");
  const query = async (text: string) => {
    await js(
      `(() => { const input = document.querySelector('.command-palette input'); input.value = ${JSON.stringify(text)}; input.dispatchEvent(new Event('input', { bubbles: true })); })()`,
    );
  };
  const inputs: string[] = [];
  await waitFor(() => options.input?.isReady() ?? false, "palette child ready");
  const release = options.input.capture((data) => inputs.push(data));
  try {
    window.focus();
    await waitFor(() => window.isFocused(), "palette focused window");
    options.output("\u001b[?1004l\u001b[>0u\u001b[?u");
    await waitFor(
      () => inputs.join("").endsWith("\u001b[?0u"),
      "palette keyboard handshake",
    );
    // The tab strip is deliberately hidden for one tab regardless of its
    // preference. Retain Settings as a second tab for the visibility oracle.
    settings.show();
    await until("!!document.querySelector('.settings-dialog input')");
    options.application.selectTabInSelectedWindow(1);
    await until(
      "document.querySelector('.settings-dialog').closest('[hidden]') !== null",
    );
    assert.equal(
      bindings.commandPalette,
      process.platform === "darwin"
        ? "CommandOrControl+Shift+P"
        : "Control+Shift+P",
    );
    const item = find(install(), catalog.commandPalette.label);
    assert.ok(item, "palette remains in native menu");
    assert.equal(item.accelerator, bindings.commandPalette);
    const click = item.click as (
      item: Electron.MenuItem,
      window: BrowserWindow,
      event: object,
    ) => void;
    click(item, window, {});
    await opened();
    key("Down");
    await until(
      "document.querySelector('.command-palette input').getAttribute('aria-activedescendant') === 'command-palette-option-1'",
    );
    key("Up");
    await until(
      "document.querySelector('.command-palette input').getAttribute('aria-activedescendant') === 'command-palette-option-0'",
    );
    await query("no-such-synthetic-action");
    assert.equal(
      await js(
        "document.querySelectorAll('.command-palette [role=option]').length",
      ),
      0,
    );
    const beforeCancel = inputs.join("");
    held("Escape");
    await closed();
    key("Escape");
    await waitFor(
      () => inputs.join("").length > beforeCancel.length,
      "terminal cancel receipt",
    );
    assert.equal(
      inputs.join("").slice(beforeCancel.length),
      "\u001b",
      "held palette Escape must not reach PTY",
    );

    const beforeDefault = inputs.join("");
    const modifiers: Electron.KeyboardInputEvent["modifiers"] = [
      process.platform === "darwin" ? "meta" : "control",
      "shift",
    ];
    contents.sendInputEvent({ type: "keyDown", keyCode: "P", modifiers });
    contents.sendInputEvent({ type: "keyUp", keyCode: "P", modifiers });
    await opened();
    held("Escape");
    await closed();
    key("Escape");
    await waitFor(
      () => inputs.join("").length > beforeDefault.length,
      "default palette terminal receipt",
    );
    assert.equal(
      inputs.join("").slice(beforeDefault.length),
      "\u001b",
      "default palette chord must not reach PTY",
    );

    bindings = { ...bindings, commandPalette: "F6" };
    catalog = createCoreActionCatalog("OMXTerm", actions, bindings);
    install();
    key("F6");
    await opened();
    await query(catalog.toggleTabBar.label);
    assert.equal(
      await js(
        "document.querySelectorAll('.command-palette [role=option]').length",
      ),
      1,
    );
    const barBefore: unknown = await js(
      "document.querySelector('[role=tablist]').hidden",
    );
    const beforeEnter = inputs.join("");
    held("Enter");
    await closed();
    await waitFor(() => toggles === 1, "one catalog toggle invocation");
    await until(
      `document.querySelector('[role=tablist]').hidden !== ${JSON.stringify(barBefore)}`,
    );
    key("Escape");
    await waitFor(
      () => inputs.join("").length > beforeEnter.length,
      "terminal invoke receipt",
    );
    assert.equal(
      inputs.join("").slice(beforeEnter.length),
      "\u001b",
      "held palette Enter must not reach PTY",
    );

    // Replace the catalog while its snapshot is visible: old lease cannot act.
    key("F6");
    await opened();
    await query(catalog.toggleTabBar.label);
    catalog = createCoreActionCatalog("OMXTerm", actions, bindings);
    key("Enter");
    await closed();
    // A fresh snapshot/invoke is an ordered IPC receipt after the rejected invoke.
    key("F6");
    await opened();
    await query(catalog.about.label);
    key("Enter");
    await until("!!document.querySelector('.about-dialog[open]')");
    assert.equal(toggles, 1, "stale catalog must not invoke old callback");
    key("Escape");
    await until("!document.querySelector('.about-dialog[open]')");

    settings.show();
    await until(
      "document.querySelector('.settings-dialog').closest('[hidden]') === null",
    );
    await js(
      `(() => { [...document.querySelectorAll('.settings-dialog button')].find(button => button.textContent === 'Config File').click(); const input = document.querySelector('.settings-config-file textarea'); input.value = 'palette unsaved draft'; input.dispatchEvent(new Event('input')); input.focus(); input.dataset.paletteDraft = 'true'; })()`,
    );
    key("F6");
    await opened();
    key("Escape");
    await closed();
    assert.equal(
      await js("document.activeElement?.dataset.paletteDraft"),
      "true",
    );
    assert.equal(
      await js("document.activeElement.value"),
      "palette unsaved draft",
    );
    return {
      palette:
        "menu-remap-filter-navigation-input-actions-stale-catalog-settings-verified",
      input: "synthetic-chromium-not-physical",
    };
  } finally {
    release();
    options.output("\u001b[<u\u001b[?1004h");
    settings.dispose();
    palette.dispose();
  }
}
