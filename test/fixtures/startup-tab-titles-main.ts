import assert from "node:assert/strict";
import { app, BrowserWindow, ipcMain } from "electron";
import { mkdirSync, writeSync } from "node:fs";
import path from "node:path";
import { terminalWindowOptions } from "../../src/main/terminal-window";
import { registerTerminalWindowHost } from "../../src/main/terminal-window-host";
import { registerTerminalIpcRouter } from "../../src/main/terminal-ipc-controller";
import { createTerminalWindowTitleController } from "../../src/main/terminal-window-title";
import { terminalRendererConfiguration } from "../../src/main/active-user-configuration";
import { DEFAULT_USER_CONFIGURATION } from "../../src/main/user-configuration";
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
let selected = "";
let oscTitles = 0;
let starts = 0;
const owner = createResttyHostSessions({
  app,
  spawn: spawnFixturePty,
  windows: () => windows,
  signals: process,
  reportError: (message) => process.stderr.write(`${message}\n`),
});
function fail(error: unknown) {
  process.stderr.write(
    `${error instanceof Error ? error.stack : String(error)}\n`,
  );
  void owner.complete(1);
}
process.on("uncaughtException", fail);
process.on("unhandledRejection", fail);

function registerHost(window: BrowserWindow) {
  const titles = createTerminalWindowTitleController(window, {
    fallbackSessionTitle: "unused-fallback",
    requestAttention: () => () => {},
    sendSessionTitle: (sessionId, title) =>
      window.webContents.send(terminalIpc.tabTitle, { sessionId, title }),
  });
  const router = registerTerminalIpcRouter(ipcMain);
  const controller = router.registerController({
    webContents: window.webContents,
    configuration: terminalRendererConfiguration(
      { configuration: DEFAULT_USER_CONFIGURATION, userFileErrors: [] },
      0,
    ),
    createSession(callbacks) {
      starts += 1;
      return owner.createSession({
        shell: nativeFixturePlatform.defaultShell,
        launchRequest: {
          kind: "explicit-command",
          executable: nativeFixturePlatform.defaultShell,
          arguments:
            process.platform === "win32"
              ? [
                  "-NoLogo",
                  "-NoProfile",
                  "-Command",
                  "while ($null -ne [Console]::ReadLine()) {}",
                ]
              : ["-c", "while IFS= read -r line; do :; done"],
        },
        platform: process.platform,
        homeDirectory: root,
        environment: { ...process.env, HOME: root },
        applicationVersionProvider: app,
        ...callbacks,
      });
    },
    onSessionStarted: titles.sessionStarted,
    onSessionSelected(sessionId) {
      selected = sessionId;
      titles.selectSession(sessionId);
    },
    onSessionTitleSync: titles.syncSessionTitle,
    onSessionStartError() {
      throw new Error("Unexpected fixture startup failure");
    },
    onSessionExit(_exit, context) {
      titles.sessionEnded(context.sessionId);
    },
    onTitleRequest(sessionId, title) {
      oscTitles += 1;
      titles.requestTitle(sessionId, title);
    },
    onBell: titles.ringBell,
    onUserInteraction: titles.resetAttention,
    writeClipboardText() {},
    readClipboardText: () => "",
    confirmPaste: async () => true,
    showClipboardContextMenu() {},
    openExternalLink: async () => {},
    onExternalLinkOpenError() {},
    loadSnippets: async () => ({ snippets: [] }),
    loadLocalImage: async () => null,
  });
  registerTerminalWindowHost(window, controller, () => {
    router.dispose();
    titles.dispose();
  });
}

async function run() {
  await app.whenReady();
  const window = new BrowserWindow({
    ...terminalWindowOptions(
      path.join(root, "preload.cjs"),
      DEFAULT_USER_CONFIGURATION,
      process.platform,
    ),
    show: false,
  });
  windows.push(window);
  registerHost(window);
  await window.loadFile(path.join(root, "renderer", "index.html"));
  window.show();
  window.focus();
  await owner.waitFor(() => selected === "s1", "first silent program mounted");
  window.webContents.send(terminalIpc.tabCommand, { action: "new" });
  await owner.waitFor(
    () => selected === "s2",
    "additional silent program mounted",
  );
  const labels = (await window.webContents.executeJavaScript(
    "[...document.querySelectorAll('[role=tab]')].map(tab => tab.textContent)",
  )) as string[];
  const expected = path.basename(nativeFixturePlatform.defaultShell);
  assert.deepEqual(
    labels,
    [expected, expected],
    "startup fallback labels without OSC repair",
  );
  assert.equal(window.getTitle(), expected);
  assert.equal(oscTitles, 0, "silent explicit programs emitted no OSC title");
  assert.equal(starts, 2);
  writeSync(
    1,
    "__OMXTERM_STARTUP_TITLES_RESULT__" +
      JSON.stringify({
        fallbackLabels: true,
        nativeTitle: true,
        silentPrograms: 2,
        oscTitles,
      }) +
      "\n",
  );
  await owner.complete(0);
}
void run().catch(fail);
