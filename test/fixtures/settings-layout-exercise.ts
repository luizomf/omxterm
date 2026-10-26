import assert from "node:assert/strict";
import type { BrowserWindow } from "electron";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SupportedLanguage } from "../../src/shared/i18n";

// Real Chromium layout/focus over the retained production Settings view. The
// caller supplies synthetic palette/language snapshots through the normal host
// configuration route. This is not physical keyboard or OS-widget evidence.
export async function exerciseSettingsLayout(
  window: BrowserWindow,
  configure: (language: SupportedLanguage, light: boolean) => void,
  restore: () => void,
) {
  const contents = window.webContents;
  const evaluate = <T>(script: string) =>
    contents.executeJavaScript(script, true) as Promise<T>;
  const frame = () =>
    evaluate(
      "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
    );
  const original = window.getContentBounds();
  const minimum = window.getMinimumSize();
  const matrix = (["en-US", "pt-BR"] as const).flatMap((language) =>
    [false, true].flatMap((light) =>
      [
        [320, 200],
        [640, 480],
        [800, 600],
        [960, 640],
        [1280, 800],
        [1920, 1080],
      ].map(([width, height]) => ({
        language,
        light,
        width: width!,
        height: height!,
      })),
    ),
  );
  const evidence = process.env.OMXTERM_SETTINGS_EVIDENCE_DIR;
  if (evidence) await mkdir(evidence, { recursive: true });
  let cases = 0;
  try {
    for (const { language, light, width, height } of matrix) {
      configure(language, light);
      await frame();
      window.setContentSize(width, height);
      await frame();
      // Resize/theme/language must retain the same category controls and
      // editor. Long synthetic content checks wrapping without private data.
      await evaluate(`(() => {
            const editor = document.querySelector('.settings-config-file textarea');
            globalThis.settingsLayoutEditor ??= editor;
            if (globalThis.settingsLayoutEditor !== editor) throw Error('Settings editor replaced');
            document.querySelector('.settings-path').textContent = '/synthetic/' + 'long-segment-'.repeat(40) + '/config.json';
          })()`);
      for (const category of [
        "general",
        "appearance",
        "terminal",
        "new-windows",
        "shortcuts",
        "config-file",
      ]) {
        // New Windows uses the existing page id (window).
        const id = category === "new-windows" ? "window" : category;
        await evaluate(`document.querySelector('#settings-tab-${id}').click()`);
        await frame();
        const result = await evaluate<{
          overflow: boolean;
          visible: number;
          focus: boolean;
          scheme: string;
          width: number;
          height: number;
        }>(`(() => {
              const root = document.querySelector('.settings-dialog');
              const panel = root.querySelector('.settings-panel:not([hidden])');
              const scroll = root.querySelector('.settings-panels');
              const controls = [...panel.querySelectorAll('button:not(:disabled), input, select, textarea')];
              const target = controls.at(-1);
              globalThis.settingsLayoutTarget = target;
              if (target) { target.scrollIntoView({block:'nearest'}); target.focus(); }
              const r = target?.getBoundingClientRect(); const bounds = scroll.getBoundingClientRect();
              return {
                overflow: document.documentElement.scrollWidth > innerWidth || root.scrollWidth > root.clientWidth || scroll.scrollWidth > scroll.clientWidth,
                visible: [...root.querySelectorAll('.settings-panel')].filter(p => getComputedStyle(p).display !== 'none').length,
                focus: !target || (document.activeElement === target && r.width > 0 && r.height > 0 && r.top >= Math.max(0, bounds.top) - 1 && r.bottom <= Math.min(innerHeight, bounds.bottom) + 1),
                scheme: getComputedStyle(root).colorScheme, width: innerWidth, height: innerHeight
              };
            })()`);
        assert.equal(
          result.overflow,
          false,
          `Settings horizontal overflow: ${language}/${light}/${width}/${category}`,
        );
        assert.equal(result.visible, 1);
        assert.equal(
          result.focus,
          true,
          `Settings unreachable control: ${language}/${width}/${category}`,
        );
        assert.equal(result.scheme, light ? "light" : "dark");
        assert.equal(result.width, width);
        assert.equal(result.height, height);
        await evaluate("document.querySelector('.settings-close').focus()");
        contents.sendInputEvent({
          type: "keyDown",
          keyCode: "Tab",
          modifiers: ["shift"],
        });
        contents.sendInputEvent({
          type: "keyUp",
          keyCode: "Tab",
          modifiers: ["shift"],
        });
        await frame();
        assert.equal(
          await evaluate<boolean>(
            "document.activeElement === globalThis.settingsLayoutTarget && document.activeElement.matches(':focus-visible')",
          ),
          true,
          "Settings native synthetic keyboard traversal/focus cue failed",
        );
        cases += 1;
        if (
          evidence &&
          ["general", "shortcuts", "config-file"].includes(category)
        )
          await writeFile(
            path.join(
              evidence,
              `${language}-${light ? "light" : "dark"}-${width}x${height}-${category}.png`,
            ),
            (await contents.capturePage()).toPNG(),
          );
      }
    }
    assert.deepEqual(
      window.getMinimumSize(),
      minimum,
      "Settings changed native minimum bounds",
    );
    // Check both sides of the actual content-container breakpoints, rather
    // than assuming viewport width equals the form/shortcut panel width.
    for (const target of [559, 560, 759, 760]) {
      window.setContentSize(1000, 640);
      await frame();
      const panelWidth =
        "(() => { const e = document.querySelector('.settings-panels'); const s = getComputedStyle(e); return e.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight); })()";
      // A first correction may cross the outer 900 px sidebar budget. The
      // second is a bounded geometry correction, not a retry of a failed oracle.
      for (let correction = 0; correction < 2; correction += 1) {
        const [viewport, width] = await evaluate<[number, number]>(
          `[innerWidth, ${panelWidth}]`,
        );
        window.setContentSize(viewport + target - width, 640);
        await frame();
      }
      assert.equal(
        await evaluate<number>(panelWidth),
        target,
        "Settings panel breakpoint was not reached",
      );
      await evaluate(
        "document.querySelector('#settings-tab-shortcuts').click()",
      );
      assert.equal(
        await evaluate<boolean>(
          "document.querySelector('.settings-panels').scrollWidth <= document.querySelector('.settings-panels').clientWidth",
        ),
        true,
      );
    }
    return { cases, breakpoints: 4, synthetic: true, physicalKeyboard: false };
  } finally {
    restore();
    window.setContentSize(original.width, original.height);
    await frame();
    await evaluate("document.querySelector('#settings-tab-general').click()");
  }
}
