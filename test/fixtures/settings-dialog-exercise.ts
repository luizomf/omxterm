import assert from "node:assert/strict";
import { exerciseSettingsLayout } from "./settings-layout-exercise";
import { captureSettingsNoticeEvidence } from "./settings-notice-exercise";
import { terminalRendererConfiguration } from "../../src/main/active-user-configuration";
import { ipcMain, type BrowserWindow } from "electron";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createSettingsService } from "../../src/main/settings-service";
import { startSettings } from "../../src/main/settings-wiring";
import { createKeybindCapture } from "../../src/main/keybind-capture";
import { deliverKeybindsFromKeyEvents } from "../../src/main/keybind-delivery";
import type { TerminalIpcRouter } from "../../src/main/terminal-ipc-types";
import type {
  TerminalActionName,
  TerminalKeybinds,
} from "../../src/shared/terminal-keybinds";
import {
  extensionsIpc,
  isExtensionsRequest,
  type ExtensionsRequest,
  type ExtensionsResult,
} from "../../src/shared/extensions";
import { DEFAULT_TERMINAL_THEME } from "../../src/shared/terminal-theme";
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
  readonly nativeGeometryPreservedOnOpen: true;
  readonly onePanelVisible: boolean;
  readonly liveStatus: string;
  readonly liveFile: unknown;
  readonly livePaddingApplied: boolean;
  readonly newWindowStatus: string;
  readonly newWindowFile: unknown;
  readonly rejectedStatus: string;
  readonly rejectedFileUnchanged: boolean;
  readonly shortcutStatus: string;
  readonly shortcutFile: unknown;
  readonly deliveredDuringCapture: readonly string[];
  readonly deliveredAfterCapture: readonly string[];
  readonly focusReturned: boolean;
  readonly layout: Awaited<ReturnType<typeof exerciseSettingsLayout>>;
}

// Real settings service, IPC, preload, window host and dialog against a
// disposable XDG profile, with the production reload and application path.
export function createSettingsExercise(
  root: string,
  router: TerminalIpcRouter,
  getWindow: () => BrowserWindow,
  apply: (state: ActiveUserConfiguration, committed: boolean) => void,
  keyDelivery?: {
    keybinds(): TerminalKeybinds;
    invokeAction(action: TerminalActionName): void;
  },
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
  // One key-delivery owner consults the same capture Settings starts. Standalone
  // Settings exercises record actions; composed exercises supply their actions
  // here rather than installing a competing listener ahead of capture.
  const capture = createKeybindCapture(process.platform);
  const window = getWindow();
  const captureTarget = window.webContents;
  const releaseCapture = () => capture.release(captureTarget);
  window.on("blur", releaseCapture);
  const delivered: string[] = [];
  deliverKeybindsFromKeyEvents(
    getWindow().webContents,
    keyDelivery?.keybinds ?? (() => reloader.current().configuration.keybinds),
    keyDelivery?.invokeAction ?? ((action) => delivered.push(action)),
    process.platform,
    capture,
  );
  // This core Settings fixture has no extension store/runtime. Supply a fixed
  // local snapshot for rendered card geometry; other operations stay unavailable.
  // No catalog network or installation is exercised.
  ipcMain.handle(
    extensionsIpc,
    (event, ...args: unknown[]): ExtensionsResult => {
      if (
        !router.isTrustedSender(event) ||
        event.senderFrame !== event.sender.mainFrame
      )
        throw new Error("Rejected fixture extension management owner");
      if (args.length !== 1 || !isExtensionsRequest(args[0]))
        throw new TypeError("Invalid fixture extension management request");
      if ((args[0] as ExtensionsRequest).operation !== "snapshot")
        return { ok: false, error: "runtime-unavailable" };
      return {
        ok: true,
        entries: [
          {
            id: "synthetic-layout",
            generation: 1,
            name: "Synthetic extension for layout checks",
            version: "0.0.0",
            installed: true,
            enabled: false,
            local: "dormant",
          },
        ],
        catalog: {
          loaded: true,
          stale: false,
          entries: [
            {
              selection: "synthetic-only",
              id: "synthetic-layout",
              name: "Synthetic catalog entry",
              description:
                "Local fixture text for measuring readable Extensions prose without any remote fetch or installation.",
              version: "0.0.0",
              installedVersion: "0.0.0",
              compatible: true,
              targets: ["linux-arm64"],
              incompatibility: null,
              action: "reinstall",
            },
          ],
        },
      };
    },
  );
  const settings = startSettings({
    ipcMain,
    isTrustedSender: router.isTrustedSender,
    service: createSettingsService({
      loadOptions,
      reload: () => reloader.reload(),
    }),
    selectedContents: () => getWindow().webContents,
    capture,
  });
  const file = path.join(root, "settings-xdg", "omxterm", "config.json");
  return {
    show: settings.show,
    file,
    exercise: async () => {
      const themes = path.join(root, "settings-xdg", "omxterm", "themes");
      await mkdir(themes, { recursive: true });
      for (let index = 1; index <= 5; index++)
        await writeFile(
          path.join(themes, `synthetic-${index}.json`),
          JSON.stringify({
            version: 1,
            name: `Synthetic layout ${index}`,
            colors: DEFAULT_TERMINAL_THEME.colors,
          }),
        );
      return exerciseSettingsDialog(
        getWindow(),
        settings.show,
        () => readFile(file, "utf8"),
        delivered,
        async () => {
          const evidence = process.env.OMXTERM_NOTICE_EVIDENCE_DIR;
          if (evidence)
            await captureSettingsNoticeEvidence(
              getWindow(),
              evidence,
              (language, colors) => {
                const current = reloader.current();
                const configuration = {
                  ...current.configuration,
                  language,
                  terminalTheme: {
                    ...current.configuration.terminalTheme,
                    colors: {
                      ...current.configuration.terminalTheme.colors,
                      ...colors,
                    },
                  },
                };
                router.applyConfiguration(
                  terminalRendererConfiguration(
                    { ...current, configuration },
                    process.platform === "darwin" ? 30 : 0,
                  ),
                );
              },
            );
          return exerciseSettingsLayout(
            getWindow(),
            (language, light) => {
              const current = reloader.current();
              const configuration = {
                ...current.configuration,
                language,
                terminalTheme: {
                  ...current.configuration.terminalTheme,
                  colors: {
                    ...current.configuration.terminalTheme.colors,
                    background: light ? "#f5f5f5" : "#101218",
                    foreground: light ? "#161616" : "#f4f4f4",
                  },
                  appearance: { activePaneHighlight: null },
                },
              };
              router.applyConfiguration(
                terminalRendererConfiguration(
                  { ...current, configuration },
                  process.platform === "darwin" ? 30 : 0,
                ),
              );
            },
            () =>
              router.applyConfiguration(
                terminalRendererConfiguration(
                  reloader.current(),
                  process.platform === "darwin" ? 30 : 0,
                ),
              ),
          );
        },
      );
    },
    dispose() {
      settings.dispose();
      ipcMain.removeHandler(extensionsIpc);
      window.removeListener("blur", releaseCapture);
      releaseCapture();
    },
  };
}

export async function exerciseSettingsDialog(
  window: BrowserWindow,
  show: () => void,
  readConfig: () => Promise<string>,
  delivered: readonly string[],
  layoutExercise: () => Promise<SettingsEvidence["layout"]>,
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
      `[...document.querySelectorAll('.settings-tabs [role="tab"]')].find((tab) => tab.textContent === ${JSON.stringify(label)}).click()`,
    );
  const field = (label: string) =>
    `[...document.querySelectorAll('.settings-dialog label')].find((row) => row.textContent.startsWith(${JSON.stringify(label)})).querySelector('input')`;

  // An X11 window manager places a new window when it maps it, after Electron
  // already reports bounds. A window takes focus only once mapped, so wait for
  // focus before recording the bounds that opening Settings must keep.
  window.focus();
  const focusDeadline = Date.now() + 5_000;
  while (!window.isFocused()) {
    if (Date.now() > focusDeadline)
      throw new Error("Settings fixture window never took focus");
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  const openingBounds = { ...window.getBounds() };
  const openingMinimum = [...window.getMinimumSize()];
  show();
  await waitFor(
    "document.querySelectorAll('.settings-tabs [role=\"tab\"]').length === 7",
  );
  const opened = await evaluate<boolean>(
    "document.querySelectorAll('.settings-dialog').length === 1 && document.activeElement?.getAttribute('role') === 'tab'",
  );

  // Opening is separate from later deliberate saves/reloads of geometry.
  assert.deepEqual(
    window.getBounds(),
    openingBounds,
    "Opening Settings changed native bounds",
  );
  assert.deepEqual(
    window.getMinimumSize(),
    openingMinimum,
    "Opening Settings changed native minimum",
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

  await tab("Window");
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

  await tab("Shortcuts");
  await evaluate(
    "document.querySelector('.settings-shortcut[data-action=\"find\"] .settings-shortcut-record').click()",
  );
  await waitFor(
    "document.querySelector('.settings-status').textContent.startsWith('Press the new shortcut')",
  );
  const pressF2 = () => {
    contents.sendInputEvent({ type: "keyDown", keyCode: "F2" });
    contents.sendInputEvent({ type: "keyUp", keyCode: "F2" });
  };
  pressF2();
  await waitFor(
    "!document.querySelector('.settings-status').textContent.startsWith('Press the new shortcut')",
  );
  const shortcutStatus = await settle();
  const shortcutFile: unknown = JSON.parse(await readConfig());
  const deliveredDuringCapture = [...delivered];
  // Capture ended: the recorded key now runs its action exactly once.
  pressF2();
  const deadline = Date.now() + 5_000;
  while (
    delivered.length === deliveredDuringCapture.length &&
    Date.now() < deadline
  )
    await new Promise((resolve) => setTimeout(resolve, 25));
  await new Promise((resolve) => setTimeout(resolve, 100));
  const deliveredAfterCapture = [...delivered];

  const layout = await layoutExercise();
  contents.sendInputEvent({ type: "keyDown", keyCode: "Escape" });
  contents.sendInputEvent({ type: "keyUp", keyCode: "Escape" });
  assert.equal(
    await evaluate<boolean>("!!document.querySelector('.settings-dialog')"),
    true,
    "Escape closed ordinary Settings",
  );
  await evaluate("document.querySelector('.settings-close').click()");
  await waitFor(
    "!document.querySelector('.settings-dialog') && document.querySelector('.terminal-surface:not([hidden])').contains(document.activeElement)",
  );
  assert.ok(opened, "Settings did not open with focus inside it");
  return {
    opened,
    nativeGeometryPreservedOnOpen: true,
    onePanelVisible,
    liveStatus,
    liveFile,
    livePaddingApplied: true,
    newWindowStatus,
    newWindowFile,
    rejectedStatus,
    rejectedFileUnchanged,
    shortcutStatus,
    shortcutFile,
    deliveredDuringCapture,
    deliveredAfterCapture,
    focusReturned: true,
    layout,
  };
}

// Runs one settings exercise and always unregisters its Settings IPC handlers.
// The outer fixture supervisor owns profile cleanup.
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
