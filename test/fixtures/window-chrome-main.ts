import { app, BrowserWindow, ipcMain, Menu, screen } from "electron";
import { mkdirSync, writeSync } from "node:fs";
import assert from "node:assert/strict";
import path from "node:path";
import { terminalWindowOptions } from "../../src/main/terminal-window";
import { createWindowBackgroundEffectsOwner } from "../../src/main/window-background-effects";
import { registerWindowChrome } from "../../src/main/window-chrome";
import { applicationMenuForWindow } from "../../src/main/native-application-menu";
import {
  guardTerminalWindowClose,
  registerTerminalWindowHost,
} from "../../src/main/terminal-window-host";
import {
  startTerminalApplication,
  type TerminalApplication,
} from "../../src/main/terminal-application";
import { createTerminalWindowTitleController } from "../../src/main/terminal-window-title";
import { registerTerminalIpcRouter } from "../../src/main/terminal-ipc-controller";
import {
  terminalRendererConfiguration,
  applyActiveUserConfiguration,
} from "../../src/main/active-user-configuration";
import { DEFAULT_USER_CONFIGURATION } from "../../src/main/user-configuration";
import { createLocalTerminalSession } from "../../src/main/local-terminal-session";
import { spawnFixturePty } from "./native-fixture-pty";
import {
  explicitFixtureLaunchRequest,
  nativeFixturePlatform,
} from "./restty-host-platform";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import { exerciseWindowChrome } from "./window-chrome-exercise";
import { assertNativeChromeConstruction } from "./window-chrome-construction";
import { chromeNativeExpectation } from "./window-policy";
import { exerciseWindowsHandleDrag } from "./window-chrome-native-drag";
import {
  exerciseApplicationMenu,
  type MenuOpening,
} from "./application-menu-exercise";

const root = __dirname;
for (const name of ["userData", "sessionData"] as const) {
  const directory = path.join(root, name);
  mkdirSync(directory, { recursive: true });
  app.setPath(name, directory);
}
const sessions: Array<ReturnType<typeof createLocalTerminalSession>> = [];
const sessionExits: Promise<void>[] = [];
const sizes: Array<Array<{ cols: number; rows: number }>> = [];
const cells: Array<{ width: number; height: number } | undefined> = [];
const cellQueries: Array<() => void> = [];
const windows: BrowserWindow[] = [];
const backgroundTransparencies = new WeakMap<BrowserWindow, () => number>();
const backgroundEffects = createWindowBackgroundEffectsOwner(
  process.platform,
  "x11",
);
const menuOpenings: MenuOpening[] = [];
let ended = 0;
let confirmations = 0;
let configuration = DEFAULT_USER_CONFIGURATION;
let cursor = { x: -100_000, y: -100_000 };
let nativeCursor = false;
let application: TerminalApplication<BrowserWindow>;
let failing = false;
function fail(error: unknown) {
  if (failing) return;
  failing = true;
  process.stderr.write(
    `${error instanceof Error ? error.stack : String(error)}\n`,
  );
  // Close only requests termination. Reuse the same actual PTY acknowledgments
  // as successful completion; the external supervisor owns a stuck native exit.
  for (const session of sessions) {
    try {
      session.close();
    } catch {
      /* Keep the original failure and exit. */
    }
  }
  void Promise.all(sessionExits)
    .then(() => app.exit(1))
    .catch(() => {
      process.stderr.write("Chrome fixture completion failed\n");
    });
}
process.on("uncaughtException", fail);
process.on("unhandledRejection", fail);
for (const [signal, code] of [
  ["SIGINT", 130],
  ["SIGTERM", 143],
] as const)
  process.once(signal, () => {
    process.send?.({ type: "fixture-interrupted", signal });
    for (const session of sessions) session.close();
    app.exit(code);
  });

// The fixture owns successful completion until all PTYs have exited.
// Electron's default last-window quit must not bypass the awaited PTY exits.
app.on("window-all-closed", () => {});

app
  .whenReady()
  .then(async () => {
    if (process.argv.includes("--fixture-fail-fast")) {
      setImmediate(() => {
        throw new Error("Controlled fixture failure");
      });
      return;
    }
    const nativeExpectation = chromeNativeExpectation(process.argv);
    process.stdout.write(
      `__OMXTERM_CHROME_NATIVE_EXPECTATION__${nativeExpectation}\n`,
    );
    const router = registerTerminalIpcRouter(ipcMain);
    application = startTerminalApplication<BrowserWindow>({
      createWindow(lifecycle) {
        const nativeOptions = terminalWindowOptions(
          path.join(root, "preload.cjs"),
          configuration,
          process.platform,
        );
        assertNativeChromeConstruction(nativeOptions, process.platform);
        const window = new BrowserWindow({
          ...nativeOptions,
          webPreferences: {
            ...terminalWindowOptions(
              path.join(root, "preload.cjs"),
              configuration,
              process.platform,
            ).webPreferences,
            backgroundThrottling: false,
          },
        });
        windows.push(window);
        const backgroundTransparency = backgroundEffects.register(
          window,
          configuration,
        );
        backgroundTransparencies.set(window, backgroundTransparency);
        guardTerminalWindowClose(window, application);
        const chrome = registerWindowChrome(window, ipcMain, {
          platform: process.platform,
          showTitleBar: configuration.showTitleBar,
          cursor: () => (nativeCursor ? screen.getCursorScreenPoint() : cursor),
          popupApplicationMenu(position, callback) {
            const close = applicationMenuForWindow(window)(position, callback);
            if (close)
              menuOpenings.push({
                menu: Menu.getApplicationMenu()!,
                ...position,
              });
            return close;
          },
        });
        const title = createTerminalWindowTitleController(window, {
          fallbackSessionTitle: "fixture",
          requestAttention: () => () => {},
          sendSessionTitle: (sessionId, title) =>
            window.webContents.send(terminalIpc.tabTitle, { sessionId, title }),
          onWindowTitle: chrome.setTitle,
        });
        window.once("closed", () => title.dispose());
        const controller = router.registerController({
          windowId: lifecycle.windowId,
          webContents: window.webContents,
          backgroundTransparency,
          configuration: terminalRendererConfiguration(
            { configuration, userFileErrors: [] },
            process.platform === "darwin" ? 30 : 0,
          ),
          createSession(callbacks) {
            if (failing) throw new Error("Chrome fixture is completing");
            const index = sessions.length;
            sizes[index] = [];
            let queryingCell = false;
            cellQueries[index] = () => {
              queryingCell = true;
              callbacks.onOutput("\u001b[16t");
            };
            let resolveExit: () => void = () => {};
            sessionExits.push(
              new Promise<void>((resolve) => {
                resolveExit = resolve;
              }),
            );
            let terminal: ReturnType<typeof createLocalTerminalSession>;
            try {
              terminal = createLocalTerminalSession(spawnFixturePty, {
                shell: nativeFixturePlatform.defaultShell,
                launchRequest: explicitFixtureLaunchRequest(),
                platform: process.platform,
                homeDirectory: root,
                environment: { ...process.env, HOME: root },
                applicationVersionProvider: app,
                ...callbacks,
                onExit(exit, launchKind) {
                  resolveExit();
                  callbacks.onExit(exit, launchKind);
                },
              });
            } catch (error) {
              // No session was returned; do not leave an unowned pending slot.
              resolveExit();
              throw error;
            }
            sessions.push(terminal);
            return {
              ...terminal,
              write(data) {
                const cell =
                  queryingCell && /^\u001b\[6;(\d+);(\d+)t$/u.exec(data);
                if (cell) {
                  cells[index] = {
                    width: Number(cell[2]),
                    height: Number(cell[1]),
                  };
                  queryingCell = false;
                } else terminal.write(data);
              },
              resize(size) {
                sizes[index]!.push(size);
                terminal.resize(size);
              },
            };
          },
          onSessionStarted: title.sessionStarted,
          onSessionSelected: title.selectSession,
          onSessionStartError: lifecycle.onSessionStartError,
          onSessionExit(exit, context) {
            ended += 1;
            lifecycle.onSessionExit(exit, context);
          },
          onTitleRequest: title.requestTitle,
          onBell: title.ringBell,
          onUserInteraction: title.resetAttention,
          writeClipboardText() {},
          readClipboardText: () => "",
          confirmPaste: async () => false,
          showClipboardContextMenu() {},
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
          load: async () => {
            await window.loadFile(path.join(root, "renderer", "index.html"));
            window.showInactive();
          },
        };
      },
      getSelectedWindow: () => windows[0],
      showQuitConfirmation: async () => false,
      showCloseWindowConfirmation: async () => {
        confirmations += 1;
        return false;
      },
      showCloseTabConfirmation: async () => false,
      showSessionFailure: async () => {
        throw new Error("Unexpected fixture session failure");
      },
      sendTitleBarToggle: (window) =>
        window.webContents.send(terminalIpc.titleBarToggle),
      sendTabBarToggle: (window) =>
        window.webContents.send(terminalIpc.tabBarToggle),
      sendTabCommand: (window, command) =>
        window.webContents.send(terminalIpc.tabCommand, command),
      sendFontZoom: (window, command) =>
        window.webContents.send(terminalIpc.fontZoom, command),
      sendClipboardAction: (window, action) =>
        window.webContents.send(terminalIpc.clipboardAction, action),
      sendSnippetsToggle() {},
      sendLocalImageOpen() {},
      toggleDeveloperTools() {},
      quit() {},
    });
    await application.newWindow();
    const result = await exerciseWindowChrome({
      nativeExpectation,
      window: windows[0]!,
      cells,
      queryCell: (index) => cellQueries[index]!(),
      application,
      sessions,
      sizes,
      ended: () => ended,
      confirmations: () => confirmations,
      cursor: (point) => {
        cursor = point;
      },
      async nativeDrag() {
        try {
          return await exerciseWindowsHandleDrag(windows[0]!, () => {
            nativeCursor = true;
          });
        } finally {
          nativeCursor = false;
        }
      },
      reload() {
        configuration = {
          ...configuration,
          showTitleBar: false,
          showTabBar: false,
          blur: true,
          transparency: 0.5,
          terminalTheme: {
            ...configuration.terminalTheme,
            colors: {
              ...configuration.terminalTheme.colors,
              background: "#123456",
            },
          },
        };
        applyActiveUserConfiguration(
          { configuration, userFileErrors: [] },
          true,
          router,
          windows,
          application,
          {
            rebuildMenu() {},
            nativeTitleInset: process.platform === "darwin" ? 30 : 0,
            platform: process.platform,
            applyBackgroundEffects: backgroundEffects.apply,
          },
        );
      },
      second: () => windows[1]!,
      backgroundOpacity: (window) =>
        1 - backgroundTransparencies.get(window)!(),
      exerciseMenu: () =>
        exerciseApplicationMenu(windows[0]!, application, menuOpenings),
    });
    for (const window of windows) application.forceCloseWindow(window);
    router.dispose();
    // Closing requests native termination; wait for every PTY to actually exit.
    await Promise.all(sessionExits);
    if (failing) return;
    writeSync(1, `__OMXTERM_WINDOW_CHROME_RESULT__${JSON.stringify(result)}\n`);
    app.quit();
  })
  .catch(fail);
