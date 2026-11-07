import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import type { BrowserWindow } from "electron";
import type { SupportedLanguage } from "../../src/shared/i18n";
import type { TerminalThemeColors } from "../../src/shared/terminal-theme";

// Optional synthetic captures in the real retained Settings renderer. The
// existing settings exercise produces the source success notice through a save;
// its clones exercise the other visual states without I/O or native dialogs.
export async function captureSettingsNoticeEvidence(
  window: BrowserWindow,
  directory: string,
  configure: (
    language: SupportedLanguage,
    colors: Partial<TerminalThemeColors>,
  ) => void,
) {
  await mkdir(directory, { recursive: true });
  const contents = window.webContents;
  const evaluate = <T>(script: string) =>
    contents.executeJavaScript(script, true) as Promise<T>;
  const frame = () =>
    evaluate(
      "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
    );
  const original = window.getBounds();
  try {
    await evaluate(`(() => {
      document.querySelector('#settings-tab-general').click();
      document.querySelector('#settings-tab-general').focus();
      globalThis.noticeEvidenceFocus = document.activeElement;
      const source = document.querySelector('.settings-status');
      if (source.dataset.severity !== 'success') throw Error('Expected a real saved status');
      const panel = document.querySelector('#settings-panel-general');
      const group = document.createElement('div');
      group.id = 'synthetic-notice-evidence';
      group.style.cssText = 'display:grid;gap:8px';
      for (const severity of ['success', 'error', 'warning']) {
        const notice = source.cloneNode(false);
        notice.className = 'page-notice';
        notice.dataset.severity = severity;
        notice.hidden = false;
        group.append(notice);
      }
      panel.prepend(group);
      globalThis.noticeEvidenceSource = source;
      globalThis.noticeEvidenceGroup = group;
      globalThis.noticeEvidenceNodes = [...group.children];
    })()`);
    for (const language of ["en-US", "pt-BR"] as const) {
      for (const palette of ["dark", "light", "weak"] as const) {
        const light = palette === "light";
        const background = light ? "#f5f5f5" : "#101218";
        const foreground = light ? "#161616" : "#f4f4f4";
        const colors = {
          background,
          foreground,
          green: palette === "weak" ? background : "#36c878",
          red: palette === "weak" ? background : "#ef5566",
          yellow: palette === "weak" ? background : "#e6b535",
        };
        window.setContentSize(
          language === "en-US" ? 960 : 600,
          language === "en-US" ? 640 : 480,
        );
        configure(language, colors);
        await evaluate(`(() => {
          const text = ${JSON.stringify(language === "en-US" ? ["Saved.", "Not saved: synthetic error.", "Saved with a synthetic warning."] : ["Salvo.", "Não salvo: erro sintético.", "Salvo com aviso sintético."])};
          [...globalThis.noticeEvidenceGroup.children].forEach((node, i) => node.textContent = text[i]);
          document.querySelector('.settings-panels').scrollTop = 0;
        })()`);
        await frame();
        const result = await evaluate<{
          same: boolean;
          focused: boolean;
          infoMarker: string;
          accents: string[];
          entries: {
            color: string;
            border: string;
            background: string;
            marker: string;
            markerColor: string;
          }[];
        }>(`(() => {
          const group = globalThis.noticeEvidenceGroup;
          const info = globalThis.noticeEvidenceSource.cloneNode(false);
          info.dataset.severity = 'info';
          info.hidden = false;
          group.append(info);
          const infoMarker = getComputedStyle(info, '::before').content;
          info.remove();
          return {
          same: document.querySelector('.settings-status') === globalThis.noticeEvidenceSource && document.querySelector('#synthetic-notice-evidence') === group && [...group.children].every((node, i) => node === globalThis.noticeEvidenceNodes[i]),
          focused: document.activeElement === globalThis.noticeEvidenceFocus,
          infoMarker,
          accents: ['--ui-success-accent', '--ui-error-accent', '--ui-warning-accent'].map(key => document.documentElement.style.getPropertyValue(key)),
          entries: [...group.children].map(node => ({
            color: getComputedStyle(node).color,
            border: getComputedStyle(node).borderInlineStartColor,
            background: getComputedStyle(node).backgroundColor,
            marker: getComputedStyle(node, '::before').content,
            markerColor: getComputedStyle(node, '::before').color,
          }))
          };
        })()`);
        assert.equal(result.same, true, "Theme update replaced a notice");
        assert.equal(
          result.infoMarker,
          "none",
          "Informational notice gained a severity marker",
        );
        assert.equal(result.focused, true, "Theme update moved focus");
        assert.deepEqual(result.accents, [
          colors.green,
          colors.red,
          colors.yellow,
        ]);
        const rgb = (hex: string) =>
          `rgb(${[1, 3, 5].map((offset) => parseInt(hex.slice(offset, offset + 2), 16)).join(", ")})`;
        assert.deepEqual(
          result.entries.map((entry) => entry.border),
          [colors.green, colors.red, colors.yellow].map(rgb),
        );
        assert.ok(
          result.entries.every((entry) => entry.color === rgb(foreground)),
          "Notice text did not retain theme foreground",
        );
        assert.deepEqual(
          result.entries.map((entry) => entry.marker),
          ['"✓"', '"×"', '"!"'],
        );
        assert.ok(
          result.entries.every((entry) => entry.color === entry.markerColor),
          "Notice marker did not retain readable foreground",
        );
        if (palette !== "weak")
          assert.equal(
            new Set(result.entries.map((entry) => entry.background)).size,
            3,
            "Theme accents did not tint notices distinctly",
          );
        await writeFile(
          path.join(directory, `${language}-${palette}.png`),
          (await contents.capturePage()).toPNG(),
        );
      }
    }
  } finally {
    await evaluate(
      "document.querySelector('#synthetic-notice-evidence')?.remove()",
    );
    window.setBounds(original);
    await frame();
  }
}
