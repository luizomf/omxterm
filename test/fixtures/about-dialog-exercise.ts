import assert from "node:assert/strict";
import { app, ipcMain, Menu, type BrowserWindow } from "electron";
import { startAbout } from "../../src/main/about-wiring";
import type { TerminalIpcRouter } from "../../src/main/terminal-ipc-types";

export function createAboutExercise(
  router: TerminalIpcRouter,
  getWindow: () => BrowserWindow,
) {
  const openedLinks: string[] = [];
  const about = startAbout({
    ipcMain,
    isTrustedSender: router.isTrustedSender,
    getVersion: () => app.getVersion(),
    selectedContents: () => getWindow().webContents,
    openExternal: async (url) => {
      openedLinks.push(url);
    },
  });
  return {
    show: about.show,
    async exercise() {
      try {
        await exerciseAboutDialog(getWindow(), openedLinks);
      } finally {
        about.dispose();
      }
    },
  };
}

// Real Electron menu callback, preload, host, dialog and Terminal Surface.
// Synthetic input is not a claim of physical menu navigation or pixel parity.
export async function exerciseAboutDialog(
  window: BrowserWindow,
  openedLinks: readonly string[],
) {
  const contents = window.webContents;
  const waitFor = async (expression: string) => {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      if (await contents.executeJavaScript(expression)) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error("About fixture did not reach its expected state");
  };
  const item = Menu.getApplicationMenu()?.getMenuItemById("about");
  assert.ok(item);
  const click = item.click as (
    item: Electron.MenuItem,
    window: BrowserWindow,
    event: object,
  ) => void;
  const open = () => click(item, window, {});
  window.focus();
  open();
  open();
  await waitFor(
    "document.querySelector('.about-dialog')?.textContent.includes('Version ')",
  );
  assert.equal(
    await contents.executeJavaScript(
      "document.querySelectorAll('.about-dialog').length",
    ),
    1,
  );
  await waitFor(
    "document.querySelector('.about-dialog img')?.naturalWidth > 0",
  );
  assert.equal(
    await contents.executeJavaScript("document.activeElement?.textContent"),
    "Close",
  );
  contents.sendInputEvent({ type: "keyDown", keyCode: "Tab" });
  contents.sendInputEvent({ type: "keyUp", keyCode: "Tab" });
  await waitFor(
    "document.querySelector('.about-dialog').contains(document.activeElement)",
  );
  await contents.executeJavaScript(
    "[...document.querySelectorAll('.about-links button')].find(b => b.textContent === 'Contributors').click()",
  );
  const deadline = Date.now() + 5_000;
  while (openedLinks.length === 0 && Date.now() < deadline)
    await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(
    openedLinks.at(-1),
    "https://github.com/luizomf/omxterm/blob/main/CONTRIBUTORS.md",
  );
  await contents.executeJavaScript("window.dispatchEvent(new Event('focus'))");
  await waitFor(
    "document.querySelector('.about-dialog').contains(document.activeElement)",
  );
  const original = window.getSize();
  const minimum = window.getMinimumSize();
  window.setMinimumSize(320, 200);
  window.setSize(320, 200);
  for (const [background, foreground] of [
    ["#ffffff", "#101010"],
    ["#101010", "#ffffff"],
  ]) {
    await contents.executeJavaScript(
      `document.documentElement.style.setProperty('--terminal-background', '${background}'); document.documentElement.style.setProperty('--terminal-foreground', '${foreground}')`,
    );
    await waitFor(
      "(() => { const d = document.querySelector('.about-dialog'); const r = d.getBoundingClientRect(); return r.width <= innerWidth && r.height <= innerHeight && r.top >= 0; })()",
    );
    await contents.executeJavaScript(
      "document.querySelector('.about-close').focus()",
    );
    await waitFor(
      "(() => { const r = document.activeElement.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; })()",
    );
  }
  window.setMinimumSize(minimum[0]!, minimum[1]!);
  window.setSize(original[0]!, original[1]!);
  contents.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
  contents.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
  await waitFor(
    "!document.querySelector('.about-dialog') && document.querySelector('.terminal-surface:not([hidden])').contains(document.activeElement)",
  );
  open();
  await waitFor("!!document.querySelector('.about-dialog')");
  await contents.executeJavaScript(
    "document.querySelector('.about-close').click()",
  );
  await waitFor("!document.querySelector('.about-dialog')");
}
