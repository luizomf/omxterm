import assert from "node:assert/strict";
import type { BrowserWindow } from "electron";

interface Sample {
  readonly bytes: number;
  readonly actions: number;
  readonly menu: number;
  readonly quit: number;
  readonly fullScreen: boolean;
}
export function assertCaptureSample(
  input: string,
  before: Sample,
  after: Sample,
  phase: string,
  expected: string,
) {
  assert.equal(
    input.slice(before.bytes),
    expected,
    `${phase}: captured gesture leaked to the actual PTY`,
  );
  assert.equal(
    after.actions,
    before.actions,
    `${phase}: application action invoked during capture`,
  );
  assert.equal(
    after.menu,
    before.menu,
    `${phase}: native menu callback invoked during capture`,
  );
  assert.equal(
    after.quit,
    before.quit,
    `${phase}: actual Quit lifecycle entered`,
  );
  assert.equal(
    after.fullScreen,
    before.fullScreen,
    `${phase}: actual fullscreen changed`,
  );
}

export async function exerciseSettingsTabCapture(options: {
  readonly window: BrowserWindow;
  readonly open: () => Promise<void>;
  readonly record: () => Promise<void>;
  readonly close: () => Promise<void>;
  readonly finish: () => Promise<void>;
  readonly waitFor: (
    check: () => boolean | Promise<boolean>,
    label: string,
  ) => Promise<void>;
}) {
  const evaluate = <T>(script: string) =>
    options.window.webContents.executeJavaScript(script, true) as Promise<T>;
  await options.open();
  const initial = await evaluate<string>(`(() => {
    document.querySelector('#settings-tab-config-file').click();
    const editor = document.querySelector('.settings-config-file textarea');
    editor.focus();
    editor.setSelectionRange(editor.value.length, editor.value.length, 'forward');
    return editor.value;
  })()`);
  const expectedDraft = initial + "x";
  const matchesDraft = `editor.value === ${JSON.stringify(expectedDraft)} && editor.selectionStart === ${expectedDraft.length} && editor.selectionEnd === ${expectedDraft.length}`;
  options.window.webContents.sendInputEvent({ type: "keyDown", keyCode: "X" });
  // Supply text explicitly for the pinned Chromium synthetic input path.
  options.window.webContents.sendInputEvent({ type: "char", keyCode: "x" });
  options.window.webContents.sendInputEvent({ type: "keyUp", keyCode: "X" });
  await options.waitFor(
    () =>
      evaluate<boolean>(
        `(() => { const editor = document.querySelector('.settings-config-file textarea'); return document.activeElement === editor && ${matchesDraft}; })()`,
      ),
    "graphical field received native input",
  );
  await evaluate(
    "globalThis.retainedSettingsEditor = document.querySelector('.settings-config-file textarea'); document.querySelector('#settings-tab-shortcuts').click()",
  );
  await options.record();
  await evaluate("document.querySelector('#tab-strip [role=tab]').click()");
  await options.waitFor(
    () =>
      evaluate<boolean>(
        "document.querySelector('.settings-tab').hidden && document.querySelector('.terminal-surface:not([hidden])').contains(document.activeElement)",
      ),
    "terminal selected without disposing Settings",
  );
  assert.equal(
    await evaluate<string>(
      "document.querySelector('.settings-status').textContent",
    ),
    "Recording cancelled.",
  );
  await options.finish();
  await options.open();
  assert.equal(
    await evaluate<boolean>(
      `(() => { const editor = document.querySelector('.settings-config-file textarea'); return globalThis.retainedSettingsEditor === editor && ${matchesDraft}; })()`,
    ),
    true,
  );
  await options.close();
}
