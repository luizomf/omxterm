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
    exercise: (underlying: "terminal" | "settings" = "terminal") =>
      exerciseAboutDialog(getWindow(), openedLinks, underlying),
    dispose: about.dispose,
  };
}

// Real Electron menu callback, preload, host, dialog and Terminal Surface.
// Synthetic input is not a claim of physical menu navigation or pixel parity.
export async function exerciseAboutDialog(
  window: BrowserWindow,
  openedLinks: readonly string[],
  underlying: "terminal" | "settings" = "terminal",
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
  // Inspect actual application paint, not only the About surface declaration.
  const assertUnderlays = async (active: boolean) => {
    const treatment: unknown = await contents.executeJavaScript(`(() => {
      const underlays = [...document.querySelectorAll('body > :not(dialog, script, style, link)')];
      const content = document.querySelector('${underlying === "terminal" ? ".terminal-surface:not([hidden])" : ".settings-dialog"}');
      return {
        modal: !!document.querySelector('body > .about-dialog:modal'),
        containsContent: underlays.some(element => element === content || element.contains(content)),
        filters: [...new Set(underlays.map(element => getComputedStyle(element).filter))],
        ancestors: [document.body, document.documentElement].map(element => ({
          filter: getComputedStyle(element).filter,
          backdrop: getComputedStyle(element).backdropFilter,
          opacity: getComputedStyle(element).opacity,
        })),
      };
    })()`);
    assert.deepEqual(treatment, {
      modal: active,
      containsContent: true,
      filters: [active ? "blur(12px)" : "none"],
      ancestors: Array.from({ length: 2 }, () => ({
        filter: "none",
        backdrop: "none",
        opacity: "1",
      })),
    });
  };
  if (underlying === "settings")
    await waitFor(
      "!!document.querySelector('.settings-dialog') && document.querySelector('.settings-dialog').contains(document.activeElement)",
    );
  await assertUnderlays(false);
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
  await assertUnderlays(true);
  // A late body sibling needs no observer or lifecycle registration.
  assert.equal(
    await contents.executeJavaScript(`(() => {
      const sibling = document.createElement('div');
      document.body.append(sibling);
      try { return getComputedStyle(sibling).filter; }
      finally { sibling.remove(); }
    })()`),
    "blur(12px)",
  );
  const browser = process.env.OMXTERM_TEST_ABOUT_BROWSER === "1";
  const previousLinkCount = openedLinks.length;
  await contents.executeJavaScript(
    `[...document.querySelectorAll('.about-links button')].find(b => b.textContent === '${browser ? "Project" : "Contributors"}').click()`,
  );
  const deadline = Date.now() + 5_000;
  while (openedLinks.length === previousLinkCount && Date.now() < deadline)
    await new Promise((resolve) => setTimeout(resolve, 25));
  assert.equal(openedLinks.length, previousLinkCount + 1);
  assert.equal(
    openedLinks[previousLinkCount],
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
      path.join(evidence, `about-${underlying}-normal.png`),
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
        // Computed CSS is a wiring oracle, not proof of rendered blur.
        await assertUnderlays(true);
        const treatment: unknown = await contents.executeJavaScript(`(() => {
          const dialog = document.querySelector('.about-dialog');
          const surface = getComputedStyle(dialog);
          const foreground = getComputedStyle(dialog.querySelector('.about-close'));
          return {
            backdrop: surface.backdropFilter,
            filter: surface.filter,
            opacity: surface.opacity,
            foregroundFilter: foreground.filter,
            foregroundOpacity: foreground.opacity,
            scrimFilter: getComputedStyle(dialog, '::backdrop').filter,
            scrimBackdrop: getComputedStyle(dialog, '::backdrop').backdropFilter,
          };
        })()`);
        assert.deepEqual(treatment, {
          backdrop: "none",
          filter: "none",
          opacity: "1",
          foregroundFilter: "none",
          foregroundOpacity: "1",
          scrimFilter: "none",
          scrimBackdrop: "none",
        });
        if (evidence) {
          await contents.executeJavaScript(
            "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
          );
          await writeFile(
            path.join(
              evidence,
              `about-${underlying}-${background === "#ffffff" ? "light" : "dark"}-opacity-${opacity}-small.png`,
            ),
            (await contents.capturePage()).toPNG(),
          );
        }
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
          `about-${underlying}-${background === "#ffffff" ? "light" : "dark"}-small.png`,
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
    `!document.querySelector('.about-dialog') && document.querySelector('${underlying === "terminal" ? ".terminal-surface:not([hidden])" : ".settings-dialog"}').contains(document.activeElement)`,
  );
  await assertUnderlays(false);
  open();
  await waitFor("!!document.querySelector('.about-dialog')");
  await assertUnderlays(true);
  await contents.executeJavaScript(
    "document.querySelector('.about-close').click()",
  );
  await waitFor(
    `!document.querySelector('.about-dialog') && document.querySelector('${underlying === "terminal" ? ".terminal-surface:not([hidden])" : ".settings-dialog"}').contains(document.activeElement)`,
  );
  await assertUnderlays(false);
}
