import { writeFile } from "node:fs/promises";
import path from "node:path";
import type { BrowserWindow } from "electron";
import type { SupportedLanguage } from "../../src/shared/i18n";
import type { SettingsLayoutObservation } from "./settings-layout-observation";

// Keep the captured receipt bounded to representative synthetic geometry.
export function recordLayoutGeometry(options: {
  evidence: string | undefined;
  records: Record<string, unknown>[];
  result: SettingsLayoutObservation;
  category: string;
  width: number;
  height: number;
  language: SupportedLanguage;
  light: boolean;
  nativeMinimum: boolean;
}) {
  const {
    evidence,
    records,
    result,
    category,
    width,
    height,
    language,
    light,
    nativeMinimum,
  } = options;
  if (
    !evidence ||
    language !== "en-US" ||
    light ||
    !(
      nativeMinimum ||
      width === 600 ||
      (width === 960 && height === 320) ||
      width === 1920
    ) ||
    ![
      "general",
      "appearance",
      "shortcuts",
      "extensions",
      "config-file",
    ].includes(category)
  )
    return;
  const selected = result.panels.find((panel) => !panel.hidden)!;
  records.push({
    viewport: { width, height },
    category,
    panel: selected.box,
    navigation: result.navigation,
    formWidths: result.forms.map((row) => row.box.width),
    theme: result.theme,
    extensions: result.extensions,
    shortcutColumns: result.shortcuts.map((row) => row.columns),
    focus: result.focus,
  });
}

// The screenshot source contains only local fixture themes, extensions and text.
export async function captureLayoutEvidence(options: {
  evidence: string | undefined;
  contents: BrowserWindow["webContents"];
  frame: () => Promise<unknown>;
  category: string;
  width: number;
  height: number;
  language: SupportedLanguage;
  light: boolean;
}) {
  const {
    evidence,
    contents,
    frame,
    category,
    width,
    height,
    language,
    light,
  } = options;
  if (!evidence) return;
  if (
    ["general", "shortcuts", "config-file"].includes(category) ||
    (["appearance", "extensions"].includes(category) &&
      (width === 600 || width === 1920 || width < 480))
  )
    await writeFile(
      path.join(
        evidence,
        `${language}-${light ? "light" : "dark"}-${width}x${height}-${category}.png`,
      ),
      (await contents.capturePage()).toPNG(),
    );
  if (
    category === "config-file" &&
    language === "en-US" &&
    !light &&
    width === 1920
  ) {
    await contents.executeJavaScript(
      "document.querySelector('.settings-config-file [role=status]').scrollIntoView({block: 'end'})",
      true,
    );
    await frame();
    await writeFile(
      path.join(evidence, "en-US-dark-1920x1080-config-result.png"),
      (await contents.capturePage()).toPNG(),
    );
  }
  if (
    category === "config-file" &&
    language === "en-US" &&
    !light &&
    width <= 600
  ) {
    await contents.executeJavaScript(
      "document.querySelector('#settings-tab-config-file').focus()",
      true,
    );
    await frame();
    await writeFile(
      path.join(evidence, `en-US-dark-${width}x${height}-navigation.png`),
      (await contents.capturePage()).toPNG(),
    );
  }
}
