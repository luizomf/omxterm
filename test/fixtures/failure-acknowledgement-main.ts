import assert from "node:assert/strict";
import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { mkdirSync, writeSync } from "node:fs";
import path from "node:path";
import { terminalWindowOptions } from "../../src/main/terminal-window";
import { registerTerminalWindowHost } from "../../src/main/terminal-window-host";
import { startTerminalApplication } from "../../src/main/terminal-application";
import { terminalSessionFailureDialog } from "../../src/main/terminal-session-failure";
import { registerTerminalIpcRouter } from "../../src/main/terminal-ipc-controller";
import { terminalRendererConfiguration } from "../../src/main/active-user-configuration";
import { DEFAULT_USER_CONFIGURATION } from "../../src/main/user-configuration";
import type { LocalTerminalSession } from "../../src/main/local-terminal-session";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import { spawnFixturePty } from "./native-fixture-pty";
import { nativeFixturePlatform } from "./restty-host-platform";
import { createResttyHostSessions } from "./restty-host-sessions";

const root = __dirname;
for (const name of ["userData", "sessionData"] as const) {
  const directory = path.join(root, name);
  mkdirSync(directory, { recursive: true });
  app.setPath(name, directory);
}
const windows: BrowserWindow[] = [];
let attempts = 0;
const owner = createResttyHostSessions({
  app,
  spawn: (...args) => {
    // Missing executables can be ordinary code-1 exits on Unix. Inject a
    // synchronous spawn-adapter failure without changing native exit policy.
    if (attempts > 1) throw new Error("Controlled fixture spawn failure");
    return spawnFixturePty(...args);
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
  const router = registerTerminalIpcRouter(ipcMain);
  let window!: BrowserWindow;
  let session!: LocalTerminalSession;
  let output = "";
  let exited = false;
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
        configuration: terminalRendererConfiguration(
          { configuration: DEFAULT_USER_CONFIGURATION, userFileErrors: [] },
          0,
        ),
        createSession(callbacks) {
          attempts += 1;
          const script =
            process.platform === "win32"
              ? "[Console]::WriteLine('READY'); [Console]::ReadLine() | Out-Null; exit 7"
              : "printf 'READY\\n'; IFS= read -r line; exit 7";
          const created = owner.createSession({
            shell: nativeFixturePlatform.defaultShell,
            launchRequest: {
              kind: "explicit-command",
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
            platform: process.platform,
            homeDirectory: root,
            environment: { ...process.env, HOME: root },
            applicationVersionProvider: app,
            onOutput(data) {
              output += data;
              callbacks.onOutput(data);
            },
            onExit(exit, kind) {
              assert.deepEqual(exit, { exitCode: 7, signal: 0 });
              exited = true;
              callbacks.onExit(exit, kind);
            },
          });
          session = created;
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
        "document.querySelectorAll('.terminal-surface').length === 1",
      )) as boolean,
    "failed B removed",
  );
  assert.equal(acknowledged, false);
  session.write("\r");
  await owner.waitFor(
    () => exited && empty,
    "ordinary A exit and renderer empty notification",
  );
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
  assert.equal(attempts, 2);
  assert.equal(failures, 1);
  if (process.platform === "darwin") assert.equal(sheetEnded, true);
  router.dispose();
  writeSync(
    1,
    "__OMXTERM_FAILURE_ACK_RESULT__" +
      JSON.stringify({
        controlledSpawnFailure: true,
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
