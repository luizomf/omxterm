import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import path from "node:path";
import { app, BrowserWindow, ipcMain, Menu, type Input } from "electron";
import { deliverKeybindsFromKeyEvents } from "../../src/main/keybind-delivery";
import { validateUserConfiguration } from "../../src/main/user-configuration";
import { registerWindowChrome } from "../../src/main/window-chrome";
import { terminalDefaultKeybinds } from "../../src/shared/terminal-keybinds";
import { spawnFixtureProcess } from "./native-fixture-ownership";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(predicate: () => boolean, label: string) {
  const deadline = Date.now() + 5_000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(`Timed out: ${label}`);
    await delay(20);
  }
}

void app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: 500,
    height: 300,
    frame: false,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: process.platform !== "linux",
    },
  });
  const observed: Input[] = [];
  const menuActions: string[] = [];
  const fallbackActions: string[] = [];
  const helperReports: string[] = [];
  let popups = 0;
  let menu = Menu.buildFromTemplate([]);
  const recordMenuAction = (action: string) => menuActions.push(action);
  let disposeChrome: (() => void) | undefined;
  window.webContents.on("before-input-event", (_event, input) => {
    observed.push(input);
  });
  const install = (key: string) => {
    menu = Menu.buildFromTemplate([
      {
        label: "Fixture",
        submenu: ["Alt", "AltGr"].map((modifier) => ({
          label: modifier,
          accelerator: `${modifier}+${key}`,
          click: () => recordMenuAction(modifier),
        })),
      },
    ]);
    Menu.setApplicationMenu(menu);
  };
  // These helpers feed the OS, not Electron sendInputEvent. Linux uses a
  // short-lived uinput keyboard; Windows uses scan-code SendInput. The active
  // US International layout must actually produce é and a dead-key literal.
  const press = async (sequence: string) => {
    assert.ok(
      window.isFocused(),
      "owned native window focused before OS input",
    );
    const helper = path.join(__dirname, "altgr-native-input");
    const executable =
      process.platform === "linux" ? "/usr/bin/sudo" : "powershell.exe";
    const args =
      process.platform === "linux"
        ? ["-n", "/usr/bin/python3", `${helper}.py`, sequence]
        : [
            "-NoProfile",
            "-ExecutionPolicy",
            "RemoteSigned",
            "-File",
            `${helper}.ps1`,
            "-Handle",
            window.getNativeWindowHandle().readBigUInt64LE().toString(),
            "-Sequence",
            sequence,
          ];
    await new Promise<void>((resolve, reject) => {
      spawnFixtureProcess(() => {
        const child = execFile(
          executable,
          args,
          { timeout: 10_000, windowsHide: true },
          (error, stdout) => {
            helperReports.push(stdout);
            if (error) reject(error);
            else resolve();
          },
        );
        if (child.pid === undefined)
          throw new Error("Native input helper did not start");
        return Object.assign(child, { pid: child.pid });
      });
    });
    await delay(100);
  };
  const combo = (modifier: number, key: number) =>
    `${modifier}:1,${key}:1,${key}:0,${modifier}:0`;
  try {
    await window.loadURL(
      "data:text/html,<input autofocus><script>window.keys=[];addEventListener('keydown',e=>keys.push(e.key))</script>",
    );
    window.show();
    window.focus();
    await waitFor(() => window.isFocused(), "native focus");
    // Native menu identity on actual layout input, with no interceptor.
    const native: Record<string, string[]> = {};
    for (const [key, scan] of [
      ["J", 36],
      ["F6", 64],
    ] as const) {
      install(key);
      menuActions.length = 0;
      await press(combo(56, scan));
      await press(combo(100, scan));
      assert.deepEqual(menuActions, ["Alt", "AltGr"]);
      native[key] = [...menuActions];
      if (key === "F6") {
        const altGr = observed.findLast(
          (input) => input.key === "F6" && input.type === "keyDown",
        );
        assert.ok(altGr && "_modifiers" in altGr);
        assert.equal(altGr._modifiers, 32768);
        assert.equal(altGr.alt, false);
        assert.equal(altGr.control, false);
        assert.deepEqual(altGr.modifiers, []);
      }
    }
    const defaults = terminalDefaultKeybinds(process.platform);
    let bindings = validateUserConfiguration(
      { version: 1, keybinds: { newTab: "AltGr+F6", closeTab: "Alt+F6" } },
      "fixture-config.json",
      new Set(),
      defaults,
      process.platform,
    ).keybinds;
    deliverKeybindsFromKeyEvents(
      window.webContents,
      () => bindings,
      (action) => fallbackActions.push(action),
      process.platform,
    );
    disposeChrome = registerWindowChrome(window, ipcMain, {
      platform: process.platform,
      showTitleBar: true,
      cursor: () => ({ x: -1000, y: -1000 }),
      popupApplicationMenu(position, onClosed) {
        popups += 1;
        menu.popup({ window, ...position, callback: onClosed });
        return () => menu.closePopup(window);
      },
    }).dispose;
    install("F6");
    menuActions.length = 0;
    await window.webContents.executeJavaScript(
      "window.keys=[];document.querySelector('input').value=''",
    );
    await press(combo(56, 64));
    await press(combo(100, 64));
    assert.deepEqual(fallbackActions, ["closeTab", "newTab"]);
    assert.deepEqual(menuActions, []);
    const rendererKeys = (await window.webContents.executeJavaScript(
      "keys",
    )) as string[];
    assert.ok(!rendererKeys.includes("F6"));
    // Consumed keys can suppress native releases. No unrelated input or blur
    // may clear Chrome's state before this immediate Alt-alone regression.
    await press("56:1,56:0");
    assert.equal(
      popups,
      1,
      "Alt alone still opens immediately after consumed AltGr",
    );
    menu.closePopup(window);
    await waitFor(() => window.isFocused(), "focus after popup dismissal");
    bindings = { ...defaults, newTab: "AltGr+F6" };
    // Alt-only negative control on the AltGr-only map, including native menu.
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        {
          label: "Only AltGr",
          accelerator: "AltGr+F6",
          click: () => recordMenuAction("AltGr"),
        },
      ]),
    );
    await press(combo(56, 64));
    assert.deepEqual(fallbackActions, ["closeTab", "newTab"]);
    assert.deepEqual(menuActions, []);
    // Unbound AltGr text and actual dead-key completion remain ordinary input.
    await press(combo(100, 18));
    await press("40:1,40:0,57:1,57:0");
    assert.equal(
      await window.webContents.executeJavaScript(
        "document.querySelector('input').value",
      ),
      "é'",
    );
    assert.deepEqual(fallbackActions, ["closeTab", "newTab"]);
    await press("100:1,100:0");
    assert.equal(popups, 1, "AltGr alone must not open the Alt menu");
    await press("56:1,56:0");
    assert.equal(popups, 2, "plain Alt alone retains native menu");
    menu.closePopup(window);
    console.log(
      `__OMXTERM_ALTGR__${JSON.stringify({
        platform: process.platform,
        electron: process.versions.electron,
        chrome: process.versions.chrome,
        native,
        fallbackActions,
        popups,
        helperReports,
        observed,
      })}`,
    );
    disposeChrome();
    Menu.setApplicationMenu(null);
    window.destroy();
    app.exit(0);
  } catch (error) {
    console.error(
      error,
      JSON.stringify({
        observed,
        menuActions,
        fallbackActions,
        popups,
        helperReports,
      }),
    );
    disposeChrome?.();
    Menu.setApplicationMenu(null);
    window.destroy();
    app.exit(1);
  }
});
