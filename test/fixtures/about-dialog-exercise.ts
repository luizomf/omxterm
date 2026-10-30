import assert from "node:assert/strict";
import { app, ipcMain, Menu, shell, type BrowserWindow } from "electron";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { startAbout } from "../../src/main/about-wiring";
import type { TerminalIpcRouter } from "../../src/main/terminal-ipc-types";

export function createAboutExercise(
  router: TerminalIpcRouter,
  getWindow: () => BrowserWindow,
  sendAction?: Parameters<typeof startAbout>[0]["sendAction"],
) {
  const openedLinks: string[] = [];
  const about = startAbout({
    ipcMain,
    ...(sendAction ? { sendAction } : {}),
    isTrustedSender: router.isTrustedSender,
    getVersion: () => app.getVersion(),
    selectedContents: () => getWindow().webContents,
    openExternal: async (url) => {
      openedLinks.push(url);
      if (process.env.OMXTERM_TEST_ABOUT_BROWSER === "1")
        await shell.openExternal(url);
    },
  });
  return {
    show: about.show,
    exercise: () => exerciseAboutDialog(getWindow(), openedLinks),
    dispose: about.dispose,
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
    throw new Error(`About fixture did not reach: ${expression}`);
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
  const browser = process.env.OMXTERM_TEST_ABOUT_BROWSER === "1";
  await contents.executeJavaScript(
    `[...document.querySelectorAll('.about-links button')].find(b => b.textContent === '${browser ? "Project" : "Contributors"}').click()`,
  );
  const deadline = Date.now() + 5_000;
  while (openedLinks.length === 0 && Date.now() < deadline)
    await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(
    openedLinks.at(-1),
    browser
      ? "https://github.com/luizomf/omxterm"
      : "https://github.com/luizomf/omxterm/blob/main/CONTRIBUTORS.md",
  );
  if (browser) {
    await waitFor("!document.hasFocus()");
    window.focus();
    await waitFor("document.hasFocus()");
    process.stdout.write(
      "__OMXTERM_ABOUT_BROWSER__external-handoff-and-return\n",
    );
  } else
    await contents.executeJavaScript(
      "window.dispatchEvent(new Event('focus'))",
    );
  await waitFor(
    "document.querySelector('.about-dialog').contains(document.activeElement)",
  );
  const evidence = process.env.OMXTERM_ABOUT_EVIDENCE_DIR;
  if (evidence) {
    await mkdir(evidence, { recursive: true });
    await writeFile(
      path.join(evidence, "about-normal.png"),
      (await contents.capturePage()).toPNG(),
    );
  }
  const original = window.getSize();
  const minimum = window.getMinimumSize();
  window.setMinimumSize(320, 200);
  window.setSize(320, 200);
  for (const [background, foreground] of [
    ["#ffffff", "#101010"],
    ["#101010", "#ffffff"],
  ]) {
    await contents.executeJavaScript(
      `document.documentElement.style.setProperty('--terminal-background', '${background}'); document.body.style.setProperty('--terminal-background', '${background}'); document.documentElement.style.setProperty('--terminal-foreground', '${foreground}')`,
    );
    await waitFor(
      "(() => { const d = document.querySelector('.about-dialog'); const r = d.getBoundingClientRect(); return r.width <= innerWidth && r.height <= innerHeight && r.top >= 0; })()",
    );
    const originalOpacity: unknown = await contents.executeJavaScript(
      "document.documentElement.style.getPropertyValue('--terminal-background-opacity')",
    );
    assert.equal(typeof originalOpacity, "string");
    try {
      for (const opacity of [0, 0.65, 1]) {
        // Normalize browser color serialization through actual RGBA readback.
        // Relative rgb() may serialize as color(srgb), not legacy rgb().
        const pixels = (await contents.executeJavaScript(`(() => {
          document.documentElement.style.setProperty('--terminal-background-opacity', '${opacity}');
          const canvas = document.createElement('canvas');
          canvas.width = 2; canvas.height = 1;
          const context = canvas.getContext('2d');
          context.fillStyle = getComputedStyle(document.querySelector('.about-dialog')).backgroundColor;
          context.fillRect(0, 0, 1, 1);
          context.fillStyle = 'rgba(${background === "#ffffff" ? "255,255,255" : "16,16,16"},${opacity})';
          context.fillRect(1, 0, 1, 1);
          return Array.from(context.getImageData(0, 0, 2, 1).data);
        })()`)) as number[];
        assert.deepEqual(pixels.slice(0, 4), pixels.slice(4, 8));
        assert.equal(pixels[3], Math.round(opacity * 255));
      }
    } finally {
      await contents.executeJavaScript(
        originalOpacity
          ? `document.documentElement.style.setProperty('--terminal-background-opacity', ${JSON.stringify(originalOpacity)})`
          : "document.documentElement.style.removeProperty('--terminal-background-opacity')",
      );
    }
    await contents.executeJavaScript(
      "document.querySelector('.about-close').focus()",
    );
    await waitFor(
      "(() => { const r = document.activeElement.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; })()",
    );
    if (evidence) {
      await mkdir(evidence, { recursive: true });
      await contents.executeJavaScript(
        "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
      );
      const image = await contents.capturePage();
      await writeFile(
        path.join(
          evidence,
          background === "#ffffff"
            ? "about-light-small.png"
            : "about-dark-small.png",
        ),
        image.toPNG(),
      );
    }
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
