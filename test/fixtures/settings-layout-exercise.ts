import assert from "node:assert/strict";
import type { BrowserWindow } from "electron";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { SupportedLanguage } from "../../src/shared/i18n";
import {
  assertSettingsLayout,
  observeSettingsLayout,
  type SettingsLayoutObservation,
} from "./settings-layout-observation";
import {
  captureSettingsLayoutFailure,
  type SettingsLayoutContext,
} from "./settings-layout-failure";

// Real Chromium layout/focus over the retained production Settings view. This
// establishes synthetic native input, not physical keyboard or OS widgets.
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
  const observe = (focus = true) =>
    evaluate<SettingsLayoutObservation>(
      `(${observeSettingsLayout.toString()})(${focus})`,
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
  const flag = "--fixture-settings-evidence=";
  // The test runner passes a persistent, invocation-specific destination outside
  // the temporary profile that the supervisor removes after native settlement.
  const failureDirectory =
    evidence ??
    process.argv.find((arg) => arg.startsWith(flag))?.slice(flag.length) ??
    path.join(process.cwd(), "settings-layout-failures");
  if (evidence) await mkdir(evidence, { recursive: true });
  let context: SettingsLayoutContext = { phase: "matrix" };
  let cases = 0;
  const checkCategory = async (category: string) => {
    await evaluate(
      `document.querySelector('#settings-tab-${category}').click()`,
    );
    await frame();
    const result = await observe();
    assertSettingsLayout(result, `settings-panel-${category}`);
    assert.equal(result.focus, true, "Settings unreachable control");
    return result;
  };
  try {
    for (const { language, light, width, height } of matrix) {
      context = { phase: "matrix", language, light, width, height };
      configure(language, light);
      await frame();
      window.setContentSize(width, height);
      await frame();
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
        "window",
        "shortcuts",
        "config-file",
      ]) {
        context = { ...context, category };
        const result = await checkCategory(category);
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
    context = { phase: "minimum" };
    assert.deepEqual(
      window.getMinimumSize(),
      minimum,
      "Settings changed native minimum bounds",
    );
    for (const target of [559, 560, 759, 760]) {
      context = { phase: "breakpoint", contentTarget: target };
      window.setContentSize(1000, 640);
      await frame();
      const panelWidth =
        "(() => { const e = document.querySelector('.settings-panels'); const s = getComputedStyle(e); return e.clientWidth - parseFloat(s.paddingLeft) - parseFloat(s.paddingRight); })()";
      // One correction can cross the outer 900 px viewport budget. The second
      // is a bounded geometry correction, never a retry of an oracle failure.
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
      for (const category of ["general", "shortcuts"]) {
        context = { ...context, category };
        const result = await checkCategory(category);
        assert.equal(
          result.contentWidth,
          target,
          "Settings breakpoint observation drifted",
        );
      }
    }
    return { cases, breakpoints: 4, synthetic: true, physicalKeyboard: false };
  } catch (error) {
    // Observe without refocusing or scrolling: preserve the actual failing frame
    // before finally restores the palette, size and selected category.
    const observation = await observe(false).catch(() => null);
    await captureSettingsLayoutFailure({
      directory: failureDirectory,
      context,
      observation,
      size: () => {
        const size = window.getContentSize();
        return [size[0]!, size[1]!];
      },
      capture: (rect) => contents.capturePage(rect),
    });
    throw error;
  } finally {
    restore();
    window.setContentSize(original.width, original.height);
    await frame();
    await evaluate("document.querySelector('#settings-tab-general').click()");
  }
}
