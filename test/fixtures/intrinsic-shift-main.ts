import assert from "node:assert/strict";
import { app, BrowserWindow, Menu, type Input } from "electron";
import { deliverKeybindsFromKeyEvents } from "../../src/main/keybind-delivery";
import { validateUserConfiguration } from "../../src/main/user-configuration";
import {
  terminalDefaultKeybinds,
  type TerminalKeybinds,
} from "../../src/shared/terminal-keybinds";

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(predicate: () => boolean, label: string) {
  const deadline = Date.now() + 5_000;
  while (!predicate()) {
    if (Date.now() >= deadline) throw new Error(`Timed out: ${label}`);
    await delay(10);
  }
}

void app.whenReady().then(async () => {
  const window = new BrowserWindow({
    width: 500,
    height: 300,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: process.platform !== "linux",
    },
  });
  const menuActions: string[] = [];
  const fallbackActions: string[] = [];
  const observed: Pick<Input, "key" | "code" | "shift" | "control">[] = [];
  window.webContents.on("before-input-event", (_event, input) => {
    if (input.type === "keyDown")
      observed.push({
        key: input.key,
        code: input.code,
        shift: input.shift,
        control: input.control,
      });
  });
  await window.loadURL(
    "data:text/html,<script>window.keys=[];addEventListener('keydown',e=>window.keys.push(e.key))</script><input autofocus>",
  );
  window.show();
  window.focus();
  await waitFor(() => window.isFocused(), "native window focus");
  // Injected Electron events exercise native dispatch, not OS layout conversion
  // or physical keyboards. AppKit does not deliver these synthetic menu keys;
  // macOS still verifies the production fallback and renderer consumption.
  const send = async (
    keyCode: string,
    modifiers: ("control" | "shift")[] = [],
  ) => {
    window.webContents.sendInputEvent({ type: "keyDown", keyCode, modifiers });
    window.webContents.sendInputEvent({ type: "keyUp", keyCode, modifiers });
    await delay(100);
  };
  const install = (accelerator: string) => {
    Menu.setApplicationMenu(
      Menu.buildFromTemplate([
        {
          label: "Fixture",
          submenu: [
            {
              label: "Action",
              accelerator,
              click: () => menuActions.push(accelerator),
            },
          ],
        },
      ]),
    );
  };
  try {
    // Real native menu registration and dispatch, with no application interceptor.
    const native: Record<string, number> = {};
    for (const accelerator of [
      "Control+!",
      "Control+Shift+1",
      "Control+Plus",
      "Control+Shift+Plus",
      "Control+Shift+=",
    ]) {
      install(accelerator);
      menuActions.length = 0;
      await send(
        accelerator.includes("1") || accelerator.includes("!") ? "!" : "+",
        ["control", "shift"],
      );
      native[accelerator] = menuActions.length;
      if (process.platform !== "darwin")
        assert.equal(menuActions.length, 1, `native menu ${accelerator}`);
    }
    const defaults = terminalDefaultKeybinds(process.platform);
    for (const [newTab, closeTab] of [
      ["Control+!", "Control+Shift+1"],
      ["Control+Plus", "Control+Shift+Plus"],
    ]) {
      assert.throws(
        () =>
          validateUserConfiguration(
            { version: 1, keybinds: { newTab, closeTab } },
            "fixture-config.json",
            new Set(),
            defaults,
            process.platform,
          ),
        /conflicts with/,
      );
    }
    let bindings: TerminalKeybinds = defaults;
    deliverKeybindsFromKeyEvents(
      window.webContents,
      () => bindings,
      (action) => fallbackActions.push(action),
      process.platform,
    );
    for (const binding of ["Control+!", "Control+Shift+1"]) {
      bindings = validateUserConfiguration(
        { version: 1, keybinds: { newTab: binding } },
        "fixture-config.json",
        new Set(),
        defaults,
        process.platform,
      ).keybinds;
      install(binding);
      menuActions.length = 0;
      fallbackActions.length = 0;
      await window.webContents.executeJavaScript("window.keys=[]");
      await send("!", ["control", "shift"]);
      assert.deepEqual(fallbackActions, ["newTab"]);
      assert.deepEqual(menuActions, []);
      assert.deepEqual(
        await window.webContents.executeJavaScript("window.keys"),
        [],
      );
      assert.deepEqual(observed.at(-1), {
        key: "!",
        code: "Digit1",
        shift: true,
        control: true,
      });
      await send("!", ["shift"]);
      await send("1", ["control"]);
      assert.deepEqual(fallbackActions, ["newTab"]);
      assert.deepEqual(
        await window.webContents.executeJavaScript("window.keys"),
        ["!", "1"],
      );
    }
    bindings = { ...defaults, zoomIn: "Control+Plus", zoomOut: "Control+-" };
    fallbackActions.length = 0;
    install(bindings.zoomIn);
    await send("+", ["control", "shift"]);
    await send("numadd", ["control"]);
    assert.deepEqual(fallbackActions, ["zoomIn", "zoomIn"]);
    const keypad = observed.at(-1);
    assert.equal(keypad?.key, "+");
    assert.equal(keypad?.shift, false);
    assert.equal(keypad?.code, "NumpadAdd");
    await send("numadd", ["control", "shift"]);
    await send("=", ["control"]);
    assert.deepEqual(fallbackActions, ["zoomIn", "zoomIn", "zoomIn"]);
    bindings = {
      ...bindings,
      newTab: "Control+num1",
      closeTab: "Control+numadd",
    };
    fallbackActions.length = 0;
    await send("num1", ["control"]);
    await send("numadd", ["control"]);
    await send("numsub", ["control"]);
    assert.deepEqual(fallbackActions, ["newTab", "closeTab", "zoomOut"]);
    for (const shift of [false, true]) {
      bindings = validateUserConfiguration(
        {
          version: 1,
          keybinds: { newTab: shift ? "Control+Shift+*" : "Control+*" },
        },
        "fixture-config.json",
        new Set(),
        defaults,
        process.platform,
      ).keybinds;
      fallbackActions.length = 0;
      await send("nummult", shift ? ["control", "shift"] : ["control"]);
      assert.deepEqual(observed.at(-1), {
        key: "*",
        code: "NumpadMultiply",
        control: true,
        shift,
      });
      await send("*", ["control", "shift"]);
      assert.deepEqual(fallbackActions, ["newTab", "newTab"]);
      bindings = {
        ...bindings,
        closeTab: shift ? "Control+Shift+nummult" : "Control+nummult",
      };
      await send("nummult", shift ? ["control", "shift"] : ["control"]);
      assert.deepEqual(fallbackActions, ["newTab", "newTab", "closeTab"]);
    }
    console.log(
      `__OMXTERM_INTRINSIC_SHIFT__${JSON.stringify({ platform: process.platform, electron: process.versions.electron, chrome: process.versions.chrome, native, keypad, observed })}`,
    );
    Menu.setApplicationMenu(null);
    window.destroy();
    app.exit(0);
  } catch (error) {
    console.error(error);
    Menu.setApplicationMenu(null);
    window.destroy();
    app.exit(1);
  }
});
