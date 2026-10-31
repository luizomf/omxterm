// One scenario for source and unchanged extracted-package launch adapters.
// Native dialogs/input are fixture-controlled; all product admission stays real.
const { Menu, webContents } = require("electron");
const assert = require("node:assert/strict");
const { readFile, writeFile } = require("node:fs/promises");
const { execFileSync } = require("node:child_process");
const path = require("node:path");
const catalog = require("./snippets-catalog.json");
const insert = catalog.snippets[0].body;
const run = catalog.snippets[1].body;

async function runScenario({
  window,
  fixture,
  ptys,
  children,
  approvalCount,
  archiveSha256,
}) {
  const catalogPath = path.join(fixture.root, "config/omxterm/snippets.yaml");
  const originalCatalog = await readFile(catalogPath, "utf8");
  assert.deepEqual(JSON.parse(originalCatalog), catalog);
  const core = window.webContents;
  const js = (code) => core.executeJavaScript(code);
  const visibleCanvas =
    "[...document.querySelectorAll('.terminal-surface canvas')].find(c => c.getBoundingClientRect().width > 0 && c.getBoundingClientRect().height > 0)";
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
  let quartz;
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
    await until(() => js(`!!(${visibleCanvas})`), "live Surface");
    await until(
      () => ptys.length === 1 && ptys[0].output.length > 0,
      "live PTY",
    );
    const session = ptys[0];
    // New Tab starts the account shell (often Bash with bracketed paste).
    // Enter a controlled POSIX shell through ordinary terminal input, never
    // through the observer or a product injection API. Its output establishes
    // plain-paste mode before the exact-byte scenario shared with source runs.
    await until(
      async () =>
        core.isFocused() &&
        (await js("!!document.activeElement?.closest('.terminal-surface')")),
      "initial terminal focus",
    );
    await core.insertText(
      `exec /bin/sh -c 'printf "\\033[?2004lSNIPPETS_SHELL_READY\\n"; exec /bin/sh -i'`,
    );
    core.sendInputEvent({ type: "keyDown", keyCode: "Enter" });
    core.sendInputEvent({ type: "keyUp", keyCode: "Enter" });
    await until(
      () => session.output.includes("\u001b[?2004lSNIPPETS_SHELL_READY\r\n"),
      "controlled shell emitted plain-paste mode",
    );
    await js(`window.__snippetsCanvas = ${visibleCanvas}`);
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
    assert.equal(approvalCount(), 1);
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
    let view = hosted()[0];
    view.on("before-input-event", observeInput("child"));
    assert.equal(
      await view.executeJavaScript("document.documentElement.lang"),
      "en-US",
    );
    let native = window.contentView.children.find(
      (child) => child.webContents === view,
    );
    assert.ok(native);
    // Native hide/core focus precede the IPC ACK and renderer Hide commit.
    const panelHidden = async () =>
      !native.getVisible() &&
      core.isFocused() &&
      (await js(
        "document.querySelector('.auxiliary-panel')?.hidden === true && !!document.activeElement?.closest('.terminal-surface')",
      ));
    await until(
      () =>
        native.getVisible() && view.isFocused() && native.getBounds().width > 0,
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
    async function closeAndReopen(action) {
      const previous = view;
      const previousNative = native;
      const previousId = view.id;
      const backend = children[0];
      await view.executeJavaScript(
        "const search = document.querySelector('input[type=search]'); search.value = 'discard-on-close'; search.dispatchEvent(new Event('input', {bubbles:true}));",
      );
      let destroyed = false;
      previous.once("destroyed", () => {
        destroyed = true;
      });
      await action();
      await until(
        async () =>
          destroyed &&
          previous.isDestroyed() &&
          !window.contentView.children.includes(previousNative) &&
          hosted().length === 0 &&
          core.isFocused() &&
          (await js(
            "document.querySelector('.auxiliary-panel').hidden && ![...document.querySelectorAll('.auxiliary-tools button')].some(b => b.textContent === 'Snippets') && !!document.activeElement?.closest('.terminal-surface')",
          )),
        "Close destroys Snippets and returns native terminal focus",
      );
      menu("Toggle Snippets");
      await until(
        async () =>
          hosted().length === 1 &&
          (await hosted()[0].executeJavaScript(
            "document.querySelectorAll('.snippet-activate').length === 2 && document.querySelector('input[type=search]').value === ''",
          )),
        "fresh Snippets catalog without discarded search",
      );
      view = hosted()[0];
      native = window.contentView.children.find(
        (child) => child.webContents === view,
      );
      assert.ok(native);
      assert.notEqual(view, previous);
      assert.notEqual(view.id, previousId);
      assert.notEqual(native, previousNative);
      view.on("before-input-event", observeInput("child"));
      await until(
        () => native.getVisible() && view.isFocused(),
        "fresh native Snippets focus",
      );
      assert.equal(children.length, 1);
      assert.equal(children[0], backend);
      assert.equal(backend.closed, false);
      assert.equal(backend.exit, null);
      assert.equal(ptys.length, 1);
      assert.equal(session.exited, false);
      assert.equal(
        await js(`window.__snippetsCanvas === (${visibleCanvas})`),
        true,
      );
      assert.equal(await readFile(catalogPath, "utf8"), originalCatalog);
    }
    await closeAndReopen(() => menu("Toggle Snippets"));
    await closeAndReopen(() => click(core, ".auxiliary-close"));
    checks.push(
      "selected-visible-toggle-and-header-close-destroy-fresh-view-same-backend-catalog-PTY",
    );
    await view.executeJavaScript(
      "window.__snippetsSearch = document.querySelector('input[type=search]'); window.__snippetsSearch.value = 'Exact run'; window.__snippetsSearch.dispatchEvent(new Event('input', {bubbles:true}));",
    );
    await click(core, ".auxiliary-hide");
    await until(panelHidden, "Hide retains native Snippets");
    menu("Toggle Auxiliary Panel");
    await until(
      () => native.getVisible() && view.isFocused(),
      "independent panel reveal",
    );
    assert.equal(hosted()[0], view);
    assert.equal(hosted().length, 1);
    assert.equal(
      await view.executeJavaScript(
        "window.__snippetsSearch === document.querySelector('input[type=search]') && window.__snippetsSearch.value === 'Exact run'",
      ),
      true,
    );
    menu("Toggle Auxiliary Panel");
    await until(panelHidden, "independent panel hide");
    menu("Toggle Snippets");
    await until(
      () => native.getVisible() && view.isFocused(),
      "hidden tool action reveals retained Snippets",
    );
    await view.executeJavaScript(
      "window.__snippetsSearch.value = ''; window.__snippetsSearch.dispatchEvent(new Event('input', {bubbles:true}));",
    );
    await until(
      () =>
        view.executeJavaScript(
          "document.querySelectorAll('.snippet-activate').length === 2",
        ),
      "unfiltered retained catalog",
    );
    checks.push("ordinary-archive-trust-enabled-activation");
    checks.push(
      "explicit-hide-independent-panel-toggle-retains-exact-view-query",
    );
    const terminalFocus = () =>
      until(
        async () =>
          core.isFocused() &&
          (await js("!!document.activeElement?.closest('.terminal-surface')")),
        "native terminal focus",
      );
    const open = async () => {
      // Hide first: selected-visible tool activation now destroys, not hides.
      if (native.getVisible()) {
        await click(core, ".auxiliary-hide");
        await until(panelHidden, "Hide acknowledged before reveal");
      }
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
      assert.equal(
        session.output.match(/\u001b\[\?2004[hl]/g)?.at(-1),
        "\u001b[?2004l",
        "controlled shell retains plain-paste mode",
      );
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
    const gestureStart = nativeKeys.length;
    // Both platforms retain synthetic OS input across native focus handoff.
    // Neither API submission nor a constant key-up query is release evidence.
    if (process.platform === "darwin") {
      const { openQuartzInput } = require("./snippets-quartz.cjs");
      quartz = await openQuartzInput({
        manifest: fixture.quartzTool,
        root: fixture.root,
        evidence: fixture.evidence,
      });
      await quartz.down();
    } else execFileSync("/usr/bin/xdotool", ["keydown", "Return"]);
    try {
      await terminalFocus();
      if (quartz) await quartz.repeat();
      await until(
        () =>
          nativeKeys
            .slice(gestureStart)
            .some(
              (input) =>
                input.target === "core" &&
                input.type === "keyDown" &&
                input.key === "Enter" &&
                input.repeat,
            ),
        "native held Enter autorepeat",
      );
    } finally {
      if (quartz) await quartz.up();
      else execFileSync("/usr/bin/xdotool", ["keyup", "Return"]);
    }
    const activationEvents = await view.executeJavaScript(
      "window.__activationEvents",
    );
    assert.ok(
      activationEvents.some((event) => event.type === "click" && event.trusted),
    );
    if (fixture.evidence)
      await writeFile(
        path.join(fixture.evidence, "activation-events.json"),
        JSON.stringify(activationEvents, null, 2),
      );
    // Electron can omit keyUp after prevented autorepeat on both platforms,
    // independently reproduced without OMXTerm. Observe OS release instead;
    // retain exact PTY isolation and the next fresh Enter as product oracles.
    let released;
    if (process.platform === "darwin") {
      released = "Quartz targeted release and session held-to-up observed";
      assert.ok(
        nativeKeys
          .slice(gestureStart)
          .some(
            (input) =>
              input.target === "child" &&
              input.type === "keyDown" &&
              input.key === "Enter" &&
              !input.repeat &&
              !input.prevented,
          ),
        "native child Enter activation",
      );
    } else {
      released = execFileSync(
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
    }
    await assertWrites(offset, run + "\r");
    if (quartz)
      assert.ok(
        nativeKeys
          .slice(gestureStart)
          .filter(
            (input) =>
              input.target === "core" &&
              input.type === "keyUp" &&
              input.key === "Enter",
          )
          .every((input) => input.prevented),
        "any delivered held release is consumed",
      );
    assert.ok(
      nativeKeys
        .slice(gestureStart)
        .some(
          (input) =>
            input.target === "core" &&
            input.type === "keyDown" &&
            input.key === "Enter" &&
            input.repeat &&
            input.prevented,
        ),
      "Chromium delivered a native repeat",
    );
    // The next fresh gesture must not remain swallowed by the old owner.
    const freshOffset = session.writes.length;
    if (quartz) {
      const freshKeyStart = nativeKeys.length;
      await quartz.down();
      await until(
        () =>
          nativeKeys
            .slice(freshKeyStart)
            .some(
              (input) =>
                input.target === "core" &&
                input.type === "keyDown" &&
                input.key === "Enter" &&
                !input.repeat &&
                !input.prevented,
            ),
        "fresh native core Enter",
      );
      await quartz.up();
    } else execFileSync("/usr/bin/xdotool", ["key", "Return"]);
    await assertWrites(freshOffset, "\r");
    await quartz?.close();
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
    assert.equal(
      await js("document.querySelector('.snippet-preview-body').textContent"),
      run,
    );
    async function capturePreview() {
      // An open dialog is DOM readiness, not a render opportunity. Match the
      // child/Files capture barrier without claiming compositor/pixel freshness.
      // The existing native supervisor/inspector deadline bounds stalled frames.
      await core.executeJavaScript(`(async () => {
        const dialog = document.querySelector('.snippet-preview[open]');
        const body = dialog?.querySelector('.snippet-preview-body');
        const check = () => {
          if (!dialog?.isConnected || !dialog.open ||
              document.querySelector('.snippet-preview[open]') !== dialog ||
              dialog.querySelector('.snippet-preview-body') !== body ||
              body?.textContent !== ${JSON.stringify(run)})
            throw Error('Snippets preview changed before capture');
        };
        check();
        await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        check();
      })()`);
      assert.equal(native.getVisible(), false, "overlay excludes native child");
      return core.capturePage();
    }
    if (fixture.evidence)
      await writeFile(
        path.join(fixture.evidence, "preview.png"),
        (await capturePreview()).toPNG(),
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
    await click(core, ".auxiliary-hide");
    await until(() => !native.getVisible(), "search Hide acknowledged");
    menu("Toggle Auxiliary Panel");
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
      () => view.executeJavaScript("document.documentElement.lang === 'pt-BR'"),
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
    assert.equal(await readFile(catalogPath, "utf8"), originalCatalog);
    await click(core, ".settings-close");
    await terminalFocus();
    assert.equal(ptys.length, 1);
    assert.equal(session.exited, false);
    assert.equal(
      await js(`window.__snippetsCanvas === (${visibleCanvas})`),
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
    return {
      checks,
      archiveSha256,
      approvals: approvalCount(),
      input:
        process.platform === "darwin"
          ? "synthetic Quartz session input; tagged OS release and held-state observation; controlled native consent; production macOS ARM64 composition"
          : `synthetic Chromium/X11; controlled native consent; production Linux ${process.arch === "arm64" ? "ARM64" : "x64"} composition`,
    };
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
    throw error;
  } finally {
    await quartz?.close();
  }
}
module.exports = { runScenario };
