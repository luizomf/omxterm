// Temporary #742 diagnostic, not full Snippets qualification.
// Ordinary management and native epoch ownership; controlled chooser/consent.
import { app, Menu, dialog, webContents } from "electron";
import assert from "node:assert/strict";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { EventEmitter } from "node:events";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = import.meta.dirname;
const fixture = JSON.parse(
  await readFile(path.join(root, "fixture.json"), "utf8"),
);
const origins = new WeakMap();
const events = ["closed", "destroyed", "render-process-gone"];
const trace = [];
let phase = "startup";
let epoch = 0;
for (const method of ["on", "addListener", "prependListener"]) {
  const original = EventEmitter.prototype[method];
  EventEmitter.prototype[method] = function (event, listener, ...args) {
    if (events.includes(event)) {
      const stack = new Error().stack;
      origins.set(listener, stack);
      trace.push({
        epoch,
        phase,
        operation: "add",
        emitter: this.constructor.name,
        event,
        count: this.listenerCount(event) + 1,
        stack,
      });
    }
    return original.call(this, event, listener, ...args);
  };
}
function snapshot(next, window) {
  phase = next;
  for (const emitter of [window, window.webContents]) {
    for (const event of events) {
      trace.push({
        epoch,
        phase,
        operation: "snapshot",
        emitter: emitter.constructor.name,
        event,
        listeners: emitter
          .rawListeners(event)
          .map((listener) => ({
            name: (listener.listener ?? listener).name,
            stack: origins.get(listener),
          })),
      });
    }
  }
}
const require = createRequire(path.join(fixture.source, "package.json"));
const catalogPath = path.join(root, "config/omxterm/snippets.yaml");
const catalog = JSON.stringify({
  version: 1,
  snippets: [{ name: "Lifecycle only", body: "true", execute: false }],
});
await mkdir(path.dirname(catalogPath), { recursive: true });
await writeFile(catalogPath, catalog);
await writeFile(
  path.join(root, "config/omxterm/config.json"),
  JSON.stringify({ version: 1, language: "en-US", confirmClose: false }),
);
process.env.XDG_CONFIG_HOME = path.join(root, "config");
process.env.XDG_DATA_HOME = path.join(root, "data");
app.setPath("userData", path.join(root, "profile"));
const ptys = [];
const pty = require("node-pty");
const spawn = pty.spawn;
pty.spawn = (...args) => {
  const session = spawn(...args);
  const record = { exited: false, output: false };
  ptys.push(record);
  session.onData(() => {
    record.output = true;
  });
  session.onExit(() => {
    record.exited = true;
  });
  return session;
};
const children = [];
const childProcess = require("node:child_process");
const fork = childProcess.fork;
childProcess.fork = (...args) => {
  const child = fork(...args);
  if (String(args[0]).endsWith("extension-runtime/bootstrap.mjs")) {
    const record = { closed: false, exit: null };
    children.push(record);
    child.once("exit", (code, signal) => {
      record.exit = { code, signal };
    });
    child.once("close", () => {
      record.closed = true;
    });
  }
  return child;
};
syncBuiltinESMExports();
const archiveSha256 = createHash("sha256")
  .update(await readFile(fixture.archive))
  .digest("hex");
let approvals = 0;
dialog.showOpenDialog = async () => ({
  canceled: false,
  filePaths: [fixture.archive],
});
dialog.showMessageBox = async (owner, prompt) => {
  snapshot("trust-dialog", owner);
  assert.equal(prompt.title, "Trust extension code?");
  assert.ok(prompt.detail.includes(archiveSha256));
  approvals++;
  return { response: 1, checkboxChecked: false };
};
const ready = new Promise((resolve) =>
  app.once("browser-window-created", (_event, window) =>
    window.once("ready-to-show", () => resolve(window)),
  ),
);
await import(pathToFileURL(fixture.entry).href);
void ready
  .then(async (window) => {
    const core = window.webContents;
    const js = (code) => core.executeJavaScript(code);
    const until = async (check, label) => {
      const deadline = Date.now() + 15000;
      while (Date.now() < deadline) {
        if (await check()) return;
        await new Promise((resolve) => setTimeout(resolve, 25));
      }
      throw Error(`Timed out: ${label}`);
    };
    const button = (text) =>
      js(
        `(() => { const e = [...document.querySelectorAll('button')].find(e => e.textContent === ${JSON.stringify(text)} && !e.closest('[hidden]')); if (!e || e.disabled) throw Error('Unavailable button'); e.click(); })()`,
      );
    const closeSettings = () =>
      js("document.querySelector('.settings-close').click()");
    const menu = (label) => {
      const find = (items) => {
        for (const item of items) {
          if (item.label.replace(/…$/, "") === label) return item;
          const nested = item.submenu && find(item.submenu.items);
          if (nested) return nested;
        }
      };
      const item = find(Menu.getApplicationMenu().items);
      assert.ok(item, label);
      item.click(item, window, {});
    };
    const hosted = () =>
      webContents
        .getAllWebContents()
        .filter(
          (v) => !v.isDestroyed() && v.getURL().startsWith("omx-extension://"),
        );
    const managementReady = () =>
      js(
        "!!document.querySelector('.extensions-panel') && ![...document.querySelectorAll('.extensions-panel button')].some(b => b.disabled)",
      );
    const checks = [];
    try {
      window.focus();
      await until(
        () => js("!!document.querySelector('.terminal-surface canvas')"),
        "live Surface",
      );
      await until(() => ptys.length === 1 && ptys[0].output, "live PTY");
      await js(
        "window.__lifecycleCanvas = document.querySelector('.terminal-surface canvas')",
      );
      snapshot("initial", window);
      for (epoch = 1; epoch <= 3; epoch++) {
        menu("Settings");
        await until(
          () => js("!!document.querySelector('#settings-tab-extensions')"),
          "Settings",
        );
        await button("Extensions");
        await until(managementReady, "management ready");
        phase = "installing";
        await button("Install local .omxext…");
        await until(
          async () =>
            (await managementReady()) &&
            (await js(
              "[...document.querySelectorAll('.extensions-panel button')].some(b => b.textContent === 'Disable')",
            )),
          "installed enabled",
        );
        assert.equal(approvals, epoch);
        assert.equal(children.length, epoch - 1, "installation dormant");
        snapshot("installed-dormant", window);
        await closeSettings();
        menu("Toggle Snippets");
        await until(
          async () =>
            hosted().length === 1 &&
            (await hosted()[0].executeJavaScript(
              "document.querySelectorAll('.snippet-activate').length === 1",
            )),
          "active catalog",
        );
        assert.equal(children.length, epoch);
        snapshot("active-view", window);
        menu("Settings");
        await until(
          () => js("!!document.querySelector('#settings-tab-extensions')"),
          "Settings for retirement",
        );
        await button("Extensions");
        await until(managementReady, "retirement management ready");
        phase = "disabling";
        await button("Disable");
        await until(
          async () =>
            hosted().length === 0 &&
            children[epoch - 1].closed &&
            (await managementReady()),
          "joined retirement",
        );
        assert.deepEqual(children[epoch - 1].exit, { code: 0, signal: null });
        snapshot("disabled", window);
        await button("Uninstall");
        await until(
          async () =>
            (await managementReady()) &&
            (await js(
              "document.querySelector('.extensions-panel').textContent.includes('uninstalled')",
            )),
          "uninstalled",
        );
        snapshot("uninstalled", window);
        await closeSettings();
        assert.equal(await readFile(catalogPath, "utf8"), catalog);
        assert.equal(ptys.length, 1);
        assert.equal(ptys[0].exited, false);
        assert.equal(
          await js(
            "window.__lifecycleCanvas === document.querySelector('.terminal-surface canvas')",
          ),
          true,
        );
        checks.push(`epoch-${epoch}-install-activate-disable-uninstall`);
      }
      await writeFile(
        path.join(fixture.evidence, "listener-trace.json"),
        JSON.stringify(trace, null, 2),
      );
      app.once("will-quit", () => {
        assert.ok(
          ptys.every((p) => p.exited),
          "PTY shutdown joined",
        );
        console.log(
          "LISTENERS_LIFECYCLE_RESULT:" +
            JSON.stringify({
              checks,
              archiveSha256,
              approvals,
              scope:
                "lifecycle-only; controlled consent; explicit qualification composition",
            }),
        );
      });
      app.quit();
    } catch (error) {
      await writeFile(
        path.join(fixture.evidence, "listener-trace.json"),
        JSON.stringify(trace, null, 2),
      );
      await writeFile(
        path.join(fixture.evidence, "failure.json"),
        JSON.stringify(
          {
            error: String(error),
            epoch,
            phase,
            checks,
            children,
            core: await js("document.body.outerHTML"),
          },
          null,
          2,
        ),
      ).catch(() => {});
      console.error(error);
      process.exitCode = 1;
      app.quit();
    }
  })
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
    app.quit();
  });
