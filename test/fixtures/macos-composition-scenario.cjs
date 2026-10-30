// Controlled consent and synthetic Chromium input; unchanged production owners.
const { Menu, webContents } = require("electron");
const assert = require("node:assert/strict");
const { writeFile } = require("node:fs/promises");
const path = require("node:path");

async function runScenario({ window, fixture, ptys, children, approvalCount }) {
  const core = window.webContents;
  const js = (code) => core.executeJavaScript(code);
  const until = async (check, label) => {
    const end = Date.now() + 15000;
    while (Date.now() < end) {
      if (await check()) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw Error(`Timed out: ${label}`);
  };
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
  const button = (label) =>
    js(`(() => {
    const b = [...document.querySelectorAll('button')].find(b => b.textContent === ${JSON.stringify(label)} && !b.closest('[hidden]'));
    if (!b || b.disabled || b.closest('[inert]')) throw Error('Unavailable button');
    b.click();
  })()`);
  const closeSettings = () =>
    js("document.querySelector('.settings-close').click()");
  const hosted = () =>
    webContents
      .getAllWebContents()
      .filter(
        (v) => !v.isDestroyed() && v.getURL().startsWith("omx-extension://"),
      );
  const management = async () => {
    menu("Settings");
    await until(
      () => js("!!document.querySelector('#settings-tab-extensions')"),
      "Settings ready",
    );
    await button("Extensions");
    await until(
      () =>
        js(
          "!!document.querySelector('.extensions-panel') && ![...document.querySelectorAll('.extensions-panel button')].some(b => b.disabled)",
        ),
      "management ready",
    );
  };
  const installed = () =>
    until(
      () =>
        js(
          "document.querySelector('.extensions-panel').textContent.includes('Composition fixture') && ![...document.querySelectorAll('.extensions-panel button')].some(b => b.disabled)",
        ),
      "installation published",
    );
  const activate = async () => {
    menu("Composition fixture");
    await until(
      async () =>
        hosted().length === 1 &&
        (await hosted()[0].executeJavaScript(
          "document.querySelector('#reply')?.textContent === 'installed backend replied'",
        )),
      "real backend reply in installed view",
    );
    const view = hosted()[0];
    await until(
      () =>
        window.contentView.children.some(
          (child) =>
            child.webContents === view &&
            child.getVisible() &&
            child.getBounds().width > 0,
        ) && view.isFocused(),
      "native hosted view",
    );
    assert.equal(await view.executeJavaScript("typeof process"), "undefined");
    assert.notEqual(view.getOSProcessId(), core.getOSProcessId());
    return view;
  };
  const checks = [];
  try {
    window.focus();
    await until(
      () => ptys.length === 1 && ptys[0].output.length > 0,
      "initial PTY",
    );
    await until(
      () => js("!!document.querySelector('.terminal-surface canvas')"),
      "Surface",
    );
    await js(
      "window.__compositionCanvas = document.querySelector('.terminal-surface canvas')",
    );
    menu("Toggle Snippets");
    await until(
      () =>
        js(
          "document.querySelector('#settings-tab-extensions')?.getAttribute('aria-selected') === 'true' && document.querySelector('.settings-snippets-notice')?.hidden === false",
        ),
      "absent optional Snippets opens management",
    );
    assert.equal(hosted().length, 0);
    assert.equal(children.length, 0);
    assert.equal(
      await js("document.querySelectorAll('.snippets-view').length"),
      0,
    );
    await closeSettings();
    checks.push("optional-snippets-management-no-activation");
    await management();
    await button("Install local .omxext…");
    await installed();
    assert.equal(approvalCount(), 1);
    assert.equal(children.length, 0, "installation stays dormant");
    assert.equal(hosted().length, 0);
    checks.push("ordinary-install-trust-dormancy");
    await closeSettings();
    const view = await activate();
    assert.equal(children.length, 1);
    await view.executeJavaScript("document.querySelector('input').focus()");
    await view.insertText("retained draft");
    assert.equal(
      await view.executeJavaScript("document.querySelector('input').value"),
      "retained draft",
    );
    assert.ok(
      ptys[0].writes.every((text) => !text.includes("retained draft")),
      "child editing never reaches PTY",
    );
    if (fixture.evidence) {
      await writeFile(
        path.join(fixture.evidence, "hosted.png"),
        (await view.capturePage()).toPNG(),
      );
      await writeFile(
        path.join(fixture.evidence, "core.png"),
        (await core.capturePage()).toPNG(),
      );
    }
    checks.push("explicit-activation-hosted-backend-and-editing");
    await management();
    await button("Disable");
    await until(
      () => hosted().length === 0 && children[0].closed,
      "disable joins view and backend",
    );
    assert.deepEqual(children[0].exit, { code: 0, signal: null });
    await until(
      () =>
        js(
          "document.querySelector('.extensions-panel').textContent.includes('disabled') && ![...document.querySelectorAll('.extensions-panel button')].some(b => b.disabled)",
        ),
      "disabled management snapshot",
    );
    await button("Enable");
    await until(
      () =>
        js(
          "[...document.querySelectorAll('.extensions-panel button')].some(b => b.textContent === 'Disable' && !b.disabled)",
        ),
      "enabled management snapshot",
    );
    assert.equal(children.length, 1, "enable stays dormant");
    assert.equal(hosted().length, 0);
    await button("Uninstall");
    await until(
      () =>
        js(
          "document.querySelector('.extensions-panel').textContent.includes('uninstalled')",
        ),
      "uninstall",
    );
    await closeSettings();
    await until(
      () =>
        core.isFocused() &&
        js("!!document.activeElement?.closest('.terminal-surface')"),
      "terminal focus",
    );
    assert.equal(ptys.length, 1);
    assert.equal(ptys[0].exited, false);
    assert.equal(
      await js(
        "window.__compositionCanvas === document.querySelector('.terminal-surface canvas') && window.__compositionCanvas.getBoundingClientRect().width > 0",
      ),
      true,
    );
    await core.insertText("printf '%s\\n' 'COMPOSITION_AFTER_RETIREMENT'");
    core.sendInputEvent({ type: "keyDown", keyCode: "Enter" });
    core.sendInputEvent({ type: "keyUp", keyCode: "Enter" });
    await until(
      () => /\r?\nCOMPOSITION_AFTER_RETIREMENT\r?\n/.test(ptys[0].output),
      "same terminal still usable",
    );
    checks.push("disable-uninstall-retained-surface-pty");
    // Leave a second real epoch active: normal Quit must join it, not just a
    // backend that already stopped during the disable scenario.
    await management();
    await button("Install local .omxext…");
    await installed();
    assert.equal(approvalCount(), 2);
    assert.equal(children.length, 1, "reinstall stays dormant");
    await closeSettings();
    await activate();
    assert.equal(children.length, 2);
    assert.equal(children[1].closed, false);
    return { checks, approvals: approvalCount() };
  } catch (error) {
    if (fixture.evidence) {
      await writeFile(
        path.join(fixture.evidence, "failure.png"),
        (await core.capturePage()).toPNG(),
      ).catch(() => {});
      await writeFile(
        path.join(fixture.evidence, "failure.json"),
        JSON.stringify({ error: String(error), checks }, null, 2),
      );
    }
    throw error;
  }
}
module.exports = { runScenario };
