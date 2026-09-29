import assert from "node:assert/strict";
import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { existsSync, mkdirSync, writeSync } from "node:fs";
import { spawn } from "node-pty";
import path from "node:path";
import { terminalWindowOptions } from "../../src/main/terminal-window";
import { registerTerminalWindowHost } from "../../src/main/terminal-window-host";
import { startTerminalApplication } from "../../src/main/terminal-application";
import { terminalSessionFailureDialog } from "../../src/main/terminal-session-failure";
import { registerTerminalIpcRouter } from "../../src/main/terminal-ipc-controller";
import { terminalRendererConfiguration } from "../../src/main/active-user-configuration";
import { DEFAULT_USER_CONFIGURATION } from "../../src/main/user-configuration";
import type { LocalTerminalSession } from "../../src/main/local-terminal-session";
import type { OperationalEvent } from "../../src/main/operational-events";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import { spawnFixturePty } from "./native-fixture-pty";
import { nativeFixturePlatform } from "./restty-host-platform";
import { createResttyHostSessions } from "./restty-host-sessions";

const root = __dirname;
const missingDefaultShell = process.argv.includes("--missing-default-shell");
for (const name of ["userData", "sessionData"] as const) {
  const directory = path.join(root, name);
  mkdirSync(directory, { recursive: true });
  app.setPath(name, directory);
}
const windows: BrowserWindow[] = [];
let attempts = 0;
let windowsStartRejected = false;
const owner = createResttyHostSessions({
  app,
  spawn: (...args) => {
    if (process.platform !== "win32" || attempts !== 2)
      return spawnFixturePty(...args);
    // Pinned ConPTY startProcess rejects a missing file before allocating its
    // pseudoconsole or any child. There is no PID to register on this path.
    assert.equal(existsSync(args[0]), false);
    try {
      return spawn(...args);
    } catch (error) {
      windowsStartRejected = true;
      throw error;
    }
  },
  windows: () => windows,
  signals: process,
  reportError: (message) => process.stderr.write(`${message}\n`),
});
const acknowledgement = new AbortController();
function fail(error: unknown) {
  acknowledgement.abort();
  process.stderr.write(
    `${error instanceof Error ? error.stack : String(error)}\n`,
  );
  void owner.complete(1);
}
process.on("uncaughtException", fail);
process.on("unhandledRejection", fail);

async function run() {
  await app.whenReady();
  const events: OperationalEvent[] = [];
  const router = registerTerminalIpcRouter(ipcMain, {
    write: (event) => {
      events.push(event);
      return true;
    },
  });
  let window!: BrowserWindow;
  let session!: LocalTerminalSession;
  let output = "";
  let exited = false;
  let nativeFailure = false;
  let failures = 0;
  let acknowledged = false;
  let empty = false;
  let quits = 0;
  let closeRequests = 0;
  let closed = 0;
  let sheetBegan = false;
  let sheetEnded = false;
  const application = startTerminalApplication({
    confirmClose: false,
    createWindow(lifecycle) {
      window = new BrowserWindow({
        ...terminalWindowOptions(
          path.join(root, "preload.cjs"),
          DEFAULT_USER_CONFIGURATION,
          process.platform,
        ),
        show: false,
      });
      windows.push(window);
      window.on("close", () => {
        closeRequests += 1;
      });
      window.on("closed", () => {
        closed += 1;
      });
      window.on("sheet-begin", () => {
        sheetBegan = true;
      });
      window.on("sheet-end", () => {
        sheetEnded = true;
      });
      const controller = router.registerController({
        webContents: window.webContents,
        windowId: 1,
        configuration: terminalRendererConfiguration(
          { configuration: DEFAULT_USER_CONFIGURATION, userFileErrors: [] },
          0,
        ),
        createSession(callbacks) {
          attempts += 1;
          const attempt = attempts;
          const script =
            process.platform === "win32"
              ? "[Console]::WriteLine('READY'); [Console]::ReadLine() | Out-Null; exit 1"
              : "printf 'READY\\n'; IFS= read -r line; exit 1";
          const created = owner.createSession({
            shell:
              attempt === 2 && missingDefaultShell
                ? path.join(root, "missing-default-shell")
                : nativeFixturePlatform.defaultShell,
            ...(attempt === 2 && missingDefaultShell
              ? {}
              : {
                  launchRequest: {
                    kind: "explicit-command" as const,
                    executable:
                      attempts === 1
                        ? nativeFixturePlatform.defaultShell
                        : path.join(root, "missing-fixture-program"),
                    arguments:
                      attempts === 1
                        ? process.platform === "win32"
                          ? ["-NoLogo", "-NoProfile", "-Command", script]
                          : ["-c", script]
                        : [],
                  },
                }),
            platform: process.platform,
            homeDirectory: root,
            environment: { ...process.env, HOME: root },
            applicationVersionProvider: app,
            onOutput(data) {
              output += data;
              callbacks.onOutput(data);
            },
            onExit(exit, kind) {
              if (attempt === 1) {
                assert.deepEqual(exit, { exitCode: 1, signal: 0 });
                exited = true;
              } else {
                assert.equal(
                  exit.startupFailed,
                  true,
                  "native exec failure must not be an ordinary code-1 exit",
                );
                nativeFailure = true;
              }
              callbacks.onExit(exit, kind);
            },
          });
          if (attempt === 1) session = created;
          return created;
        },
        onTabsEmpty(reason) {
          empty = true;
          lifecycle.onTabsEmpty(reason);
        },
        onSessionStartError: lifecycle.onSessionStartError,
        onSessionExit: lifecycle.onSessionExit,
        onSessionStarted() {},
        onSessionSelected() {},
        onTitleRequest() {},
        onBell() {},
        onUserInteraction() {},
        writeClipboardText() {},
        readClipboardText: () => "",
        confirmPaste: async () => true,
        showClipboardContextMenu() {},
        openExternalLink: async () => {},
        onExternalLinkOpenError() {},
        loadSnippets: async () => ({ snippets: [] }),
        loadLocalImage: async () => null,
      });
      registerTerminalWindowHost(window, controller, lifecycle.onWindowClosed);
      return {
        window,
        sessionActivity: controller,
        load: () => window.loadFile(path.join(root, "renderer", "index.html")),
      };
    },
    getSelectedWindow: () => window,
    showCloseTabConfirmation: async () => true,
    showCloseWindowConfirmation: async () => true,
    showQuitConfirmation: async () => true,
    async showSessionFailure(target, failure) {
      assert.equal(failure.reason, "spawn");
      assert.equal(
        failure.launchKind,
        missingDefaultShell ? "default-shell" : "explicit-command",
      );
      failures += 1;
      const options = terminalSessionFailureDialog(failure);
      await dialog.showMessageBox(target, {
        ...options,
        buttons: [...options.buttons],
        noLink: true,
        signal: acknowledgement.signal,
      });
      acknowledged = true;
    },
    sendTabCommand: (target, command) =>
      target.webContents.send(terminalIpc.tabCommand, command),
    sendFontZoom() {},
    sendClipboardAction() {},
    sendSnippetsToggle() {},
    sendTabBarToggle() {},
    sendTitleBarToggle() {},
    sendLocalImageOpen() {},
    toggleDeveloperTools() {},
    quit: () => {
      quits += 1;
    },
  });
  await application.newWindow();
  window.show();
  window.focus();
  await owner.waitFor(() => output.includes("READY"), "A native readiness");
  application.newTabInSelectedWindow();
  await owner.waitFor(() => failures === 1, "B native spawn failure dialog");
  if (process.platform === "darwin")
    await owner.waitFor(() => sheetBegan, "native failure sheet begin");
  if (process.platform === "win32")
    await owner.waitFor(
      () => !window.isEnabled(),
      "native dialog disables owner",
    );
  await owner.waitFor(
    async () =>
      (await window.webContents.executeJavaScript(
        `document.querySelectorAll('.terminal-surface').length === ${process.platform === "win32" ? 1 : 2}`,
      )) as boolean,
    "failed B ownership established",
  );
  assert.equal(acknowledged, false);
  session.write("\r");
  await owner.waitFor(() => exited, "ordinary A code-1 exit");
  assert.equal(
    closeRequests,
    0,
    "A exit must not close unacknowledged B failure owner",
  );
  assert.equal(window.isDestroyed(), false);
  assert.equal(acknowledged, false);
  assert.equal(quits, 0);
  if (process.platform === "darwin") assert.equal(sheetEnded, false);
  // Exercise Electron's native dialog cancellation, not a deferred substitute.
  // The one-button failure acknowledgement has the same completion lifecycle.
  acknowledgement.abort();
  await owner.waitFor(
    () => acknowledged && window.isDestroyed(),
    "native acknowledgement and owner cleanup",
  );
  // The existing host's renderer-destroyed listener can reenter native close;
  // disposal and application completion must still each happen exactly once.
  assert.equal(closed, 1, "one completed native owner disposal");
  assert.equal(quits, 1);
  if (process.platform !== "win32") assert.equal(nativeFailure, true);
  else assert.equal(windowsStartRejected, true);
  assert.equal(attempts, 2);
  assert.equal(failures, 1);
  assert.equal(empty, true);
  const exits = events.filter((event) => event.name === "pty.exit");
  assert.equal(exits.length, 2);
  assert.equal(exits[0]?.outcome, "spawn-failure");
  assert.equal(exits[0]?.code, null);
  assert.equal(exits[1]?.outcome, "clean");
  assert.equal(exits[1]?.code, 1);
  for (const event of exits)
    assert.deepEqual(Object.keys(event).sort(), [
      "code",
      "durationMs",
      "name",
      "outcome",
      "windowId",
    ]);
  if (process.platform === "darwin") assert.equal(sheetEnded, true);
  router.dispose();
  writeSync(
    1,
    "__OMXTERM_FAILURE_ACK_RESULT__" +
      JSON.stringify({
        nativeSpawnFailure: true,
        nativeDialog: true,
        nativeSheet:
          process.platform === "darwin" ? sheetBegan && sheetEnded : null,
        survivedOrdinaryExit: true,
        acknowledged: true,
        cleanupExactlyOnce: true,
      }) +
      "\n",
  );
  await owner.complete(0);
}
void run().catch(fail);
