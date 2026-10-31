import { app, BrowserWindow, clipboard, ipcMain, Menu } from "electron";
import { mkdirSync, writeSync } from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";
import { terminalWindowOptions } from "../../src/main/terminal-window";
import { registerWindowChrome } from "../../src/main/window-chrome";
import {
  guardTerminalWindowClose,
  registerTerminalWindowHost,
} from "../../src/main/terminal-window-host";
import {
  startTerminalApplication,
  type TerminalApplication,
} from "../../src/main/terminal-application";
import { registerTerminalIpcRouter } from "../../src/main/terminal-ipc-controller";
import { terminalContextMenuTemplate } from "../../src/main/terminal-context-menu";
import { terminalRendererConfiguration } from "../../src/main/active-user-configuration";
import { DEFAULT_USER_CONFIGURATION } from "../../src/main/user-configuration";
import {
  createLocalTerminalSession,
  type LocalTerminalSession,
} from "../../src/main/local-terminal-session";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import type { UserConfiguration } from "../../src/shared/user-configuration";
import { translatorFor } from "../../src/shared/i18n";
import { terminalDefaultKeybinds } from "../../src/shared/terminal-keybinds";
import { spawnFixturePty } from "./native-fixture-pty";
import {
  popupLaunchRequest,
  popupPtyObservation,
} from "./terminal-popup-native-pty";
import {
  exerciseTerminalPopup,
  submitPopupCalibrationKey,
  type NativePopup,
} from "./terminal-popup-native-exercise";
import {
  observePopupInput,
  requireProvisionedPopupInput,
  POPUP_INPUT_PROVISIONING_ENV,
  POPUP_INPUT_RECEIPT_PREFIX,
} from "./terminal-popup-input-admission";

const root = __dirname;
for (const name of ["userData", "sessionData"] as const) {
  const directory = path.join(root, name);
  mkdirSync(directory, { recursive: true });
  app.setPath(name, directory);
}
const control =
  process.argv
    .find((arg) => arg.startsWith("--popup-control="))
    ?.split("=")[1] ?? "none";
assert.ok(["none", "close-retarget", "clipboard-retarget"].includes(control));
const windows: BrowserWindow[] = [];
const popups: NativePopup[] = [];
const children: Array<{
  terminal: LocalTerminalSession;
  observation: ReturnType<typeof popupPtyObservation>;
  exited: boolean;
}> = [];
const exits: Promise<void>[] = [];
const activationWindows: Array<number | null> = [];
const clipboardReads: number[] = [];
let configuration: UserConfiguration = {
  ...DEFAULT_USER_CONFIGURATION,
  keybinds: terminalDefaultKeybinds(process.platform),
};
let application: TerminalApplication<BrowserWindow>;
let confirmCount = 0;
let decision: ((confirmed: boolean) => void) | undefined;
let completing = false;
let inputAdmission: ReturnType<typeof observePopupInput> | undefined;
async function finish(code: number) {
  if (completing) return;
  completing = true;
  for (const popup of popups)
    if (!popup.window.isDestroyed()) popup.menu.closePopup(popup.window);
  for (const window of windows)
    if (!window.isDestroyed()) application.forceCloseWindow(window);
  inputAdmission?.dispose();
  for (const child of children) child.terminal.close();
  await Promise.all(exits);
  app.exit(code);
}
function fail(error: unknown) {
  process.stderr.write(
    `${error instanceof Error ? error.stack : String(error)}\n`,
  );
  void finish(1);
}
process.on("uncaughtException", fail);
process.on("unhandledRejection", fail);
app.on("window-all-closed", () => {});

app
  .whenReady()
  .then(async () => {
    requireProvisionedPopupInput(process.env[POPUP_INPUT_PROVISIONING_ENV]);
    const router = registerTerminalIpcRouter(ipcMain);
    application = startTerminalApplication<BrowserWindow>({
      createWindow(lifecycle) {
        const window = new BrowserWindow({
          ...terminalWindowOptions(
            path.join(root, "preload.cjs"),
            configuration,
            process.platform,
          ),
          x: 120,
          y: 100,
          width: 1200,
          height: 850,
        });
        windows.push(window);
        guardTerminalWindowClose(window, application);
        registerWindowChrome(window, ipcMain, {
          platform: process.platform,
          showTitleBar: true,
          cursor: () => ({ x: -100_000, y: -100_000 }),
          popupApplicationMenu: () => undefined,
        });
        const controller = router.registerController({
          windowId: lifecycle.windowId,
          webContents: window.webContents,
          configuration: terminalRendererConfiguration(
            { configuration, userFileErrors: [] },
            0,
          ),
          createSession(callbacks) {
            const observation = popupPtyObservation();
            let resolveExit!: () => void;
            const exit = new Promise<void>((resolve) => {
              resolveExit = resolve;
            });
            let child: (typeof children)[number] | undefined;
            const terminal = createLocalTerminalSession(spawnFixturePty, {
              shell: "/bin/bash",
              launchRequest: popupLaunchRequest(),
              platform: process.platform,
              homeDirectory: root,
              environment: { ...process.env, HOME: root },
              applicationVersionProvider: app,
              ...callbacks,
              onOutput(data) {
                observation.observe(data);
                callbacks.onOutput(data);
              },
              onExit(value, kind) {
                if (child) child.exited = true;
                resolveExit();
                callbacks.onExit(value, kind);
              },
            });
            child = { terminal, observation, exited: false };
            children.push(child);
            exits.push(exit);
            return terminal;
          },
          onSessionStarted() {},
          onSessionSelected() {},
          onSessionStartError: lifecycle.onSessionStartError,
          onSessionExit: lifecycle.onSessionExit,
          onTabsEmpty: lifecycle.onTabsEmpty,
          onTitleRequest() {},
          onBell() {},
          onUserInteraction() {},
          writeClipboardText: (text) => clipboard.writeText(text),
          readClipboardText() {
            clipboardReads.push(window.id);
            return clipboard.readText();
          },
          confirmPaste: async () => {
            throw new Error("Unexpected Protected Paste for fixture text");
          },
          showClipboardContextMenu(request) {
            const template = terminalContextMenuTemplate(
              window,
              application,
              request,
              configuration.keybinds.closePane,
              translatorFor(configuration.language).t,
            );
            // Deliberate old-routing controls alter only the external fixture's
            // installed callbacks. Source mode always invokes production callbacks.
            if (control === "close-retarget" && request?.closePane)
              template[5]!.click = () => {
                void application.closeSelectedPane();
              };
            if (control === "clipboard-retarget")
              template[1]!.click = () =>
                application.clipboardSelectedWindow("paste");
            for (const item of template) {
              const original = item.click;
              if (original)
                item.click = (...args) => {
                  activationWindows.push(
                    BrowserWindow.getFocusedWindow()?.id ?? null,
                  );
                  original(...args);
                };
            }
            const menu = Menu.buildFromTemplate(template);
            const popup = {
              window,
              menu,
              shown: false,
              closed: false,
              activate(index: number) {
                const callback = template[index]!.click;
                assert.ok(callback);
                callback({} as never, window, {} as never);
              },
            };
            popups.push(popup);
            menu.once("menu-will-show", () => {
              popup.shown = true;
            });
            menu.once("menu-will-close", () => {
              popup.closed = true;
            });
            menu.popup({ window, x: 100, y: 100 });
          },
          openExternalLink: async () => {},
          onExternalLinkOpenError() {},
          loadSnippets: async () => ({ snippets: [] }),
          loadLocalImage: async () => null,
        });
        registerTerminalWindowHost(
          window,
          controller,
          lifecycle.onWindowClosed,
        );
        return {
          window,
          sessionActivity: controller,
          async load() {
            await window.loadFile(path.join(root, "renderer/index.html"));
            window.show();
          },
        };
      },
      // This is production's selected-window rule, not the old fixture's windows[0].
      getSelectedWindow: () => BrowserWindow.getFocusedWindow() ?? undefined,
      showQuitConfirmation: async () => false,
      showCloseWindowConfirmation: async () => false,
      showCloseTabConfirmation: async () => {
        throw new Error("Close Tab bypassed the shared Busy slot");
      },
      showClosePaneConfirmation: async () => {
        confirmCount += 1;
        return new Promise<boolean>((resolve) => {
          decision = resolve;
        });
      },
      showSessionFailure: async () => {
        throw new Error("Unexpected popup fixture session failure");
      },
      sendTabCommand: (window, command) =>
        window.webContents.send(terminalIpc.tabCommand, command),
      sendClipboardAction: (window, action, target) =>
        window.webContents.send(
          terminalIpc.clipboardAction,
          target ? { action, target } : action,
        ),
      sendFontZoom() {},
      sendSnippetsToggle() {},
      sendFind() {},
      sendTabBarToggle() {},
      sendAuxiliaryPanelToggle() {},
      sendTitleBarToggle() {},
      sendLocalImageOpen() {},
      toggleDeveloperTools() {},
      quit() {},
    });
    await application.newWindow();
    const admission = (inputAdmission = observePopupInput(windows[0]!, () =>
      BrowserWindow.getFocusedWindow(),
    ));
    const result = await exerciseTerminalPopup({
      window: windows[0]!,
      windows,
      application,
      popups,
      children,
      activationWindows,
      clipboardReads,
      confirmations: () => confirmCount,
      resolveClose(confirmed) {
        assert.ok(decision);
        const resolve = decision;
        decision = undefined;
        resolve(confirmed);
      },
      configure(next) {
        configuration = { ...configuration, ...next };
        router.applyConfiguration(
          terminalRendererConfiguration(
            { configuration, userFileErrors: [] },
            0,
          ),
        );
      },
      configuration: () => configuration,
      capture: control === "none",
      async admitNativeInput() {
        const receipt = await admission.calibrate(submitPopupCalibrationKey);
        assert.ok(admission.isAdmitted());
        writeSync(
          1,
          `${POPUP_INPUT_RECEIPT_PREFIX}${JSON.stringify(receipt)}\n`,
        );
      },
    });
    router.dispose();
    // Do not publish success or let last-window quit bypass actual native exits.
    for (const child of children) child.terminal.close();
    await Promise.all(exits);
    writeSync(1, `__OMXTERM_POPUP_NATIVE__${JSON.stringify(result)}\n`);
    await finish(0);
  })
  .catch(fail);
