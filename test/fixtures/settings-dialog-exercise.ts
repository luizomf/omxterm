import assert from "node:assert/strict";
import { ipcMain, type BrowserWindow } from "electron";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createSettingsService } from "../../src/main/settings-service";
import { startSettings } from "../../src/main/settings-wiring";
import type { TerminalIpcRouter } from "../../src/main/terminal-ipc-types";
import {
  createUserConfigurationReloader,
  type ActiveUserConfiguration,
} from "../../src/main/user-configuration-reloader";
import {
  DEFAULT_USER_CONFIGURATION,
  loadUserConfiguration,
  type LoadUserConfigurationOptions,
} from "../../src/main/user-configuration";

export interface SettingsEvidence {
  readonly opened: boolean;
  readonly onePanelVisible: boolean;
  readonly liveStatus: string;
  readonly liveFile: unknown;
  readonly livePaddingApplied: boolean;
  readonly newWindowStatus: string;
  readonly newWindowFile: unknown;
  readonly rejectedStatus: string;
  readonly rejectedFileUnchanged: boolean;
  readonly focusReturned: boolean;
}

// Real settings service, IPC, preload, window host and dialog against a
// disposable XDG profile, with the production reload and application path.
export function createSettingsExercise(
  root: string,
  router: TerminalIpcRouter,
  getWindow: () => BrowserWindow,
  apply: (state: ActiveUserConfiguration, committed: boolean) => void,
) {
  const loadOptions: LoadUserConfigurationOptions = {
    environment: { XDG_CONFIG_HOME: path.join(root, "settings-xdg") },
    homeDirectory: root,
    platform: process.platform,
    getInstalledFontFamilyMetrics: async () => undefined,
  };
  const reloader = createUserConfigurationReloader({
    initial: { configuration: DEFAULT_USER_CONFIGURATION, userFileErrors: [] },
    load: () => loadUserConfiguration(loadOptions),
    apply,
  });
  const settings = startSettings({
    ipcMain,
    isTrustedSender: router.isTrustedSender,
    service: createSettingsService({
      loadOptions,
      reload: () => reloader.reload(),
    }),
    selectedContents: () => getWindow().webContents,
  });
  const file = path.join(root, "settings-xdg", "omxterm", "config.json");
  return {
    exercise: () =>
      exerciseSettingsDialog(getWindow(), settings.show, () =>
        readFile(file, "utf8"),
      ),
    dispose: settings.dispose,
  };
}

async function exerciseSettingsDialog(
  window: BrowserWindow,
  show: () => void,
  readConfig: () => Promise<string>,
): Promise<SettingsEvidence> {
  const contents = window.webContents;
  const evaluate = <Value>(expression: string) =>
    contents.executeJavaScript(expression, true) as Promise<Value>;
  const waitFor = async (expression: string) => {
    const deadline = Date.now() + 5_000;
    while (Date.now() < deadline) {
      if (await evaluate<boolean>(expression)) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`Settings fixture did not reach: ${expression}`);
  };
  const status = () =>
    evaluate<string>("document.querySelector('.settings-status').textContent");
  const settle = async () => {
    await waitFor(
      "document.querySelector('.settings-status').textContent !== 'Saving…'",
    );
    return status();
  };
  const tab = (label: string) =>
    evaluate(
      `[...document.querySelectorAll('[role="tab"]')].find((tab) => tab.textContent === ${JSON.stringify(label)}).click()`,
    );
  const field = (label: string) =>
    `[...document.querySelectorAll('.settings-dialog label')].find((row) => row.textContent.startsWith(${JSON.stringify(label)})).querySelector('input')`;

  window.focus();
  show();
  await waitFor("document.querySelectorAll('[role=\"tab\"]').length === 5");
  const opened = await evaluate<boolean>(
    "document.querySelectorAll('.settings-dialog').length === 1 && document.activeElement?.getAttribute('role') === 'tab'",
  );

  await tab("Terminal");
  // Real CSS: only the selected tab panel renders.
  const onePanelVisible = await evaluate<boolean>(
    "[...document.querySelectorAll('[role=\"tabpanel\"]')].filter((panel) => getComputedStyle(panel).display !== 'none').map((panel) => panel.id).join() === 'settings-panel-terminal'",
  );
  await evaluate(
    `(() => { const input = ${field("Padding top")}; input.value = "24"; input.dispatchEvent(new Event("change")); })()`,
  );
  const liveStatus = await settle();
  const liveFile: unknown = JSON.parse(await readConfig());
  await waitFor(
    "[...document.querySelectorAll('.restty-terminal-surface')].some((surface) => surface.style.getPropertyValue('--terminal-padding-top') === '24px')",
  );

  await tab("New Windows");
  await evaluate(
    `(() => { const input = ${field("Show tab bar")}; input.checked = false; input.dispatchEvent(new Event("change")); })()`,
  );
  const newWindowStatus = await settle();
  const newWindowFile: unknown = JSON.parse(await readConfig());

  const beforeRejection = await readConfig();
  await tab("Appearance");
  await evaluate(
    `(() => { const input = ${field("Font family")}; input.value = "Missing Font For Settings"; input.dispatchEvent(new Event("change")); })()`,
  );
  const rejectedStatus = await settle();
  const rejectedFileUnchanged = (await readConfig()) === beforeRejection;

  contents.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
  contents.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
  await waitFor(
    "!document.querySelector('.settings-dialog') && document.querySelector('.terminal-surface:not([hidden])').contains(document.activeElement)",
  );
  assert.ok(opened, "Settings did not open with focus inside it");
  return {
    opened,
    onePanelVisible,
    liveStatus,
    liveFile,
    livePaddingApplied: true,
    newWindowStatus,
    newWindowFile,
    rejectedStatus,
    rejectedFileUnchanged,
    focusReturned: true,
  };
}

// Runs one settings exercise and always releases its IPC and profile.
export async function runSettingsExercise(
  ...options: Parameters<typeof createSettingsExercise>
): Promise<SettingsEvidence> {
  const settings = createSettingsExercise(...options);
  try {
    return await settings.exercise();
  } finally {
    settings.dispose();
  }
}
