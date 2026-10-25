import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import type { BrowserWindow } from "electron";
import type { TerminalApplication } from "../../src/main/terminal-application";
import type { LocalTerminalSession } from "../../src/main/local-terminal-session";
import type { TerminalIpcRouter } from "../../src/main/terminal-ipc-types";
import type { ActiveUserConfiguration } from "../../src/main/user-configuration-reloader";
import { createSettingsExercise } from "./settings-dialog-exercise";
import { waitFor } from "./window-chrome-exercise";

export interface LanguageOptions {
  readonly root: string;
  readonly router: TerminalIpcRouter;
  readonly application: TerminalApplication<BrowserWindow>;
  readonly first: BrowserWindow;
  readonly second: () => BrowserWindow;
  readonly sessions: readonly LocalTerminalSession[];
  readonly sizes: ReadonlyArray<ReadonlyArray<{ cols: number; rows: number }>>;
  readonly apply: (state: ActiveUserConfiguration, committed: boolean) => void;
}
const evaluate = <T>(window: BrowserWindow, script: string) =>
  window.webContents.executeJavaScript(script, true) as Promise<T>;

// Both dialogs retain dirty raw drafts while a real graphical Settings change
// traverses validated IPC, service persistence, reload and configuration fan-out.
export async function exerciseFeatureLanguage(options: LanguageOptions) {
  const { first, application } = options;
  await application.newWindow();
  const second = options.second();
  await evaluate(second, "globalThis.__windowChromeHostReady()");
  await waitFor(
    () => options.sessions.length === 3 && (options.sizes[2]?.length ?? 0) > 0,
    "peer window real Surface and PTY",
  );
  const retainedSessions = [...options.sessions];
  const identities = [first, second].map((window) => [
    window.id,
    window.webContents.id,
  ]);
  let selected = first;
  const settings = createSettingsExercise(
    options.root,
    options.router,
    () => selected,
    options.apply,
  );
  try {
    for (const [index, window] of [first, second].entries()) {
      selected = window;
      window.focus();
      settings.show();
      await waitFor(
        async () =>
          await evaluate<boolean>(
            window,
            "!!document.querySelector('#settings-tab-config-file') && !!document.querySelector('.settings-config-file textarea')",
          ),
        "raw Settings editor loaded",
      );
      const draft =
        `Synthetic unsaved draft ${index}\n` +
        "draft bytes must survive language reload\n".repeat(80);
      await evaluate(
        window,
        `(() => {
        document.querySelector('#settings-tab-config-file').click();
        const editor = document.querySelector('.settings-config-file textarea');
        editor.value = ${JSON.stringify(draft)};
        editor.dispatchEvent(new Event('input', {bubbles:true}));
        editor.focus(); editor.setSelectionRange(8, 23, 'backward'); editor.scrollTop = 90;
        globalThis.featureLanguageRetained = {
          editor, draft:editor.value, start:editor.selectionStart, end:editor.selectionEnd,
          direction:editor.selectionDirection, scroll:editor.scrollTop,
          dialog:document.querySelector('.settings-dialog'),
          canvases:[...document.querySelectorAll('.terminal-surface canvas')]
        };
        if (editor.scrollTop <= 0 || document.activeElement !== editor) throw Error('Raw editor lacks real focus/scroll');
      })()`,
      );
    }
    // Programmatic change of the genuine control deliberately does not steal
    // focus from either raw editor. This is DOM automation, not OS widget input.
    await evaluate(
      first,
      `(() => {
      const selector = [...document.querySelectorAll('.settings-dialog select')].find(select => [...select.options].some(option => option.value === 'pt-BR'));
      if (!selector) throw Error('Missing real language selector');
      selector.value = 'pt-BR'; selector.dispatchEvent(new Event('change', {bubbles:true}));
    })()`,
    );
    await waitFor(
      async () =>
        await evaluate<boolean>(
          first,
          "document.querySelector('.settings-status').textContent === 'Salvo.'",
        ),
      "real Settings language save and reload",
    );
    assert.deepEqual(
      JSON.parse(await readFile(settings.file, "utf8")) as unknown,
      { version: 1, language: "pt-BR" },
    );
    for (const [index, window] of [first, second].entries()) {
      await waitFor(
        async () =>
          await evaluate<boolean>(
            window,
            "document.documentElement.lang === 'pt-BR' && document.querySelector('#settings-title').textContent === 'Configurações'",
          ),
        "live Portuguese labels in each retained host",
      );
      const state = await evaluate(
        window,
        `(() => {
        const old = globalThis.featureLanguageRetained;
        const editor = document.querySelector('.settings-config-file textarea');
        return {
          sameDialog:old.dialog === document.querySelector('.settings-dialog'), sameEditor:old.editor === editor,
          bytes:editor.value === old.draft, selection:editor.selectionStart === old.start && editor.selectionEnd === old.end && editor.selectionDirection === old.direction,
          scroll:editor.scrollTop === old.scroll, focus:document.activeElement === editor,
          rawTab:document.querySelector('#settings-tab-config-file').getAttribute('aria-selected') === 'true',
          saveLabel:document.querySelector('.settings-config-file button').textContent === 'Salvar',
          canvases:old.canvases.length === document.querySelectorAll('.terminal-surface canvas').length && old.canvases.every((canvas,i) => canvas === document.querySelectorAll('.terminal-surface canvas')[i])
        };
      })()`,
      );
      assert.deepEqual(state, {
        sameDialog: true,
        sameEditor: true,
        bytes: true,
        selection: true,
        scroll: true,
        focus: true,
        rawTab: true,
        saveLabel: true,
        canvases: true,
      });
      assert.deepEqual([window.id, window.webContents.id], identities[index]);
      assert.equal(window.isDestroyed(), false);
    }
    assert.deepEqual(options.sessions, retainedSessions);
  } finally {
    settings.dispose();
  }
}
