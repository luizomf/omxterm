import assert from "node:assert/strict";
import { app, BrowserWindow, ipcMain } from "electron";
import { mkdirSync, writeSync } from "node:fs";
import path from "node:path";
import { terminalWindowOptions } from "../../src/main/terminal-window";
import { registerTerminalWindowHost } from "../../src/main/terminal-window-host";
import { registerTerminalIpcRouter } from "../../src/main/terminal-ipc-controller";
import { terminalRendererConfiguration } from "../../src/main/active-user-configuration";
import { DEFAULT_USER_CONFIGURATION } from "../../src/main/user-configuration";
import {
  createUserConfigurationReloader,
  terminalSurfaceFontBaseline,
} from "../../src/main/user-configuration-reloader";
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
const sessions: LocalTerminalSession[] = [];
const outputs: string[][] = [];
const inputs: string[][] = [];
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

function launchRequest() {
  const script =
    process.platform === "win32"
      ? "[Console]::WriteLine('READY'); while ($null -ne ($line=[Console]::ReadLine())) { [Console]::WriteLine('RECEIVED:'+$line) }"
      : "printf 'READY\\n'; while IFS= read -r line; do printf 'RECEIVED:%s\\n' \"$line\"; done";
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
  await app.whenReady();
  const router = registerTerminalIpcRouter(ipcMain);
  const initial = {
    configuration: DEFAULT_USER_CONFIGURATION,
    userFileErrors: [],
  };
  const window = new BrowserWindow({
    ...terminalWindowOptions(
      path.join(root, "preload.cjs"),
      DEFAULT_USER_CONFIGURATION,
      process.platform,
    ),
    show: false,
  });
  windows.push(window);
  const controller = router.registerController({
    webContents: window.webContents,
    configuration: terminalRendererConfiguration(initial, 0),
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
        onExit: callbacks.onExit,
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
    onSessionStartError() {
      throw new Error("Unexpected PTY start failure");
    },
    onSessionExit() {},
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
  registerTerminalWindowHost(window, controller, () => {});
  const reloader = createUserConfigurationReloader({
    initial,
    ...terminalSurfaceFontBaseline(initial.configuration),
    load: async () => ({
      configuration: { ...DEFAULT_USER_CONFIGURATION, fontLineHeight: 1.5 },
    }),
    apply: (state) =>
      router.applyConfiguration(terminalRendererConfiguration(state, 0)),
    activeTerminalSurfaceFontConfigurations:
      router.activeTerminalSurfaceFontConfigurations,
  });
  const evaluate = (script: string) =>
    window.webContents.executeJavaScript(script);
  const wait = (script: string, description: string) =>
    owner.waitFor(async () => Boolean(await evaluate(script)), description);
  await window.loadFile(path.join(root, "renderer", "index.html"));
  window.show();
  await wait(
    "globalThis.fontOwnershipRuntime?.held === true",
    "initial real runtime held",
  );
  assert.equal(sessions.length, 0, "Rendering precedes native PTY");
  await reloader.reload();
  await wait(
    "document.querySelector('#user-file-errors').textContent.includes('font.lineHeight')",
    "first restart notice",
  );
  await evaluate("globalThis.releaseFontInitialization()");
  await owner.waitFor(
    () => outputs[0]?.join("").includes("READY") ?? false,
    "A native program ready",
  );
  await reloader.reload();
  assert.deepEqual(router.activeTerminalSurfaceFontConfigurations(), [
    { fontLineHeight: 1 },
  ]);
  await wait(
    "document.querySelector('#user-file-errors').textContent.includes('font.lineHeight')",
    "repeated restart notice",
  );
  await evaluate("globalThis.queryFontCell(0)");
  const oldCell = (await evaluate("globalThis.fontOwnershipCells[0]")) as {
    height: number;
    width: number;
  };
  assert.ok(oldCell.height > 0 && oldCell.width > 0);
  window.webContents.send(terminalIpc.tabCommand, { action: "new" });
  await owner.waitFor(
    () => outputs[1]?.join("").includes("READY") ?? false,
    "B native program ready",
  );
  await evaluate("globalThis.queryFontCell(1)");
  const newCell = (await evaluate(
    "globalThis.fontOwnershipCells[1]",
  )) as typeof oldCell;
  assert.ok(
    newCell.height >= oldCell.height * 1.5 - 1,
    "New real row height uses latest multiplier",
  );
  assert.equal(
    newCell.width,
    oldCell.width,
    "Line height does not scale glyph width",
  );
  assert.deepEqual(
    await evaluate("globalThis.fontOwnershipRuntime.lineHeights"),
    [1, 1.5],
  );
  await reloader.reload();
  window.webContents.send(terminalIpc.tabCommand, {
    action: "select",
    position: 1,
  });
  await wait(
    "document.querySelector('[role=tab]')?.getAttribute('aria-selected') === 'true'",
    "A selected",
  );
  await evaluate("globalThis.queryFontCell(0)");
  assert.deepEqual(await evaluate("globalThis.fontOwnershipCells[0]"), oldCell);
  const inputOffset = inputs[0]!.length;
  window.webContents.send(terminalIpc.clipboardAction, "paste");
  await owner.waitFor(
    () => inputs[0]!.slice(inputOffset).join("") === "usable",
    "A receives exact Paste",
  );
  // Use an explicit CR after Paste so ConPTY Console.ReadLine submits input.
  sessions[0]!.write("\r");
  await owner.waitFor(
    () => outputs[0]!.join("").includes("RECEIVED:usable"),
    "old A remains usable",
  );
  assert.equal(sessions.length, 2, "No healthy PTY replacement");
  window.webContents.send(terminalIpc.tabCommand, { action: "close" });
  await owner.waitFor(
    () => router.activeTerminalSurfaceFontConfigurations().length === 1,
    "A ownership released",
  );
  await reloader.reload();
  await wait(
    "document.querySelector('#user-file-errors').textContent === ''",
    "notice clears after obsolete owner removal",
  );
  assert.deepEqual(router.activeTerminalSurfaceFontConfigurations(), [
    { fontLineHeight: 1.5 },
  ]);
  router.dispose();
  writeSync(
    1,
    "__OMXTERM_FONT_OWNERSHIP_RESULT__" +
      JSON.stringify({
        oldCell,
        newCell,
        retainedNotice: true,
        releasedOwner: true,
        usable: true,
      }) +
      "\n",
  );
  await owner.complete(0);
}
void run().catch(fail);
