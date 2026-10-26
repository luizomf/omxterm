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
  await evaluate(
    "document.querySelector('#settings-tab-config-file').click(); document.querySelector('.settings-config-file textarea').focus()",
  );
  options.window.webContents.sendInputEvent({ type: "keyDown", keyCode: "X" });
  options.window.webContents.sendInputEvent({ type: "keyUp", keyCode: "X" });
  await options.waitFor(
    () =>
      evaluate<boolean>(
        "document.querySelector('.settings-config-file textarea').value.endsWith('x')",
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
      "globalThis.retainedSettingsEditor === document.querySelector('.settings-config-file textarea') && globalThis.retainedSettingsEditor.value.endsWith('x')",
    ),
    true,
  );
  await options.close();
}
