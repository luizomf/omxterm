import assert from "node:assert/strict";
import { app, BrowserWindow, ipcMain } from "electron";
import { mkdirSync, writeSync } from "node:fs";
import path from "node:path";
import { terminalWindowOptions } from "../../src/main/terminal-window";
import { registerTerminalWindowHost } from "../../src/main/terminal-window-host";
import { startTerminalApplication } from "../../src/main/terminal-application";
import { registerTerminalIpcRouter } from "../../src/main/terminal-ipc-controller";
import { terminalRendererConfiguration } from "../../src/main/active-user-configuration";
import { DEFAULT_USER_CONFIGURATION } from "../../src/main/user-configuration";
import type { LocalTerminalSession } from "../../src/main/local-terminal-session";
import { terminalIpc } from "../../src/shared/terminal-ipc";
import { spawnFixturePty } from "./native-fixture-pty";
import { nativeFixturePlatform } from "./restty-host-platform";
import { createResttyHostSessions } from "./restty-host-sessions";
import { recordInitializationStage } from "./initialization-cancellation-diagnostics";

const root = __dirname;
const boundary = process.argv.includes("--fixture-boundary=fonts")
  ? "fonts"
  : "runtime";
const stage = (
  name: Parameters<typeof recordInitializationStage>[1],
  status: "begin" | "complete",
) => recordInitializationStage(boundary, name, status);
stage("entry", "begin");
for (const name of ["userData", "sessionData"] as const) {
  const directory = path.join(root, name);
  mkdirSync(directory, { recursive: true });
  app.setPath(name, directory);
}
const windows: BrowserWindow[] = [];
const sessions: LocalTerminalSession[] = [];
const outputs: string[][] = [];
const inputs: string[][] = [];
const exited: number[] = [];
let quits = 0;
let closeRequests = 0;
const owner = createResttyHostSessions({
  app,
  spawn: spawnFixturePty,
  windows: () => windows,
  signals: process,
  reportError: (message) => process.stderr.write(`${message}\n`),
});
let failed = false;
function fail(error: unknown) {
  failed = true;
  process.stderr.write(
    `${error instanceof Error ? error.stack : String(error)}\n`,
  );
  void owner.complete(1);
}
process.on("uncaughtException", fail);
process.on("unhandledRejection", fail);

function launchRequest() {
  const script =
    process.platform === "win32"
      ? "[Console]::WriteLine('READY'); while ($null -ne ($line=[Console]::ReadLine())) { if ($line -eq 'quit') { exit 0 }; [Console]::WriteLine('RECEIVED:'+$line) }"
      : "printf 'READY\\n'; while IFS= read -r line; do [ \"$line\" = quit ] && exit 0; printf 'RECEIVED:%s\\n' \"$line\"; done";
  return {
    kind: "explicit-command" as const,
    executable: nativeFixturePlatform.defaultShell,
    arguments:
      process.platform === "win32"
        ? ["-NoLogo", "-NoProfile", "-Command", script]
        : ["-c", script],
  };
}

async function run() {
  stage("app-ready", "begin");
  await app.whenReady();
  stage("app-ready", "complete");
  const router = registerTerminalIpcRouter(ipcMain);
  let window!: BrowserWindow;
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
      const controller = router.registerController({
        webContents: window.webContents,
        configuration: terminalRendererConfiguration(
          { configuration: DEFAULT_USER_CONFIGURATION, userFileErrors: [] },
          0,
        ),
        createSession(callbacks) {
          const index = sessions.length;
          outputs[index] = [];
          inputs[index] = [];
          const terminal = owner.createSession({
            shell: nativeFixturePlatform.defaultShell,
            launchRequest: launchRequest(),
            platform: process.platform,
            homeDirectory: root,
            environment: { ...process.env, HOME: root },
            applicationVersionProvider: app,
            onOutput(data) {
              outputs[index]!.push(data);
              callbacks.onOutput(data);
            },
            onExit(exit, kind) {
              if (!failed)
                assert.deepEqual(exit, {
                  exitCode: 0,
                  signal: 0,
                });
              exited.push(index);
              callbacks.onExit(exit, kind);
            },
          });
          sessions.push(terminal);
          return {
            ...terminal,
            write(data) {
              inputs[index]!.push(data);
              terminal.write(data);
            },
          };
        },
        onTabsEmpty: lifecycle.onTabsEmpty,
        onSessionStartError: lifecycle.onSessionStartError,
        onSessionExit: lifecycle.onSessionExit,
        onSessionStarted() {},
        onSessionSelected() {},
        onTitleRequest() {},
        onBell() {},
        onUserInteraction() {},
        writeClipboardText() {},
        readClipboardText: () => "usable",
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
        load: () =>
          window.loadFile(path.join(root, "renderer", "index.html"), {
            query: { boundary },
          }),
      };
    },
    getSelectedWindow: () => window,
    showCloseTabConfirmation: async () => true,
    showCloseWindowConfirmation: async () => true,
    showQuitConfirmation: async () => true,
    showSessionFailure: async () => {
      throw new Error("Unexpected session failure");
    },
    sendTabCommand: (target, command) =>
      target.webContents.send(terminalIpc.tabCommand, command),
    sendFontZoom() {},
    sendClipboardAction() {},
    sendSnippetsToggle() {},
    sendTabBarToggle() {},
    sendFind() {},
    sendTitleBarToggle() {},
    sendLocalImageOpen() {},
    toggleDeveloperTools() {},
    quit: () => {
      quits += 1;
    },
  });
  stage("window-load", "begin");
  await application.newWindow();
  stage("window-load", "complete");
  window.show();
  window.focus();
  stage("a-ready", "begin");
  await owner.waitFor(
    () => outputs[0]?.join("").includes("READY") ?? false,
    "A native program ready",
  );
  stage("a-ready", "complete");
  application.newTabInSelectedWindow();
  stage("b-held", "begin");
  await owner.waitFor(
    async () =>
      (await window.webContents.executeJavaScript(
        "globalThis.cancellationEvidence.held === true",
      )) as boolean,
    "B held at real initialization boundary",
  );
  stage("b-held", "complete");
  assert.equal(sessions.length, 1, "No early B PTY");
  stage("surface-count", "begin");
  assert.equal(
    await window.webContents.executeJavaScript(
      "document.querySelectorAll('.terminal-surface').length",
    ),
    2,
  );
  stage("surface-count", "complete");
  stage("b-close", "begin");
  await application.closeSelectedTab();
  stage("b-close", "complete");
  assert.equal(closeRequests, 0, "Closing B preserves A's window");
  assert.equal(quits, 0);
  stage("b-removed", "begin");
  await owner.waitFor(
    async () =>
      (await window.webContents.executeJavaScript(
        "document.querySelectorAll('.terminal-surface').length === 1",
      )) as boolean,
    "B removed, healthy A retained",
  );
  stage("b-removed", "complete");
  stage("b-release", "begin");
  await window.webContents.executeJavaScript(
    "globalThis.releaseCancelledInitialization()",
  );
  stage("b-release", "complete");
  stage("b-settled", "begin");
  await owner.waitFor(
    async () =>
      (await window.webContents.executeJavaScript(
        "globalThis.cancellationEvidence.settled === true",
      )) as boolean,
    "B cancellation settled",
  );
  stage("b-settled", "complete");
  stage("evidence", "begin");
  const evidence: unknown = await window.webContents.executeJavaScript(
    "globalThis.cancellationEvidence",
  );
  stage("evidence", "complete");
  assert.equal(
    (evidence as { fatals: number }).fatals,
    0,
    "Cancellation must not report a fatal Surface failure",
  );
  assert.deepEqual(evidence, {
    held: true,
    settled: true,
    destroyed: boundary === "fonts" ? 0 : 1,
    subscriptions: 0,
    leases: 0,
    fatals: 0,
  });
  stage("failure-banner", "begin");
  assert.equal(
    await window.webContents.executeJavaScript(
      "document.querySelector('#terminal-surface-failure')?.hidden",
    ),
    true,
    "No stale persistent failure banner",
  );
  stage("failure-banner", "complete");
  assert.equal(sessions.length, 1, "No B PTY after cancellation");
  const inputOffset = inputs[0]!.length;
  window.webContents.send(terminalIpc.clipboardAction, "paste");
  stage("paste-input", "begin");
  await owner.waitFor(
    () => inputs[0]!.slice(inputOffset).join("").includes("usable"),
    "A receives exact Paste input",
  );
  stage("paste-input", "complete");
  assert.equal(inputs[0]!.slice(inputOffset).join(""), "usable");
  // Paste is not Enter. In particular, Console.ReadLine on ConPTY does not
  // submit on a pasted LF. Submit the received text with a separate CR.
  sessions[0]!.write("\r");
  stage("paste-response", "begin");
  await owner.waitFor(
    () => outputs[0]!.join("").includes("RECEIVED:usable"),
    "A receives Paste through its real Surface and Adapter",
  );
  stage("paste-response", "complete");
  assert.equal(window.isDestroyed(), false);
  sessions[0]!.write("quit\r");
  stage("last-close", "begin");
  await owner.waitFor(() => window.isDestroyed(), "last A exit closes window");
  stage("last-close", "complete");
  assert.deepEqual(exited, [0]);
  assert.equal(quits, 1);
  router.dispose();
  writeSync(
    1,
    "__OMXTERM_CANCELLATION_RESULT__" +
      JSON.stringify({
        heldBeforePty: true,
        cancelledWithoutFailure: true,
        exactlyOnePty: true,
        usable: true,
        lastTabClosed: true,
      }) +
      "\n",
  );
  stage("complete", "begin");
  await owner.complete(0);
}
void run().catch(fail);
