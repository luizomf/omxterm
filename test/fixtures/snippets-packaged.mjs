// Explicit qualification composition, not an unchanged distributed host.
// Only chooser/consent and synthetic input are controlled. Semantic admission,
// native child presentation, Surface delivery and the PTY remain production.
import { app, Menu, dialog, webContents } from "electron";
import assert from "node:assert/strict";
import { createRequire, syncBuiltinESMExports } from "node:module";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import path from "node:path";
import { pathToFileURL } from "node:url";

const root = import.meta.dirname;
const fixture = JSON.parse(
  await readFile(path.join(root, "fixture.json"), "utf8"),
);
const require = createRequire(path.join(fixture.source, "package.json"));
const catalogPath = path.join(root, "config/omxterm/snippets.yaml");
const insert = "  printf '%s\\n' 'SNIPPETS_INSERT_RECEIPT'  ";
const run = "printf '%s\\n' 'SNIPPETS_RUN_RECEIPT'";
const catalog = JSON.stringify({
  version: 1,
  snippets: [
    { name: "Exact insert", body: insert, execute: false },
    { name: "Exact run", body: run, execute: true },
  ],
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
  const record = { pid: session.pid, writes: [], output: "", exited: false };
  ptys.push(record);
  const write = session.write.bind(session);
  session.write = (data) => {
    record.writes.push(data);
    write(data);
  };
  session.onData((data) => {
    record.output = (record.output + data).slice(-65536);
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
dialog.showMessageBox = async (_owner, prompt) => {
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
    const click = (contents, selector) =>
      contents.executeJavaScript(
        `(() => { const e = document.querySelector(${JSON.stringify(selector)}); if (!e || e.disabled || e.closest('[inert], [hidden]')) throw Error('Unavailable control'); e.click(); })()`,
      );
    const button = (contents, text) =>
      contents.executeJavaScript(
        `(() => { const e = [...document.querySelectorAll('button')].find(e => e.textContent === ${JSON.stringify(text)} && !e.closest('[hidden]')); if (!e || e.disabled) throw Error('Unavailable button'); e.click(); })()`,
      );
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
    const checks = [];
    const nativeKeys = [];
    const observeInput = (target) => (event, input) => {
      nativeKeys.push({
        target,
        type: input.type,
        key: input.key,
        code: input.code,
        repeat: input.isAutoRepeat,
        prevented: event.defaultPrevented,
      });
    };
    core.on("before-input-event", observeInput("core"));
    try {
      window.focus();
      await until(
        () => js("!!document.querySelector('.terminal-surface canvas')"),
        "live Surface",
      );
      await until(
        () => ptys.length === 1 && ptys[0].output.length > 0,
        "live PTY",
      );
      const session = ptys[0];
      await js(
        "window.__snippetsCanvas = document.querySelector('.terminal-surface canvas')",
      );
      assert.equal(
        await js("document.querySelectorAll('.snippets-view').length"),
        0,
        "built-in omitted",
      );
      menu("Toggle Snippets");
      await until(
        () =>
          js(
            "document.querySelector('#settings-tab-extensions')?.getAttribute('aria-selected') === 'true' && document.querySelector('.settings-snippets-notice')?.hidden === false",
          ),
        "absent package opens Extensions guidance",
      );
      assert.equal(children.length, 0, "guidance never activates code");
      checks.push("absent-package-management-no-activation");
      await button(core, "Install local .omxext…");
      await until(
        () =>
          js(
            "document.querySelector('.extensions-panel').textContent.includes('generation 1') && ![...document.querySelectorAll('.extensions-panel button')].some(b => b.disabled)",
          ),
        "ordinary installation",
      );
      assert.equal(approvals, 1);
      assert.equal(children.length, 0, "installation dormant");
      await click(core, ".settings-close");
      menu("Toggle Snippets");
      await until(
        async () =>
          hosted().length === 1 &&
          (await hosted()[0].executeJavaScript(
            "document.querySelectorAll('.snippet-activate').length === 2",
          )),
        "installed catalog",
      );
      const view = hosted()[0];
      view.on("before-input-event", observeInput("child"));
      assert.equal(
        await view.executeJavaScript("document.documentElement.lang"),
        "en-US",
      );
      const native = window.contentView.children.find(
        (child) => child.webContents === view,
      );
      assert.ok(native);
      await until(
        () =>
          native.getVisible() &&
          view.isFocused() &&
          native.getBounds().width > 0,
        "presented native child",
      );
      await view.executeJavaScript(
        "new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)))",
      );
      if (fixture.evidence) {
        await writeFile(
          path.join(fixture.evidence, "installed-child.png"),
          (await view.capturePage()).toPNG(),
        );
        await writeFile(
          path.join(fixture.evidence, "installed-core.png"),
          (await core.capturePage()).toPNG(),
        );
      }
      assert.equal(children.length, 1);
      menu("Toggle Snippets");
      await until(
        () => !native.getVisible(),
        "compatibility toggle hides retained child",
      );
      menu("Toggle Snippets");
      await until(
        () => native.getVisible() && view.isFocused(),
        "compatibility toggle restores retained child",
      );
      await until(
        () =>
          view.executeJavaScript(
            "document.querySelectorAll('.snippet-activate').length === 2",
          ),
        "catalog ready after compatibility reopen",
      );
      assert.equal(hosted()[0], view);
      assert.equal(children.length, 1);
      checks.push("ordinary-archive-trust-enabled-activation");
      checks.push("compatibility-toggle-single-retained-view");
      const terminalFocus = () =>
        until(
          async () =>
            core.isFocused() &&
            (await js(
              "!!document.activeElement?.closest('.terminal-surface')",
            )),
          "native terminal focus",
        );
      const open = async () => {
        // Header close, then ordinary menu activation: deterministic toggle state.
        if (native.getVisible()) await click(core, ".auxiliary-header button");
        menu("Toggle Snippets");
        await until(
          () => native.getVisible() && view.isFocused(),
          "native child focus",
        );
        await until(
          () =>
            view.executeJavaScript(
              "document.querySelectorAll('.snippet-activate').length === 2",
            ),
          "catalog reload",
        );
      };
      const drain = () => new Promise((resolve) => setTimeout(resolve, 150));
      const assertWrites = async (offset, expected) => {
        await until(
          () => session.writes.slice(offset).join("") === expected,
          "exact PTY bytes",
        );
        await drain();
        assert.equal(
          session.writes.slice(offset).join(""),
          expected,
          "no delayed repeat/release leakage",
        );
      };
      let offset = session.writes.length;
      await click(view, "li:first-child .snippet-activate");
      await terminalFocus();
      await assertWrites(offset, insert);
      core.sendInputEvent({ type: "keyDown", keyCode: "Enter" });
      core.sendInputEvent({ type: "keyUp", keyCode: "Enter" });
      await until(
        () => /\r?\nSNIPPETS_INSERT_RECEIPT\r?\n/.test(session.output),
        "shell executed exact insert after explicit Enter",
      );
      await open();
      offset = session.writes.length;
      await view.executeJavaScript(
        "document.querySelector('li:last-child .snippet-activate').focus()",
      );
      await view.executeJavaScript(
        `window.__activationEvents = []; for (const type of ['keydown', 'keypress', 'click']) document.addEventListener(type, event => window.__activationEvents.push({ type, key: event.key, trusted: event.isTrusted }), true);`,
      );
      // XTest owns the full native key sequence across WebContents focus.
      // Per-WebContents sendInputEvent did not expose a cross-view keyUp receipt.
      execFileSync("/usr/bin/xdotool", ["keydown", "Return"]);
      try {
        await terminalFocus();
        await until(
          () =>
            nativeKeys.some(
              (input) =>
                input.target === "core" &&
                input.type === "keyDown" &&
                input.repeat,
            ),
          "native held Enter autorepeat",
        );
      } finally {
        execFileSync("/usr/bin/xdotool", ["keyup", "Return"]);
      }
      const activationEvents = await view.executeJavaScript(
        "window.__activationEvents",
      );
      assert.ok(
        activationEvents.some(
          (event) => event.type === "click" && event.trusted,
        ),
      );
      if (fixture.evidence)
        await writeFile(
          path.join(fixture.evidence, "activation-events.json"),
          JSON.stringify(activationEvents, null, 2),
        );
      // Electron can omit before-input-event/DOM keyUp after a prevented
      // autorepeat (also reproduced without OMXTerm). Observe X11 key state
      // instead; successful xdotool exit alone is not a release receipt.
      const released = execFileSync(
        "/usr/bin/python3",
        [
          "-c",
          `import ctypes
x = ctypes.CDLL('libX11.so.6')
x.XOpenDisplay.argtypes = [ctypes.c_char_p]
x.XOpenDisplay.restype = ctypes.c_void_p
x.XKeysymToKeycode.argtypes = [ctypes.c_void_p, ctypes.c_ulong]
x.XKeysymToKeycode.restype = ctypes.c_ubyte
x.XQueryKeymap.argtypes = [ctypes.c_void_p, ctypes.c_void_p]
x.XCloseDisplay.argtypes = [ctypes.c_void_p]
d = x.XOpenDisplay(None)
if not d: raise SystemExit('Cannot open X display')
code = x.XKeysymToKeycode(d, 0xff0d)
keys = (ctypes.c_ubyte * 32)()
x.XQueryKeymap(d, keys)
x.XCloseDisplay(d)
if not code or keys[code // 8] & (1 << (code % 8)): raise SystemExit('Enter still held')
print('Enter released')`,
        ],
        { encoding: "utf8" },
      ).trim();
      assert.equal(released, "Enter released");
      await assertWrites(offset, run + "\r");
      assert.ok(
        nativeKeys.some(
          (input) =>
            input.target === "core" && input.type === "keyDown" && input.repeat,
        ),
        "Chromium delivered a native repeat",
      );
      // The next fresh gesture must not remain swallowed by the old owner.
      const freshOffset = session.writes.length;
      execFileSync("/usr/bin/xdotool", ["key", "Return"]);
      await assertWrites(freshOffset, "\r");
      if (fixture.evidence)
        await writeFile(
          path.join(fixture.evidence, "native-keys.json"),
          JSON.stringify({ nativeKeys, released }, null, 2),
        );
      await until(
        () => /\r?\nSNIPPETS_RUN_RECEIPT\r?\n/.test(session.output),
        "shell executed Run",
      );
      checks.push("exact-insert-run-native-enter-repeat-release");
      await open();
      offset = session.writes.length;
      await click(view, "li:last-child .snippet-preview-open");
      await until(
        () => js("!!document.querySelector('.snippet-preview[open]')"),
        "preview",
      );
      assert.equal(native.getVisible(), false, "overlay excludes native child");
      if (fixture.evidence)
        await writeFile(
          path.join(fixture.evidence, "preview.png"),
          (await core.capturePage()).toPNG(),
        );
      assert.equal(
        await js("document.querySelector('.snippet-preview-body').textContent"),
        run,
      );
      await click(core, ".snippet-preview-insert");
      await terminalFocus();
      await assertWrites(offset, run);
      // Clear the unsubmitted draft using ordinary terminal input.
      core.sendInputEvent({
        type: "keyDown",
        keyCode: "C",
        modifiers: ["control"],
      });
      core.sendInputEvent({
        type: "keyUp",
        keyCode: "C",
        modifiers: ["control"],
      });
      await open();
      offset = session.writes.length;
      await click(view, "li:first-child .snippet-preview-open");
      await until(
        () => js("!!document.querySelector('.snippet-preview[open]')"),
        "cancel preview",
      );
      await click(core, ".snippet-preview-cancel");
      await until(
        async () =>
          view.isFocused() &&
          (await view.executeJavaScript(
            "document.activeElement === document.querySelector('li:first-child .snippet-preview-open')",
          )),
        "cancel initiating control focus",
      );
      await drain();
      assert.equal(session.writes.slice(offset).join(""), "");
      await click(view, "li:first-child .snippet-preview-open");
      await until(
        () => js("!!document.querySelector('.snippet-preview[open]')"),
        "Run override preview",
      );
      offset = session.writes.length;
      await click(core, ".snippet-preview-run");
      await terminalFocus();
      await assertWrites(offset, insert + "\r");
      await open();
      checks.push("preview-overrides-both-intents-cancel-restores-focus");
      await view.executeJavaScript(
        "const search = document.querySelector('input[type=search]'); search.value = 'Exact run'; search.dispatchEvent(new Event('input', { bubbles: true }));",
      );
      await click(core, ".auxiliary-header button");
      menu("Toggle Snippets");
      await until(
        async () =>
          native.getVisible() &&
          (await view.executeJavaScript(
            "document.querySelector('input').value === 'Exact run' && document.querySelectorAll('.snippet-activate').length === 1",
          )),
        "retained search after activation",
      );
      assert.equal(hosted()[0], view);
      checks.push("retained-search-hide-reactivate");
      // Commit via the real Settings language control, not the hosted bridge.
      menu("Settings");
      await until(
        () =>
          js(
            "[...document.querySelectorAll('.settings-dialog select')].some(s => !s.disabled && [...s.options].some(o => o.value === 'pt-BR'))",
          ),
        "ready language Settings control",
      );
      await js(
        `(() => { const select = [...document.querySelectorAll('.settings-dialog select')].find(s => [...s.options].some(o => o.value === 'pt-BR')); if (!select) throw Error('Missing language selector'); select.value = 'pt-BR'; select.dispatchEvent(new Event('change', { bubbles: true })); })()`,
      );
      await until(
        () =>
          view.executeJavaScript("document.documentElement.lang === 'pt-BR'"),
        "committed Portuguese",
      );
      assert.equal(
        await view.executeJavaScript(
          "document.querySelector('.snippet-intent').textContent",
        ),
        "Executar · adiciona Enter",
      );
      assert.equal(
        await view.executeJavaScript("document.querySelector('input').value"),
        "Exact run",
      );
      await js(
        `(() => { const select = [...document.querySelectorAll('.settings-dialog select')].find(s => [...s.options].some(o => o.value === 'en-US')); select.value = 'en-US'; select.dispatchEvent(new Event('change', { bubbles: true })); })()`,
      );
      await until(
        () =>
          view.executeJavaScript(
            "document.documentElement.lang === 'en-US' && document.querySelector('.snippet-intent').textContent === 'Run · adds Enter'",
          ),
        "English restored",
      );
      checks.push("live-en-US-pt-BR-retained-query");
      await button(core, "Extensions");
      await button(core, "Disable");
      await until(
        () => hosted().length === 0 && children[0].closed,
        "joined retirement",
      );
      assert.deepEqual(children[0].exit, { code: 0, signal: null });
      await click(core, ".settings-close");
      menu("Toggle Snippets");
      await until(
        () =>
          js(
            "document.querySelector('#settings-tab-extensions')?.getAttribute('aria-selected') === 'true' && document.querySelector('.extensions-panel')?.textContent.includes('disabled') && document.querySelector('.settings-snippets-notice')?.hidden === false",
          ),
        "disabled package guidance without re-enabling",
      );
      assert.equal(
        children.length,
        1,
        "disabled guidance never starts another backend",
      );
      checks.push("disabled-package-management-no-enable");
      await button(core, "Uninstall");
      await until(
        () =>
          js(
            "document.querySelector('.extensions-panel').textContent.includes('uninstalled')",
          ),
        "uninstalled",
      );
      assert.equal(await readFile(catalogPath, "utf8"), catalog);
      await click(core, ".settings-close");
      await terminalFocus();
      assert.equal(ptys.length, 1);
      assert.equal(session.exited, false);
      assert.equal(
        await js(
          "window.__snippetsCanvas === document.querySelector('.terminal-surface canvas')",
        ),
        true,
      );
      await core.insertText("printf '%s\\n' 'SNIPPETS_AFTER_RETIREMENT'");
      core.sendInputEvent({ type: "keyDown", keyCode: "Enter" });
      core.sendInputEvent({ type: "keyUp", keyCode: "Enter" });
      await until(
        () => /\r?\nSNIPPETS_AFTER_RETIREMENT\r?\n/.test(session.output),
        "same session usable after retirement",
      );
      checks.push("disable-uninstall-unchanged-catalog-live-surface-pty");
      app.once("will-quit", () => {
        assert.ok(
          ptys.every((p) => p.exited),
          "PTY shutdown joined",
        );
        console.log(
          "SNIPPETS_PACKAGED_RESULT:" +
            JSON.stringify({
              checks,
              archiveSha256,
              approvals,
              input:
                "synthetic Chromium/X11; controlled native consent; production Linux ARM64 composition",
            }),
        );
      });
      app.quit();
    } catch (error) {
      if (fixture.evidence) {
        await writeFile(
          path.join(fixture.evidence, "failure.png"),
          (await core.capturePage()).toPNG(),
        ).catch(() => {});
        await writeFile(
          path.join(fixture.evidence, "failure.json"),
          JSON.stringify(
            {
              error: String(error),
              checks,
              nativeKeys,
              core: await js("document.body.outerHTML"),
              children: await Promise.all(
                hosted().map(async (view) => ({
                  url: view.getURL(),
                  html: await view.executeJavaScript("document.body.outerHTML"),
                })),
              ),
            },
            null,
            2,
          ),
        ).catch(() => {});
      }
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
