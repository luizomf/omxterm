import assert from "node:assert/strict";
import { app, BrowserWindow, dialog, Menu } from "electron";
import { mkdirSync, writeFileSync, writeSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";
import type * as NodePty from "node-pty";
import { spawnFixturePty } from "./native-fixture-pty";

// Import the separately built, unchanged production main. No fixture quit
// barrier, window-all-closed observer, replacement router, or renderer exists.
const root = path.dirname(fileURLToPath(import.meta.url));
const node = process.env.npm_node_execpath;
assert.equal(process.platform, "win32");
assert.ok(node, "Native Node executable is required");
const readyMode = process.argv.includes("--prompt-ready");
const quitMode = process.argv.includes("--quit-menu");
const home = path.join(root, "home");
for (const directory of [home, path.join(root, "temp")])
  mkdirSync(directory, { recursive: true });
for (const name of ["userData", "sessionData"] as const) {
  const directory = path.join(root, name);
  mkdirSync(directory, { recursive: true });
  app.setPath(name, directory);
}
Object.assign(process.env, {
  HOME: home,
  USERPROFILE: home,
  NODE_REPL_HISTORY: "",
  TMP: path.join(root, "temp"),
  TEMP: path.join(root, "temp"),
});
// Production uses the OS account home, not HOME. Redirect only this field to
// avoid touching the interactive user's home; retain the real account/shell.
const userInfo = os.userInfo;
os.userInfo = ((...args: Parameters<typeof userInfo>) => ({
  ...userInfo(...args),
  homedir: home,
})) as typeof userInfo;
syncBuiltinESMExports();
const configurationDirectory = path.join(root, "config", "omxterm");
mkdirSync(configurationDirectory, { recursive: true });
writeFileSync(
  path.join(configurationDirectory, "config.json"),
  JSON.stringify({
    version: 1,
    confirmClose: false,
    windowsShell: node,
  }),
);

let failing = false;
function fail(error: unknown) {
  if (failing) return;
  failing = true;
  writeSync(2, `${error instanceof Error ? error.stack : String(error)}\n`);
  // Failure only; the identity-checked external supervisor owns final cleanup.
  app.exit(1);
}
process.on("uncaughtException", fail);
process.on("unhandledRejection", fail);
dialog.showErrorBox = () => {
  throw new Error("Unexpected production error dialog");
};
dialog.showMessageBox = (() =>
  Promise.reject(
    new Error("Unexpected production confirmation or failure dialog"),
  )) as typeof dialog.showMessageBox;

let created = 0;
let exited = 0;
let closing = false;
let topologyChecked = false;
const starts: Array<Promise<void>> = [];
const notifyStart: Array<() => void> = [];
for (let index = 0; index < 3; index += 1)
  starts.push(
    new Promise<void>((resolve) => {
      notifyStart.push(resolve);
    }),
  );
const prompts: Promise<void>[] = [];
const pty = createRequire(import.meta.url)("node-pty") as typeof NodePty;
const spawn = pty.spawn;
pty.spawn = (...args) => {
  const terminal = spawnFixturePty(...args, { spawn });
  const index = created++;
  assert.ok(index < 3, "Unexpected extra native session");
  if (index > 0) {
    assert.equal(args[0], node, "Later sessions must use configured Node");
    assert.deepEqual(
      args[1],
      [],
      "Configured Node receives no wrapper/arguments",
    );
    if (readyMode) {
      prompts.push(
        new Promise<void>((resolve) => {
          let syntheticOutput = "";
          const subscription = terminal.onData((data) => {
            syntheticOutput = (syntheticOutput + data).slice(-4096);
            if (
              syntheticOutput.includes("Welcome to Node.js") &&
              syntheticOutput.includes("> ")
            ) {
              subscription.dispose();
              resolve();
            }
          });
        }),
      );
    }
  } else {
    assert.ok(Array.isArray(args[1]) && args[1].includes("-NoProfile"));
  }
  terminal.onExit(() => {
    exited += 1;
  });
  notifyStart[index]!();
  return terminal;
};

app.on("quit", () => {
  if (failing) return;
  assert.ok(
    closing && topologyChecked,
    "Production quit before the close exercise",
  );
  assert.equal(created, 3);
  assert.equal(exited, 3, "Every actual PTY exit must precede production quit");
  writeSync(
    1,
    `__OMXTERM_PRODUCTION_SHUTDOWN_RESULT__${JSON.stringify({
      created,
      exited,
      windows: 2,
      surfaces: 3,
      readiness: readyMode ? "prompt" : "started",
      action: quitMode ? "quit" : "close",
    })}\n`,
  );
});

function invokeMenu(label: string) {
  const item = Menu.getApplicationMenu()
    ?.items.flatMap((menu) => menu.submenu?.items ?? [])
    .find((entry) => entry.label === label);
  assert.ok(item, `Production menu action missing: ${label}`);
  // Electron types the installed MenuItem click as Function. Production menu
  // callbacks are payload-free and resolve the selected native window in main.
  (item.click as () => void)();
}

async function checkSurfaces(expected: number[]) {
  const windows = BrowserWindow.getAllWindows().sort((a, b) => a.id - b.id);
  assert.equal(windows.length, expected.length);
  const surfaces = await Promise.all(
    windows.map(async (window) => {
      const state: unknown = await window.webContents.executeJavaScript(`({
      canvases: document.querySelectorAll('.terminal-surface canvas').length,
      isolated: typeof require === 'undefined' && typeof process === 'undefined'
    })`);
      return state;
    }),
  );
  assert.deepEqual(
    surfaces,
    expected.map((canvases) => ({ canvases, isolated: true })),
  );
  return windows;
}

// Do not top-level-await Electron's own ready event in its entry module.
void (async () => {
  await import(pathToFileURL(path.join(root, "dist", "main", "index.js")).href);
  // Each spawn is requested by the real renderer only after Surface mounting.
  // Startup close waits for registration/canvases, not first Node output or a
  // fixed delay; native deferred readiness is deliberately allowed here.
  await starts[0];
  const [first] = await checkSurfaces([1]);
  if (!first!.isFocused())
    await new Promise<void>((resolve) => {
      first!.once("focus", () => resolve());
      first!.focus();
    });
  invokeMenu("New Tab");
  await starts[1];
  await checkSurfaces([2]);
  invokeMenu("New Window");
  await starts[2];
  const windows = await checkSurfaces([2, 1]);
  if (readyMode) {
    assert.equal(prompts.length, 2);
    await Promise.all(prompts);
  }
  assert.equal(exited, 0, "All three native sessions must still be live");
  topologyChecked = true;
  closing = true;
  if (quitMode) invokeMenu(`Quit ${app.name}`);
  else for (const window of windows.toReversed()) window.close();
})().catch(fail);
